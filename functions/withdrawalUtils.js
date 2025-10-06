
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// The Firestore instance is passed from the requiring file, which has initialized db.
let db;

function initialize(database) {
  db = database;
}

/**
 * Internal helper function to process a single withdrawal request.
 * @param {string} withdrawalId - The ID of the withdrawal document.
 * @param {string} action - 'approve' or 'reject'.
 * @param {string|null} transactionHash - The blockchain transaction hash if approving. Can be null for batch approvals.
 * @returns {Promise<string>} A result message.
 */
async function processSingleWithdrawal(withdrawalId, action, transactionHash) {
    if (!db) {
        throw new Error("Firestore has not been initialized in withdrawalUtils. Call initialize(db) first.");
    }
    // For approvals, transactionHash is now optional.
    if (!withdrawalId || !action) {
        throw new functions.https.HttpsError("invalid-argument", "Internal: Missing withdrawalId or action.");
    }

    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);

    return db.runTransaction(async (transaction) => {
        const withdrawalSnap = await transaction.get(withdrawalRef);
        if (!withdrawalSnap.exists) throw new functions.https.HttpsError("not-found", `Withdrawal request ${withdrawalId} not found.`);
        const withdrawalData = withdrawalSnap.data();
        if (withdrawalData.status !== 'pending') throw new functions.https.HttpsError("failed-precondition", `Request ${withdrawalId} is already ${withdrawalData.status}.`);

        const userRef = db.collection('users').doc(withdrawalData.uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new functions.https.HttpsError("not-found", "The requesting user no longer exists.");
        const userData = userSnap.data();

        if (action === 'approve') {
            const amountToDeduct = withdrawalData.amount;
            const currentUserWithdrawable = userData.withdrawableBalance || 0;

            // Safety Check: Automatically reject the request if the balance is insufficient.
            if (currentUserWithdrawable < amountToDeduct) {
                transaction.update(userRef, { hasPendingWithdrawal: false });
                transaction.update(withdrawalRef, {
                    status: 'rejected',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    rejectionReason: 'Insufficient funds at time of approval.'
                });
                return `Rejected withdrawal for ${withdrawalData.email} due to insufficient funds.`;
            }

            // Calculate the new balance
            const newWithdrawableBalance = currentUserWithdrawable - amountToDeduct;

            // Update user balance
            transaction.update(userRef, {
                hasPendingWithdrawal: false,
                withdrawableBalance: newWithdrawableBalance, // Deduct only from here.
                // Do not touch minedPhx and referralPhxVerified anymore!
            });

            // Update withdrawal request status
            transaction.update(withdrawalRef, {
                status: 'approved',
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                transactionHash: transactionHash || 'batch_approved'
            });
            return `Approved withdrawal for ${withdrawalData.email}. Balances updated.`;

        } else { // 'reject'
            transaction.update(userRef, { hasPendingWithdrawal: false });
            transaction.update(withdrawalRef, {
                status: 'rejected',
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return `Rejected withdrawal for ${withdrawalData.email}. Lock released.`;
        }
    });
}

module.exports = {
  initialize,
  processSingleWithdrawal,
};
