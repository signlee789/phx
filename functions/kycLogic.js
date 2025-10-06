
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// The Firestore instance is passed from the requiring file, which has initialized db.
let db;

function initialize(database) {
  db = database;
}

const submitKycRequest = async (data, context) => {
    if (!db) {
        throw new functions.https.HttpsError("internal", "KYC logic not initialized. DB is missing.");
    }
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication is required.");
    }

    const { walletAddress } = data;
    if (!walletAddress || !walletAddress.match(/^G[A-Z0-9]{55}$/)) {
        throw new functions.https.HttpsError("invalid-argument", "A valid Pi Mainnet Wallet Address is required.");
    }

    const userRef = db.collection("users").doc(uid);
    const submittedWalletRef = db.collection('submittedKycWallets').doc(walletAddress);

    try {
        await db.runTransaction(async (transaction) => {
            const submittedWalletDoc = await transaction.get(submittedWalletRef);

            if (submittedWalletDoc.exists) {
                throw new functions.https.HttpsError("already-exists", "This wallet address has already been submitted and cannot be used again.");
            }
            
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError("not-found", "User data not found. Cannot submit KYC request.");
            }

            transaction.update(userRef, {
                kycStatus: 'pending',
                kycWalletAddress: walletAddress,
                kycSubmissionTimestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.set(submittedWalletRef, {
                submittedBy: uid,
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                userEmail: userDoc.data().email
            });
        });

        return { status: "success", message: "Your KYC request has been submitted and is pending review." };

    } catch (error) {
        functions.logger.error(`KYC submission failed for UID: ${uid} with wallet ${walletAddress}`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "An unexpected error occurred while submitting your request.");
    }
};

module.exports = {
    initialize,
    submitKycRequest
};
