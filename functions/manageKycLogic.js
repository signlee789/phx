const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firestore and Admin Auth instances are injected from index.js
let db;

// Admin UID (consistent with index.js)
const ADMIN_UID = 'gu2dcY575mONgAkSFhlhidH550n2';

function initialize(database) {
  db = database;
}

const manageKycRequest = async (data, context) => {
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin to perform this action.");
    }

    const { targetUid, action } = data;
    if (!targetUid || !['approve', 'reject'].includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'A target user ID and a valid action (approve/reject) are required.');
    }

    const userRef = db.collection('users').doc(targetUid);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'The specified user does not exist.');
            }

            if (action === 'approve') {
                transaction.update(userRef, {
                    kycStatus: 'verified',
                    kycVerified: true
                });
            } else { // action === 'reject'
                // Also reset the wallet address to allow the user to submit a new one.
                transaction.update(userRef, {
                    kycStatus: 'failed', // Change status to 'failed'
                    kycWalletAddress: null,
                    kycRejectionTimestamp: admin.firestore.FieldValue.serverTimestamp() // Record the rejection time
                });
            }
        });

        return { status: 'success', message: `User KYC has been ${action}ed.` };

    } catch (error) {
        functions.logger.error(`Failed to ${action} KYC for UID: ${targetUid}`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred while processing the KYC request.');
    }
};

/**
 * Calculates the total circulating supply and subtracts it from the max supply.
 * This is a read-only function callable by an admin.
 */
const calculateRemainingSupply = async (data, context) => {
    if (!db) {
        throw new functions.https.HttpsError("internal", "Database not initialized in manageKycLogic.");
    }
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin to perform this action.");
    }

    const MAX_SUPPLY = 21000000;
    let totalCirculatingSupply = 0;

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            return { remainingSupply: MAX_SUPPLY, totalCirculating: 0 };
        }

        usersSnapshot.forEach(doc => {
            // coinCount is the most reliable field for total user holdings
            totalCirculatingSupply += doc.data().coinCount || 0;
        });
        
        // To handle potential floating point inaccuracies
        totalCirculatingSupply = Math.round(totalCirculatingSupply * 10000) / 10000;

        const remainingSupply = MAX_SUPPLY - totalCirculatingSupply;

        return { 
            remainingSupply: Math.round(remainingSupply * 10000) / 10000,
            totalCirculating: totalCirculatingSupply
        };
    } catch (error) {
        functions.logger.error("Error calculating remaining supply:", error);
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred while calculating the supply.');
    }
};

module.exports = {
    initialize,
    manageKycRequest,
    calculateRemainingSupply
};