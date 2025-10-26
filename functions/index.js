const admin = require("firebase-admin");
const functions = require("firebase-functions");
const https = require('https');

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
const PROPOSAL_REWARD = 10.07;
const VOTING_REWARD = 0.1007;



// ===================================================================
// EXPORTED CLOUD FUNCTIONS
// ===================================================================

// ===================================================================
// INTERNAL HELPER FUNCTIONS (NOT EXPORTED)
// ===================================================================

/**
 * [CRITICAL SECURITY FUNCTION]
 * This is the single source of truth for determining if a user is eligible to create a DAO proposal.
 *
 * @param {string} uid The user ID to check.
 * @returns {Promise<{eligible: boolean, reason: string, userWallet: string|null, userData: object|null}>} An object with eligibility status and details.
 */
const _isUserEligibleForProposal = async (uid) => {
    try {
        const userDocRef = db.collection('users').doc(uid);
        const leaderboardRef = db.collection('governance').doc('leaderboard');
        
        const [userDoc, leaderboardDoc] = await Promise.all([
            userDocRef.get(),
            leaderboardRef.get()
        ]);

        if (!userDoc.exists) {
            return { eligible: false, reason: 'User data not found.', userWallet: null, userData: null };
        }
        const userData = userDoc.data();
        const userWallet = userData.walletAddress;

        if (userData.kycStatus !== 'verified') {
            return { eligible: false, reason: 'KYC is not verified.', userWallet, userData };
        }
        if (!userWallet) {
            return { eligible: false, reason: 'Stellar wallet is not registered.', userWallet, userData };
        }

        if (!leaderboardDoc.exists) {
            functions.logger.error("CRITICAL: Leaderboard document 'governance/leaderboard' not found.");
            return { eligible: false, reason: 'Leaderboard data is currently unavailable.', userWallet, userData };
        }
        
        const top100Entries = leaderboardDoc.data().top100_entries || [];
        const top100Wallets = top100Entries.map(entry => entry.address);
        
        if (!top100Wallets.includes(userWallet)) {
            return { eligible: false, reason: 'User is not in the top 100 supporters list.', userWallet, userData };
        }

        return { eligible: true, reason: 'User is eligible.', userWallet, userData };

    } catch (error) {
        functions.logger.error(`Critical error in _isUserEligibleForProposal for UID: ${uid}`, error);
        return { eligible: false, reason: 'An internal server error occurred during eligibility check.', userWallet: null, userData: null };
    }
};


// ANNOUNCEMENT FUNCTIONS
exports.getAnnouncements = functions.region('us-central1').https.onCall(async (data, context) => {
    // Fetch the data first, without database-level sorting.
    const snapshot = await db.collection('announcements').get();

    // Convert the snapshot docs into an array of objects.
    const announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sort the announcements in memory by creation time (most recent first).
    announcements.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA; // Descending order (newest on top)
    });

    return announcements; // Return the sorted data.
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
//exports.republishGraph = functions.region('us-central1').https.onCall(async (data, context) => {
    //if (context.auth?.uid !== ADMIN_UID) {
    //    throw new functions.https.HttpsError("unauthenticated", "You must be an admin.");
    //}
    //try {
    //    await graphLogic.publishGraphData();
    //    return { status: 'success', message: 'Graph data has been successfully republished to Firebase Storage.' };
    //} catch (error) {
    //    functions.logger.error("Manual republish failed:", error);
    //    throw new functions.https.HttpsError("internal", "Failed to republish graph data.");
    //}
//});

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
            transaction.set(referrerRef.collection('referredUsers').doc(userRecord.uid), { uid: userRecord.uid, email, kycVerified: false, sessions: 0, walletAdded: false, bonusPaid: false, joinedAt: now });

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


