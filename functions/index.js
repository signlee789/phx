const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Import individual logic files
const { initialize, processSingleWithdrawal } = require("./withdrawalUtils");
const kycLogic = require("./kycLogic");
const manageKycLogic = require("./manageKycLogic");
const graphLogic = require("./graph");

// --- Initialization ---
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Inject dependencies into modules
initialize(db, bucket);
kycLogic.initialize(db);
manageKycLogic.initialize(db);
graphLogic.initialize(db, bucket);

// --- Constants ---
const PROCESS_WITHDRAWAL_TOPIC = 'process-withdrawal-batch';
const BATCH_SIZE = 100; // Number of tasks to process at once
const MINING_SESSIONS_REQUIRED = 170;
const MINING_REWARD = 0.1007;
const REFERRAL_BONUS = 10.07;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ADMIN_UID = 'gu2dcY575mONgAkSFhlhidH550n2';
const DEFAULT_REFERRAL_UID = 'CDK9P9ZRGJZlTVkVoRytJ9aq3Hw1';
const MIN_WITHDRAWAL_AMOUNT = 37.07;
const WITHDRAWAL_FEE = 0.1;

// ===================================================================
// EXPORTED CLOUD FUNCTIONS
// ===================================================================

// ANNOUNCEMENT FUNCTIONS
exports.getAnnouncements = functions.region('us-central1').https.onCall(async (data, context) => {
    // 데이터베이스 정렬(.orderBy)을 제거하고, 데이터를 먼저 가져옵니다.
    const snapshot = await db.collection('announcements').get();

    // 가져온 데이터를 map으로 변환합니다.
    const announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 코드 내에서 직접 시간순으로 정렬합니다. (최신순)
    announcements.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA; // 내림차순 (최신이 위로)
    });

    return announcements; // 정렬된 데이터를 반환합니다.
});

exports.addAnnouncement = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin.");
    }
    const { title, content } = data;
    const newAnnouncement = {
        title, content,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('announcements').add(newAnnouncement);
    return { id: docRef.id, ...newAnnouncement };
});

exports.updateAnnouncement = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin.");
    }
    const { id, title, content } = data;
    await db.collection('announcements').doc(id).update({ title, content });
    return { status: 'success' };
});

exports.deleteAnnouncement = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin.");
    }
    await db.collection('announcements').doc(data.id).delete();
    return { status: 'success' };
});

// GRAPH FUNCTIONS
exports.addGraphDataPoint = functions.region('us-central1').https.onCall(graphLogic.addGraphDataPoint);
exports.republishGraph = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin.");
    }
    try {
        await graphLogic.publishGraphData();
        return { status: 'success', message: 'Graph data has been successfully republished to Firebase Storage.' };
    } catch (error) {
        functions.logger.error("Manual republish failed:", error);
        throw new functions.https.HttpsError("internal", "Failed to republish graph data.");
    }
});

// USER REGISTRATION & KYC
exports.registerUser = functions.region('us-central1').https.onCall(async (data, context) => {
    const { email, password, referralCode } = data;
    if (!email || !password || password.length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid email and password (min 6 chars) required.');
    }
    const referralUid = referralCode?.trim() || DEFAULT_REFERRAL_UID;
    const referrerRef = db.collection('users').doc(referralUid);
    let userRecord;
    try {
        await db.runTransaction(async (transaction) => {
            const referrerSnap = await transaction.get(referrerRef);
            if (!referrerSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Invalid referral code.');
            }
            userRecord = await admin.auth().createUser({ email, password });
            const newUserRef = db.collection('users').doc(userRecord.uid);
            const now = admin.firestore.FieldValue.serverTimestamp();
            transaction.set(newUserRef, { email, uid: userRecord.uid, createdAt: now, referredBy: referralUid, referralPhxVerified: REFERRAL_BONUS, referralPhxUnverified: 0, minedPhx: 0, sessions: 0, kycStatus: "not_submitted", kycVerified: false, lastMineTime: null, walletAddress: null, withdrawableBalance: REFERRAL_BONUS });
            transaction.update(referrerRef, { referralPhxUnverified: admin.firestore.FieldValue.increment(REFERRAL_BONUS) });
            transaction.set(referrerRef.collection('referredUsers').doc(userRecord.uid), { uid: userRecord.uid, email, kycVerified: false, joinedAt: now });
        });
    } catch (error) {
        if (userRecord) await admin.auth().deleteUser(userRecord.uid).catch(e => functions.logger.error('Cleanup failed for user', userRecord.uid, e));
        functions.logger.error(`Registration failed for ${email}:`, error);
        if (error.code === 'auth/email-already-exists') throw new functions.https.HttpsError('already-exists', 'Email is already in use.');
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Registration failed. Please try again.');
    }
    return { status: 'success', uid: userRecord.uid };
});

