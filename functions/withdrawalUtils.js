
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Firestore 인스턴스는 이 파일을 require하는 곳에서 초기화된 db를 전달받아 사용합니다.
let db;

function initialize(database) {
  db = database;
}

/**
 * 단일 출금 요청을 처리하는 내부 헬퍼 함수.
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

            // Safety Check: 잔액이 부족하면 자동으로 요청을 거절합니다.
            if (currentUserWithdrawable < amountToDeduct) {
                transaction.update(userRef, { hasPendingWithdrawal: false });
                transaction.update(withdrawalRef, {
                    status: 'rejected',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    rejectionReason: 'Insufficient funds at time of approval.'
                });
                return `Rejected withdrawal for ${withdrawalData.email} due to insufficient funds.`;
            }

            // 새로운 잔액 계산
            const newWithdrawableBalance = currentUserWithdrawable - amountToDeduct;

            // 사용자 잔액 업데이트
            transaction.update(userRef, {
                hasPendingWithdrawal: false,
                withdrawableBalance: newWithdrawableBalance, // 여기만 차감합니다.
                // minedPhx와 referralPhxVerified는 더 이상 건드리지 않습니다!
            });

            // 출금 요청 상태 업데이트
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