exports.onReferredUserUpdate = functions.region('us-central1').firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
        const { userId } = context.params;
        const afterData = change.after.data();
        const beforeData = change.before.data();

        const referrerUid = afterData.referredBy;

        
        if (!referrerUid) {
            functions.logger.log(`User ${userId} has no referrer. Exiting.`);
            return null;
        }

        
        const kycIsVerified = afterData.kycStatus === 'verified';
        const walletIsAdded = !!afterData.walletAddress && afterData.walletAddress.startsWith('G');
        const sessions = afterData.sessions || 0;

        
        const kycWasVerified = beforeData.kycStatus === 'verified';
        const walletWasAdded = !!beforeData.walletAddress && beforeData.walletAddress.startsWith('G');
        const sessionsBefore = beforeData.sessions || 0;

        
        if (kycIsVerified === kycWasVerified && walletIsAdded === walletWasAdded && sessions === sessionsBefore) {
            return null;
        }

        const referredUserRef = db.collection('users').doc(referrerUid).collection('referredUsers').doc(userId);
        const referrerRef = db.collection('users').doc(referrerUid);
        const MINING_SESSIONS_REQUIRED = 170;
        const REFERRAL_BONUS = 0.88;

        try {
            await db.runTransaction(async (transaction) => {
                const referrerDoc = await transaction.get(referrerRef);
                if (!referrerDoc.exists) {
                    functions.logger.warn(`Referrer ${referrerUid} not found for user ${userId}.`);
                    return;
                }

                const referredUserDoc = await transaction.get(referredUserRef);
                const referredUserData = referredUserDoc.data() || {};

                
                const syncData = {
                    email: afterData.email, 
                    kycVerified: kycIsVerified,
                    walletAdded: walletIsAdded, 
                    sessions: sessions,
                };

                
                transaction.set(referredUserRef, syncData, { merge: true });
                functions.logger.log(`SUCCESS: Synced referral data for ${userId}. Wallet status is now ${syncData.walletAdded}`);

                
                const bonusIsAlreadyPaid = referredUserData.bonusPaid === true;
                const allConditionsMet = kycIsVerified && walletIsAdded && sessions >= MINING_SESSIONS_REQUIRED;

                if (!bonusIsAlreadyPaid && allConditionsMet) {
                    transaction.update(referrerRef, {
                        referralPhxUnverified: admin.firestore.FieldValue.increment(REFERRAL_BONUS)
                    });
                    transaction.update(referredUserRef, { bonusPaid: true });
                }
            });
            return null;
        } catch (error) {
            functions.logger.error(`CRITICAL: Error in onReferredUserUpdate for user: ${userId}`, error);
            return null;
        }
    });



    exports.saveWalletAddress = functions.region('us-central1').https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
        }
        const { uid } = context.auth;
        const { walletAddress } = data;
        const address = walletAddress?.trim();
    
        // Validate the Stellar address format.
        if (!address || !address.match(/^G[A-Z0-9]{55}$/)) {
            throw new functions.https.HttpsError("invalid-argument", "Invalid Stellar wallet address format.");
        }
    
        // This function's ONLY job is to update the walletAddress on the main user document.
        // The change will then be automatically detected by the 'onReferredUserUpdate' trigger,
        // which handles all the referral-related logic. This is the correct, decoupled design.
        try {
            const userRef = db.collection('users').doc(uid);
            await userRef.update({ walletAddress: address });
            
            functions.logger.log(`Successfully saved wallet for user ${uid}. The onUpdate trigger will now handle referral sync.`);
            return { status: "success", message: "Stellar wallet address saved successfully." };
    
        } catch (error) {
            functions.logger.error(`Failed to save wallet for UID: ${uid}`, error);
            throw new functions.https.HttpsError("internal", "An unexpected error occurred while saving the wallet.");
        }
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

// --- Public API Endpoints ---
exports.circulatingSupply = functions.region('us-central1').https.onRequest(async (req, res) => {
    // Set CORS headers for public access from any origin
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      // Handle pre-flight requests for CORS
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
    } else {
        try {
            // Query the 'withdrawals' collection for completed transactions
            const withdrawalsSnapshot = await db.collection('withdrawals')
                                                  .where('status', '==', 'completed')
                                                  .get();

            let totalCirculatingSupply = 0;
            if (!withdrawalsSnapshot.empty) {
                withdrawalsSnapshot.forEach(doc => {
                    const data = doc.data();
                    // Sum the 'finalAmount' of each completed withdrawal
                    if (data.finalAmount && typeof data.finalAmount === 'number') {
                        totalCirculatingSupply += data.finalAmount;
                    }
                });
            }

            // Return the total supply as a plain text string with 7 decimal places, as required by CoinGecko
            res.set('Content-Type', 'text/plain');
            res.status(200).send(totalCirculatingSupply.toFixed(7));

        } catch (error) {
            functions.logger.error("Error calculating circulating supply:", error);
            res.status(500).send("An error occurred while calculating the supply.");
        }
    }
});

exports.totalSupply = functions.region('us-central1').https.onRequest(async (req, res) => {
    // Set CORS headers for public access
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      // Handle pre-flight requests for CORS
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
    } else {
        try {
            const usersSnapshot = await db.collection('users').get();
            let totalWithdrawableSupply = 0;

            if (!usersSnapshot.empty) {
                usersSnapshot.forEach(doc => {
                    const user = doc.data();
                    // CORRECT LOGIC: Sum the `withdrawableBalance` field from each user document.
                    totalWithdrawableSupply += user.withdrawableBalance || 0;
                });
            }

            // Return the total supply as a plain text string with 7 decimal places, as required by CoinGecko
            res.set('Content-Type', 'text/plain');
            res.status(200).send(totalWithdrawableSupply.toFixed(7));

        } catch (error) {
            functions.logger.error("Error calculating total supply:", error);
            res.status(500).send("An error occurred while calculating the total supply.");
        }
    }
});