exports.onUserKycUpdate = functions.region('us-central1').firestore.document('users/{userId}').onUpdate(async (change, context) => {
    const { userId } = context.params;
    const before = change.before.data();
    const after = change.after.data();
    if (before.kycVerified === false && after.kycVerified === true) {
        functions.logger.info(`KYC verified for ${userId}. Processing referral bonus.`);
        const referrerUid = after.referredBy;
        if (!referrerUid) return null;
        const referrerRef = db.collection('users').doc(referrerUid);
        try {
            await db.runTransaction(async (transaction) => {
                const referrerSnap = await transaction.get(referrerRef);
                if (!referrerSnap.exists) return;
                transaction.update(referrerRef, { referralPhxUnverified: admin.firestore.FieldValue.increment(-REFERRAL_BONUS), referralPhxVerified: admin.firestore.FieldValue.increment(REFERRAL_BONUS), withdrawableBalance: admin.firestore.FieldValue.increment(REFERRAL_BONUS) });
                transaction.update(referrerRef.collection('referredUsers').doc(userId), { kycVerified: true });
            });
        } catch (error) {
            functions.logger.error(`Bonus conversion failed for referrer ${referrerUid}`, error);
        }
    }
    return null;
});

exports.submitKycRequest = functions.region('us-central1').https.onCall(kycLogic.submitKycRequest);
exports.manageKycRequest = functions.region('us-central1').https.onCall(manageKycLogic.manageKycRequest);
exports.calculateRemainingSupply = functions.region('us-central1').https.onCall(manageKycLogic.calculateRemainingSupply);

// MINING & CORE APP LOGIC
exports.minePhx = functions.region('us-central1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.Timestamp.now();
    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new functions.https.HttpsError("not-found", "User not found.");
            const { lastMineTime } = userDoc.data();
            if (lastMineTime && (now.toMillis() - lastMineTime.toMillis() < TWENTY_FOUR_HOURS_MS)) {
                throw new functions.https.HttpsError("failed-precondition", "Can only mine once every 24 hours.");
            }
            transaction.update(userRef, { minedPhx: admin.firestore.FieldValue.increment(MINING_REWARD), withdrawableBalance: admin.firestore.FieldValue.increment(MINING_REWARD), sessions: admin.firestore.FieldValue.increment(1), lastMineTime: now });
        });
        return { status: "success" };
    } catch (error) {
        functions.logger.error(`Mining failed for ${uid}`, error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", "An error occurred while mining.");
    }
});

exports.requestWithdrawal = functions.region('us-central1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    const { amount } = data;
    if (typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid amount.");
    }
    const userRef = db.collection('users').doc(uid);
    const withdrawalRef = db.collection('withdrawals').doc();
    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new functions.https.HttpsError("not-found", "User not found.");
            const userData = userDoc.data();
            if (userData.hasPendingWithdrawal) throw new functions.https.HttpsError("failed-precondition", "A withdrawal is already pending.");
            if (!userData.kycVerified) throw new functions.https.HttpsError("failed-precondition", "KYC not verified.");
            if ((userData.sessions || 0) < MINING_SESSIONS_REQUIRED) throw new functions.https.HttpsError("failed-precondition", `${MINING_SESSIONS_REQUIRED} sessions required.`);
            if (!userData.walletAddress) throw new functions.https.HttpsError("failed-precondition", "PHX wallet address not saved.");
            if (amount < MIN_WITHDRAWAL_AMOUNT) throw new functions.https.HttpsError("invalid-argument", `Minimum withdrawal is ${MIN_WITHDRAWAL_AMOUNT} PHX.`);
            if (amount + WITHDRAWAL_FEE > (userData.withdrawableBalance || 0)) throw new functions.https.HttpsError("invalid-argument", "Insufficient balance for amount and fee.");
            transaction.update(userRef, { hasPendingWithdrawal: true });
            transaction.set(withdrawalRef, { uid, amount, fee: WITHDRAWAL_FEE, finalAmount: amount - WITHDRAWAL_FEE, email: userData.email, destinationAddress: userData.walletAddress, status: 'pending', requestedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        return { status: "success", message: "Withdrawal request submitted." };
    } catch (error) {
        functions.logger.error(`Withdrawal request failed for ${uid}`, error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", "An error occurred during withdrawal request.");
    }
});

// ADMIN & BATCH PROCESSING FUNCTIONS
exports.grantAdminRole = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) throw new functions.https.HttpsError("unauthenticated", "Admin only.");
    const { targetEmail } = data;
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        return { message: `${targetEmail} is now an admin.` };
    } catch (error) {
        throw new functions.https.HttpsError("internal", `Failed to grant admin role: ${error.message}`);
    }
});