/**
 * Fetches the donation leaderboard from the 'donations' collection.
 * This version fetches all data, then sorts and limits in memory to avoid indexing issues.
 * @returns {Promise<Array<{address: string, amount: number}>>} A sorted array of top contributors.
 */

exports.getDonationLeaderboard = functions.region('us-central1').https.onCall(async (data, context) => {
    try {
        const cacheRef = db.collection('governance').doc('leaderboard');
        const doc = await cacheRef.get();

        if (!doc.exists) {
            functions.logger.warn("Leaderboard document could not be found.");
            return [];
        }

        const leaderboardData = doc.data();
        return leaderboardData.top100_entries || [];

    } catch (error) {
        functions.logger.error("A critical error occurred while fetching the donation leaderboard:", error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch the leaderboard due to a server error.');
    }
});



const StellarSdk = require('stellar-sdk');

/**
 * Periodically checks for new XLM donations on the Stellar network and updates
 * the 'donations' collection in Firestore.
 * This function is scheduled to run every 5 minutes.
 */
exports.processStellarDonations = functions.runWith({ memory: '256MB', timeoutSeconds: 300 }).pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
    const donationAccountId = 'GBX4GLP7JCG4TPMWYXIDECIO3ZLRGSYZ6JN4XHRLNM53ZFJM34U7HDDT'; // Your project's donation address
    const cursorRef = db.collection('system').doc('donationCursor');

    try {
        const cursorDoc = await cursorRef.get();
        const lastCursor = cursorDoc.exists ? cursorDoc.data().cursor : '0';

        let newCursor = lastCursor;
        const payments = await server.payments().forAccount(donationAccountId).cursor(lastCursor).limit(200).call();

        if (payments.records.length === 0) {
            console.log("No new donations found.");
            return null;
        }

        for (const payment of payments.records) {
            // Process only successful, native XLM payments made to our account
            if (payment.type === 'payment' && payment.asset_type === 'native' && payment.to === donationAccountId) {
                const fromAddress = payment.from;
                const amount = parseFloat(payment.amount);

                // Use a transaction to safely update the donation total
                const donationRef = db.collection('donations').doc(fromAddress);
                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(donationRef);
                    if (!doc.exists) {
                        transaction.set(donationRef, { totalAmount: amount });
                    } else {
                        const existingAmount = Number(doc.data().totalAmount) || 0;
const newTotal = existingAmount + amount;
transaction.update(donationRef, { totalAmount: newTotal });
                    }
                });
                console.log(`Processed donation of ${amount} XLM from ${fromAddress}`);
            }
            newCursor = payment.paging_token;
        }

        // Save the latest cursor for the next run
        await cursorRef.set({ cursor: newCursor });

        return null;

    } catch (error) {
        console.error("Error processing Stellar donations:", error);
        // Throwing an error will cause Pub/Sub to retry the function
        throw new functions.https.HttpsError('internal', 'Failed to process donations.');
    }
});

/**
 * ===================================================================
 *                         DAO Cloud Functions
 * ===================================================================
 */

exports.getGeneralProposals = functions.https.onCall(async (data, context) => {
    try {
        const snapshot = await db.collection('proposals').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            return [];
        }
        // Map snapshot to include document ID and data
        const proposals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return proposals;
    } catch (error) {
        functions.logger.error("Error fetching general proposals:", error);
        throw new functions.https.HttpsError('internal', 'An error occurred while fetching proposals.');
    }
});


exports.createGeneralProposal = functions.https.onCall(async (data, context) => {
    // --- Final Diagnosis Step: Write all execution stages directly to Firestore ---
    const debugRef = db.collection('debug_proposal').doc('last_attempt');
    const uid = context.auth ? context.auth.uid : null;

    // 1. Authentication Check
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    // Record the start of the function call
    await debugRef.set({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'Function Invoked',
        uid: uid,
        clientData: data
    });

    // 2. Input Validation
    const { title, description } = data;
    if (!title || !description || typeof title !== 'string' || typeof description !== 'string' || title.length > 100 || description.length > 2000) {
        await debugRef.update({ status: 'Finished', result: 'Validation failed: Invalid input.' });
        throw new functions.https.HttpsError('invalid-argument', 'Title and description are required and must be within length limits.');
    }

    try {
        // 3. Server-Side Eligibility Verification (The most important part)
        const { eligible, reason, userWallet, userData } = await _isUserEligibleForProposal(uid);

        // --- Log the critical diagnostic information ---
        // This saves all the data the server used for its decision.
        await debugRef.update({
            status: 'Eligibility Check Completed',
            checkResult: { eligible, reason }, // The eligibility result
            checkedUser: { // The user info that was checked
                uid, 
                wallet: userWallet, 
                kycStatus: userData ? userData.kycStatus : 'not_found' 
            }
        });

        // 4. If not eligible, this MUST block execution.
        if (!eligible) {
            await debugRef.update({ result: `BLOCK: Proposal creation was correctly blocked. Reason: ${reason}` });
            throw new functions.https.HttpsError('failed-precondition', `You are not eligible to create a proposal. Reason: ${reason}`);
        }

        // 5. If eligible, create the proposal.
        const proposalRef = db.collection('proposals').doc();
        await proposalRef.set({
            title, description,
            proposerId: uid,
            proposerAddress: userWallet,
            proposerEmail: userData.email || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active_round1', type: 'general',
            round1Votes: {}, round2Votes: {},
            voteCounts: { round1_for: 0, round1_against: 0, round2_for: 0, round2_against: 0 }
        });
        
        // Log successful creation
        await debugRef.update({ status: 'Finished', result: 'ALLOW: Success! Proposal created.', proposalId: proposalRef.id });
        
        return { status: 'success', message: 'Your proposal has been submitted.', proposalId: proposalRef.id };

    } catch (error) {
        // Log any unexpected errors
        if (!(error instanceof functions.https.HttpsError)) {
            await debugRef.update({
                status: 'Finished',
                result: 'CRITICAL UNEXPECTED ERROR',
                errorMessage: error.message
            });
        }
        functions.logger.error('Error creating proposal:', error);
        throw error;
    }
});




// Replace the existing updateLeaderboardCache function with this one.
exports.updateLeaderboardCache = functions.runWith({ memory: '512MB', timeoutSeconds: 300 }).pubsub.schedule('every 10 minutes').onRun(async (context) => {
    functions.logger.log('Running scheduled job: updateLeaderboardCache');
    try {
        const snapshot = await db.collection('donations').get();
        
        if (snapshot.empty) {
            functions.logger.warn('Donations collection appears empty. To prevent data loss, the leaderboard cache will not be modified.');
            return null;
        }

        let leaderboard = snapshot.docs.map(doc => ({
            address: doc.id,
            amount: Number(doc.data().totalAmount) || 0
        }));
        
        leaderboard.sort((a, b) => b.amount - a.amount);
        const top100Entries = leaderboard.slice(0, 100);

        // --- NEW LOGIC: Calculate total on-chain PHX balance for the top 100 ---
        let totalTop100PhxBalance = 0;
        // Create an array of promises, each fetching the balance for one of the top 100 wallets
        const balancePromises = top100Entries.map(entry => _getOnChainPhxBalance(entry.address));
        // Wait for all balance checks to complete
        const balances = await Promise.all(balancePromises);

        // Sum up all the returned balances
        for (const balance of balances) {
            totalTop100PhxBalance += balance;
        }
        // --- END NEW LOGIC ---

        const cacheRef = db.collection('governance').doc('leaderboard');
        await cacheRef.set({
            top100_entries: top100Entries, 
            // Save the newly calculated total voting power
            total_top100_phx_balance: totalTop100PhxBalance,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        functions.logger.log(`Successfully updated leaderboard. Total PHX power for top 100: ${totalTop100PhxBalance.toFixed(2)}`);
        return null;

    } catch (error) {
        functions.logger.error('CRITICAL: Failed to update leaderboard cache. The existing cache was NOT modified.', error);
        return null;
    }
});



/**
 * Records a vote for a proposal's first round and automatically determines the outcome.
 * This function is optimized for reliability, first establishing the voter pool size
 * (Top 100 Supporters) and then using a transaction for the vote itself.
 */
exports.voteOnProposal = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check: Ensure the user is logged in.
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to vote.');
    }

    // 2. Input Validation: Check for a valid proposalId and vote option.
    const { proposalId, vote } = data;
    if (!proposalId || !['for', 'against'].includes(vote)) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid proposal ID and vote ("for" or "against") are required.');
    }

    // 3. Get Round 1 Eligible Voters (Top 100)
    // This is done before the transaction to define the static voter pool for this vote.
    const leaderboardRef = db.collection('governance').doc('leaderboard');
    let top100Wallets = [];
    try {
        const leaderboardDoc = await leaderboardRef.get();
        if (!leaderboardDoc.exists) {
            throw new functions.https.HttpsError('internal', 'Governance data is unavailable. Cannot verify voter eligibility.');
        }
        top100Wallets = (leaderboardDoc.data().top100_entries || []).map(e => e.address);
    } catch (error) {
        functions.logger.error("Failed to get leaderboard for Round 1 vote:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Could not retrieve voter eligibility list.');
    }
    
    const totalEligibleVoters = top100Wallets.length;
    if (totalEligibleVoters === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'There are no eligible voters defined yet for Round 1.');
    }

    // Define user and proposal references for the transaction
    const userRef = db.collection('users').doc(uid);
    const proposalRef = db.collection('proposals').doc(proposalId);

    try {
        // 4. Use a Firestore transaction for the atomic voting operation.
        await db.runTransaction(async (transaction) => {
            const [userDoc, proposalDoc] = await Promise.all([
                transaction.get(userRef),
                transaction.get(proposalRef)
            ]);

            // 5. Validation and Eligibility Checks inside the transaction
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Your user data could not be found.');
            }
            if (!proposalDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'The specified proposal does not exist.');
            }

            const userData = userDoc.data();
            const proposalData = proposalDoc.data();
            const userWallet = userData.walletAddress;

            // Check if the current user is in the list of eligible voters.
            if (!userWallet || !top100Wallets.includes(userWallet)) {
                throw new functions.https.HttpsError('failed-precondition', 'You are not eligible to vote in Round 1.');
            }
            // Check if the proposal is in the correct voting phase.
            if (proposalData.status !== 'active_round1') {
                throw new functions.https.HttpsError('failed-precondition', `This proposal is not in the active voting phase (Round 1). Current status: ${proposalData.status}`);
            }
            // Prevent duplicate votes.
            if (proposalData.round1Votes && proposalData.round1Votes[uid]) {
                throw new functions.https.HttpsError('already-exists', 'You have already cast your vote on this proposal.');
            }

            // 6. Record the new vote.
            const newVoteCountFor = (proposalData.voteCounts.round1_for || 0) + (vote === 'for' ? 1 : 0);
            const newVoteCountAgainst = (proposalData.voteCounts.round1_against || 0) + (vote === 'against' ? 1 : 0);

            // --- 투표 보상 지급 ---
            transaction.update(userRef, {
                withdrawableBalance: admin.firestore.FieldValue.increment(VOTING_REWARD)
            });

            let updateData = {
                [`round1Votes.${uid}`]: vote,
                'voteCounts.round1_for': newVoteCountFor,
                'voteCounts.round1_against': newVoteCountAgainst
            };

            // 7. Tally results and determine the outcome based on your rules.
            
            // PASS Condition: Votes 'for' must be MORE THAN 50% of total eligible voters.
            if (newVoteCountFor > totalEligibleVoters / 2) {
                updateData.status = 'active_round2'; // Pass! Change status to Round 2.
            }
            // FAIL Condition: Votes 'against' reach 50% or more (includes ties).
            else if (newVoteCountAgainst >= totalEligibleVoters / 2) {
                updateData.status = 'rejected'; // Fail!
            }

            // Commit all the changes to the database.
            transaction.update(proposalRef, updateData);
        });

        return { status: 'success', message: 'Your vote has been successfully recorded.' };

    } catch (error) {
        functions.logger.error(`Error casting vote for user ${uid} on proposal ${proposalId}:`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        } else {
            throw new functions.https.HttpsError('internal', 'An unexpected error occurred while casting your vote.');
        }
    }
});