exports.forceKycUpdateCheck = functions.region('us-central1').https.onCall(async(data, context) => {
    if (context.auth?.uid !== ADMIN_UID) throw new functions.https.HttpsError("unauthenticated", "Admin only.");
    const { userId } = data;
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) throw new functions.https.HttpsError("not-found", "User not found.");
    if (userSnap.data().kycVerified !== true) throw new functions.https.HttpsError("failed-precondition", "Can only be run on a kyc-verified user.");
    const change = functions.Change.fromObjects({ ...userSnap.data(), kycVerified: false }, { ...userSnap.data(), kycVerified: true });
    await exports.onUserKycUpdate(change, { params: { userId } });
    return { status: "success", message: `Manually triggered KYC update for ${userId}.`};
});

exports.processWithdrawal = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) throw new functions.https.HttpsError("unauthenticated", "Admin only.");
    const { withdrawalId, action, transactionHash } = data;
    try {
        return { status: 'success', message: await processSingleWithdrawal(withdrawalId, action, transactionHash) };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", `Error processing withdrawal: ${error.message}`);
    }
});

exports.processAllWithdrawalsManager = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) throw new functions.https.HttpsError("unauthenticated", "Admin only.");
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) return { status: "success", message: "No pending withdrawals to process." };
    const withdrawalIds = snapshot.docs.map(doc => doc.id);
    const pubSubClient = new (require('@google-cloud/pubsub').PubSub)();
    const promises = [];
    for (let i = 0; i < withdrawalIds.length; i += BATCH_SIZE) {
        const message = Buffer.from(JSON.stringify({ batch: withdrawalIds.slice(i, i + BATCH_SIZE) }));
        promises.push(pubSubClient.topic(PROCESS_WITHDRAWAL_TOPIC).publishMessage({ data: message }));
    }
    await Promise.all(promises);
    return { status: "success", message: `Queued ${withdrawalIds.length} withdrawals for processing.` };
});

exports.processWithdrawalBatchWorker = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).pubsub.topic(PROCESS_WITHDRAWAL_TOPIC).onPublish(async (message) => {
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const batchIds = JSON.parse(decodedData).batch;
    functions.logger.info(`Worker received batch of ${batchIds.length} withdrawals to process.`);
    const promises = batchIds.map(id => 
        processSingleWithdrawal(id, 'approve', null)
            .catch(e => {
                functions.logger.error(`Error processing withdrawal ${id} in batch.`, e);
                return `Failed ${id}: ${e.message}`; 
            })
    );
    const results = await Promise.all(promises);
    functions.logger.info(`Finished processing batch of ${batchIds.length}. Results:`, results);
});

exports.exportPendingWithdrawalsCSV = functions.region('us-central1').https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-control-Allow-Headers', 'Authorization');
        return res.status(204).send('');
    }
    try {
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.admin !== true) return res.status(403).send('Forbidden: Admin only.');
        const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').orderBy('requestedAt', 'desc').get();
        if (snapshot.empty) return res.status(404).send('No pending withdrawals found.');
        const csvContent = [
            ['Destination Address', 'Amount'].join(','),
            ...snapshot.docs.map(doc => [`'${doc.data().destinationAddress}'`, doc.data().finalAmount].join(','))
        ].join('\\r\\n');
        res.setHeader('Content-Disposition', `attachment; filename="pending_withdrawals_${new Date().toISOString()}.csv"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        return res.send(csvContent);
    } catch (error) {
        functions.logger.error("Error exporting CSV:", error);
        if (error.code === 'auth/id-token-expired') return res.status(401).send('Unauthorized: Token expired.');
        return res.status(500).send("Failed to export CSV.");
    }
});

exports.migrateUsersToWithdrawableBalance = functions.region('us-central1').https.onCall(async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin to run this migration.");
    }
    const batchSize = 200;
    const usersRef = db.collection('users');
    let lastDoc = null;
    let usersProcessed = 0;
    functions.logger.info("Starting user migration to add withdrawableBalance.");
    try {
        while (true) {
            const query = lastDoc ? usersRef.orderBy(admin.firestore.FieldPath.documentId()).startAfter(lastDoc).limit(batchSize) : usersRef.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
            const snapshot = await query.get();
            if (snapshot.empty) break;
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                const userData = doc.data();
                if (userData.withdrawableBalance === undefined) {
                    const calculatedBalance = (userData.minedPhx || 0) + (userData.referralPhxVerified || 0);
                    batch.update(doc.ref, { withdrawableBalance: calculatedBalance });
                    usersProcessed++;
                }
            });
            await batch.commit();
            if (snapshot.docs.length < batchSize) break;
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }
        const message = `Migration completed successfully. Processed and updated ${usersProcessed} users.`;
        functions.logger.info(message);
        return { status: 'success', message: message };
    } catch (error) {
        functions.logger.error("Error during user migration:", error);
        throw new functions.https.HttpsError("internal", "An error occurred during the migration process.");
    }
});