/**
 * Records a vote for the second and final round of a proposal.
 * This version is enhanced for reliability by first querying the total number of
 * eligible voters and then using that number within a transaction to tally the results.
 */
exports.voteOnProposalRound2 = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check: Ensure the user is logged in.
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to vote.');
    }

    // 2. Input Validation: Check for a valid proposalId and vote option.
    const { proposalId, vote } = data;
    if (!proposalId || !['for', 'against'].includes(vote)) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid proposal ID and vote ("for" or "against") are required.');
    }

    // 3. Count Total Eligible Voters for Round 2
    let totalEligibleVoters = 0;
    try {
        const eligibleVotersSnapshot = await db.collection('users')
            .where('kycStatus', '==', 'verified')
            .get();

        // Count only users who also have a wallet address
        totalEligibleVoters = eligibleVotersSnapshot.docs.filter(doc => doc.data().walletAddress).length;

    } catch (error) {
        functions.logger.error("Failed to count eligible voters for Round 2:", error);
        throw new functions.https.HttpsError('internal', 'Could not determine the number of eligible voters.');
    }

    if (totalEligibleVoters === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'There are no users eligible to vote in the final round.');
    }

    // Define database references
    const userRef = db.collection('users').doc(uid);
    const proposalRef = db.collection('proposals').doc(proposalId);
    
    try {
        // 4. Use a Firestore transaction to ensure atomic read/write operations.
        await db.runTransaction(async (transaction) => {
            const [userDoc, proposalDoc] = await Promise.all([
                transaction.get(userRef),
                transaction.get(proposalRef)
            ]);

            // 5. Validation and Eligibility Checks inside the transaction
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Your user data could not be found.');
            }
            if (!proposalDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'The specified proposal does not exist.');
            }

            const userData = userDoc.data();
            const proposalData = proposalDoc.data();

            // Check voter's personal eligibility (KYC status and wallet)
            if (userData.kycStatus !== 'verified' || !userData.walletAddress) {
                throw new functions.https.HttpsError('failed-precondition', 'You must complete KYC and register a wallet to vote in the final round.');
            }
            // Check if the proposal is in the correct voting phase
            if (proposalData.status !== 'active_round2') {
                throw new functions.https.HttpsError('failed-precondition', `This proposal is not in the final voting phase. Current status: ${proposalData.status}`);
            }
            // Prevent duplicate voting
            if (proposalData.round2Votes && proposalData.round2Votes[uid]) {
                throw new functions.https.HttpsError('already-exists', 'You have already cast your vote in this final round.');
            }

            // --- VOTING REWARD ---
            // Grant reward for participating in the vote.
            transaction.update(userRef, {
                withdrawableBalance: admin.firestore.FieldValue.increment(VOTING_REWARD)
            });

            // 6. Record the new vote
            const newVoteCountFor = (proposalData.voteCounts.round2_for || 0) + (vote === 'for' ? 1 : 0);
            const newVoteCountAgainst = (proposalData.voteCounts.round2_against || 0) + (vote === 'against' ? 1 : 0);

            let updateData = {
                [`round2Votes.${uid}`]: vote,
                'voteCounts.round2_for': newVoteCountFor,
                'voteCounts.round2_against': newVoteCountAgainst
            };

            // 7. Tally results and determine the final outcome.
            
            // PASS Condition: Votes 'for' must be MORE THAN 50% of total eligible voters.
            if (newVoteCountFor > totalEligibleVoters / 2) {
                updateData.status = 'passed'; // Final Pass!

                // --- PROPOSER REWARD ---
                const proposerId = proposalData.proposerId;
                if (proposerId) {
                    const proposerRef = db.collection('users').doc(proposerId);
                    transaction.update(proposerRef, {
                        withdrawableBalance: admin.firestore.FieldValue.increment(PROPOSAL_REWARD)
                    });
                }
            }
            // FAIL Condition: Votes 'against' reach 50% or more (includes ties).
            else if (newVoteCountAgainst >= totalEligibleVoters / 2) {
                updateData.status = 'rejected'; // Final Fail!
            }
            
            // Commit all changes to the database
            transaction.update(proposalRef, updateData);
        });

        return { status: 'success', message: 'Your final vote has been successfully recorded.' };

    } catch (error) {
        functions.logger.error(`Error casting final vote for user ${uid} on proposal ${proposalId}:`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error; // Re-throw specific HTTPS errors to the client
        } else {
            throw new functions.https.HttpsError('internal', 'An unexpected error occurred while casting your final vote.');
        }
    }
});


/**
 * [CLIENT-FACING] Checks if the calling user is eligible to create a DAO proposal.
 * This function now securely calls the internal, single-source-of-truth function.
 */
exports.checkDaoEligibility = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to check eligibility.');
    }
    const uid = context.auth.uid;

    const { eligible } = await _isUserEligibleForProposal(uid);
    
    // Return only the 'eligible' status to the client for security and simplicity.
    return { eligible }; 
});

const PHX_ISSUER_ADDRESS = 'GA7URRUCNFMZ6SQLOLHXB26AJ43JM72Q63NC35SB2STTDHNK6EPH73LW';
const TOTAL_SUPPLY_URL = 'https://us-central1-phxlast-34481.cloudfunctions.net/totalSupply';

/**
 * Fetches the total distributed PHX supply from the given URL.
 * @returns {Promise<number>} The total supply as a number.
 */
const _fetchTotalSupply = () => {
    return new Promise((resolve, reject) => {
        https.get(TOTAL_SUPPLY_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const supply = parseFloat(data);
                if (isNaN(supply)) {
                    reject(new functions.https.HttpsError('internal', 'Failed to parse total supply.'));
                } else {
                    resolve(supply);
                }
            });
        }).on('error', (err) => {
            functions.logger.error("Error fetching total supply:", err);
            reject(new functions.https.HttpsError('internal', 'Could not fetch total supply for vote tallying.'));
        });
    });
};


/**
 * Gets the on-chain PHX balance for a given Stellar wallet address.
 * @param {string} stellarAddress The user's G... address.
 * @returns {Promise<number>} The user's PHX balance.
 */
const _getOnChainPhxBalance = async (stellarAddress) => {
    try {
        const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
        const account = await server.loadAccount(stellarAddress);
        const phxBalance = account.balances.find(b => 
            b.asset_code === 'PHX' && b.asset_issuer === PHX_ISSUER_ADDRESS
        );
        return phxBalance ? parseFloat(phxBalance.balance) : 0;
    } catch (error) {
        // If account not found on chain, balance is 0. Log other errors.
        if (error.response && error.response.status === 404) {
            return 0;
        }
        functions.logger.error(`Failed to get on-chain balance for ${stellarAddress}:`, error);
        // Return 0 to prevent vote failure, but log the issue.
        return 0; 
    }
};

exports.createTreasuryProposal = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const { title, description, amount, recipient } = data;
    if (!title || !description || !amount || !recipient ||
        typeof title !== 'string' || typeof description !== 'string' ||
        typeof amount !== 'number' || typeof recipient !== 'string' ||
        !recipient.match(/^G[A-Z0-9]{55}$/)) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid title, description, amount, and recipient address are required.');
    }

    try {
        const { eligible, reason, userWallet, userData } = await _isUserEligibleForProposal(uid);
        if (!eligible) {
            throw new functions.https.HttpsError('failed-precondition', `You are not eligible to create a proposal. Reason: ${reason}`);
        }

        const proposalRef = db.collection('treasuryProposals').doc();
        
        // --- NEW LOGIC: Set expiration for 7 days from now ---
        const now = admin.firestore.Timestamp.now();
        const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + sevenDaysInMillis);
        // --- END NEW LOGIC ---

        await proposalRef.set({
            title, description, amount, recipient,
            proposerId: uid,
            proposerAddress: userWallet,
            proposerEmail: userData.email || '',
            createdAt: now, // Use the 'now' timestamp
            expiresAt: expiresAt, // Add the new expiration field
            status: 'active_round1',
            type: 'treasury',
            round1Votes: {}, round2Votes: {},
            voteCounts: { round1_for: 0, round1_against: 0, round2_for: 0, round2_against: 0 }
        });
        
        return { status: 'success', message: 'Your treasury proposal has been submitted.', proposalId: proposalRef.id };

    } catch (error) {
        functions.logger.error('Error creating treasury proposal:', error);
        throw error;
    }
});


exports.voteOnTreasuryProposalRound1 = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');

    const { proposalId, vote } = data;
    if (!proposalId || !['for', 'against'].includes(vote)) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid proposal ID and vote required.');
    }

    const leaderboardDoc = await db.collection('governance').doc('leaderboard').get();
    if (!leaderboardDoc.exists) throw new functions.https.HttpsError('internal', 'Governance data is unavailable.');
    
    const leaderboardData = leaderboardDoc.data();
    const top100Wallets = (leaderboardData.top100_entries || []).map(e => e.address);
    const totalTop100Phx = leaderboardData.total_top100_phx_balance || 0;

    if (top100Wallets.length === 0 || totalTop100Phx === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Round 1 voting power is not initialized. Please wait a few minutes.');
    }

    const userRef = db.collection('users').doc(uid);
    const proposalRef = db.collection('treasuryProposals').doc(proposalId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const [userDoc, proposalDoc] = await Promise.all([
                transaction.get(userRef),
                transaction.get(proposalRef)
            ]);

            if (!userDoc.exists || !proposalDoc.exists) throw new functions.https.HttpsError('not-found', 'User or proposal not found.');
            
            const userData = userDoc.data();
            const proposalData = proposalDoc.data();
            const userWallet = userData.walletAddress;

            if (!userWallet || !top100Wallets.includes(userWallet)) throw new functions.https.HttpsError('failed-precondition', 'Not eligible for Round 1 vote.');
            if (proposalData.status !== 'active_round1') throw new functions.https.HttpsError('failed-precondition', `This proposal is not in the active voting phase. Current status: ${proposalData.status}`);
            if (proposalData.round1Votes && proposalData.round1Votes[uid]) throw new functions.https.HttpsError('already-exists', 'You have already voted.');

            // --- VOTING REWARD ---
            transaction.update(userRef, {
                withdrawableBalance: admin.firestore.FieldValue.increment(VOTING_REWARD)
            });

            const votingPower = await _getOnChainPhxBalance(userWallet);
            const newVoteCountFor = (proposalData.voteCounts.round1_for || 0) + (vote === 'for' ? votingPower : 0);
            const newVoteCountAgainst = (proposalData.voteCounts.round1_against || 0) + (vote === 'against' ? votingPower : 0);

            let updateData = {
                [`round1Votes.${uid}`]: { vote, power: votingPower },
                'voteCounts.round1_for': newVoteCountFor,
                'voteCounts.round1_against': newVoteCountAgainst
            };

            const passThreshold = totalTop100Phx / 2;

            if (newVoteCountFor > passThreshold) {
                updateData.status = 'active_round2';
            } 
            else if (newVoteCountAgainst >= passThreshold) {
                updateData.status = 'rejected';
            }

            transaction.update(proposalRef, updateData);
        });
        return { status: 'success', message: 'Your vote has been recorded.' };
    } catch (error) {
        functions.logger.error(`Error in Treasury vote R1 for user ${uid} on proposal ${proposalId}:`, error);
        throw error;
    }
});


exports.voteOnTreasuryProposalRound2 = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');

    const { proposalId, vote } = data;
    if (!proposalId || !['for', 'against'].includes(vote)) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid proposal ID and vote required.');
    }

    const userRef = db.collection('users').doc(uid);
    const proposalRef = db.collection('treasuryProposals').doc(proposalId);
    
    try {
        const distributedSupply = await _fetchTotalSupply();
        const passThreshold = distributedSupply / 2;

        await db.runTransaction(async (transaction) => {
            const [userDoc, proposalDoc] = await Promise.all([
                transaction.get(userRef),
                transaction.get(proposalRef)
            ]);

            if (!userDoc.exists || !proposalDoc.exists) throw new functions.https.HttpsError('not-found', 'User or proposal not found.');
            
            const userData = userDoc.data();
            const proposalData = proposalDoc.data();

            if (userData.kycStatus !== 'verified' || !userData.walletAddress) {
                throw new functions.https.HttpsError('failed-precondition', 'Must be KYC verified and have a wallet to vote.');
            }
            if (proposalData.status !== 'active_round2') {
                throw new functions.https.HttpsError('failed-precondition', 'Proposal not in Round 2 voting phase.');
            }
            if (proposalData.round2Votes && proposalData.round2Votes[uid]) {
                throw new functions.https.HttpsError('already-exists', 'You have already voted.');
            }

            // --- VOTING REWARD ---
            transaction.update(userRef, {
                withdrawableBalance: admin.firestore.FieldValue.increment(VOTING_REWARD)
            });

            const votingPower = await _getOnChainPhxBalance(userData.walletAddress);
            const newVoteCountFor = (proposalData.voteCounts.round2_for || 0) + (vote === 'for' ? votingPower : 0);
            const newVoteCountAgainst = (proposalData.voteCounts.round2_against || 0) + (vote === 'against' ? votingPower : 0);

            let updateData = {
                [`round2Votes.${uid}`]: { vote, power: votingPower },
                'voteCounts.round2_for': newVoteCountFor,
                'voteCounts.round2_against': newVoteCountAgainst
            };

            // Final Tally: Check if 'for' votes exceed 50% of total distributed supply.
            if (newVoteCountFor > passThreshold) {
                updateData.status = 'passed';
                
                // --- PROPOSER REWARD ---
                const proposerId = proposalData.proposerId;
                if (proposerId) {
                    const proposerRef = db.collection('users').doc(proposerId);
                    transaction.update(proposerRef, {
                        withdrawableBalance: admin.firestore.FieldValue.increment(PROPOSAL_REWARD)
                    });
                }
            }
            
            transaction.update(proposalRef, updateData);
        });
        return { status: 'success', message: 'Your final vote has been recorded.' };
    } catch (error) {
        functions.logger.error(`Error in Treasury vote R2 for user ${uid} on proposal ${proposalId}:`, error);
        throw error;
    }
});


/**
 * Periodically checks for expired Round 1 Treasury proposals and closes them based on the final vote count.
 * This function is scheduled to run every hour.
 */
exports.closeExpiredProposals = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    functions.logger.log('Running scheduled job: closeExpiredProposals');
    const now = admin.firestore.Timestamp.now();
    
    // Find active Round 1 proposals that have expired
    const expiredRound1ProposalsQuery = db.collection('treasuryProposals')
        .where('status', '==', 'active_round1')
        .where('expiresAt', '<=', now);
        
    try {
        const snapshot = await expiredRound1ProposalsQuery.get();
        if (snapshot.empty) {
            functions.logger.log('No expired Round 1 proposals to close.');
            return null;
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            const proposal = doc.data();
            const votesFor = proposal.voteCounts.round1_for || 0;
            const votesAgainst = proposal.voteCounts.round1_against || 0;

            let newStatus;
            // Final decision: if 'for' is strictly greater than 'against', it passes. Otherwise, it's rejected.
            if (votesFor > votesAgainst) {
                newStatus = 'active_round2';
                functions.logger.log(`Closing proposal ${doc.id} as PASSED (Round 1). For: ${votesFor}, Against: ${votesAgainst}`);
            } else {
                newStatus = 'rejected';
                functions.logger.log(`Closing proposal ${doc.id} as REJECTED (Round 1). For: ${votesFor}, Against: ${votesAgainst}`);
            }
            batch.update(doc.ref, { status: newStatus });
        });

        await batch.commit();
        functions.logger.log(`Closed ${snapshot.size} expired proposals.`);
        return null;

    } catch (error) {
        functions.logger.error('CRITICAL: Failed to close expired proposals.', error);
        return null;
    }
});
