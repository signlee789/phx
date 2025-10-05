
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const StellarSdk = require("stellar-sdk");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// --- Constants ---
// 이 코드를 복사하여 functions/transactions.js 파일의 기존 출금 함수와 교체해주세요.

const MIN_WITHDRAWAL_SESSIONS = 170; // 최소 채굴 세션 횟수
const MIN_WITHDRAWAL_AMOUNT = 37.07; // 최소 인출 금액

// 참고: PHX_ASSET 상수가 이미 파일 상단에 있는지 확인해주세요. 없다면 이 줄도 추가해야 합니다.
const PHX_ASSET = new StellarSdk.Asset("PHX", "GA7URRUCNFMZ6SQLOLHXB26AJ43JM72Q63NC35SB2STTDHNK6EPH73LW");

exports.requestWithdrawal = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to withdraw.");
    }

    const userId = request.auth.uid;
    const { amount } = request.data;

    // --- 서버 측 유효성 검사 ---
    if (typeof amount !== "number" || amount <= 0) {
        throw new HttpsError("invalid-argument", "A valid amount must be specified.");
    }

    if (amount < MIN_WITHDRAWAL_AMOUNT) {
        throw new HttpsError("failed-precondition", `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} PHX.`);
    }

    const userRef = db.collection("users").doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new HttpsError("not-found", "User data not found.");
            }
            const userData = userDoc.data();

            if (userData.hasPendingWithdrawal) {
                throw new HttpsError("failed-precondition", "A withdrawal request is already pending.");
            }
            if (userData.kycVerified !== true) {
                throw new HttpsError("failed-precondition", "KYC verification is required for withdrawals.");
            }
            if ((userData.sessions || 0) < MIN_WITHDRAWAL_SESSIONS) {
                throw new HttpsError("failed-precondition", `${MIN_WITHDRAWAL_SESSIONS} sessions required.`);
            }
            if (!userData.walletAddress) {
                throw new HttpsError("failed-precondition", "No withdrawal address is saved in Settings.");
            }

            const withdrawableBalance = (userData.minedPhx || 0) + (userData.referralPhxVerified || 0);
            if (amount > withdrawableBalance) {
                throw new HttpsError("failed-precondition", "Withdrawal amount exceeds your withdrawable balance.");
            }

            // --- 트랜잭션 내에서 상태 업데이트 ---
            const remainingBalance = withdrawableBalance - amount;
            transaction.update(userRef, {
                minedPhx: 0, // 채굴된 잔액 리셋
                referralPhxVerified: remainingBalance, // 나머지는 검증된 추천 잔액으로 이동
                hasPendingWithdrawal: true,
            });

            // 출금 요청 문서 생성
            const withdrawalRef = db.collection("withdrawals").doc();
            transaction.set(withdrawalRef, {
                userId: userId,
                amount: amount,
                address: userData.walletAddress,
                asset: PHX_ASSET.getCode(),
                issuer: PHX_ASSET.getIssuer(),
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return { success: true, message: "Withdrawal request submitted successfully." };

    } catch (error) {
        console.error("Withdrawal transaction failed for user:", userId, error);
        if (error instanceof HttpsError) {
          throw error; // HttpsError는 그대로 전달
        }
        // 그 외의 에러는 내부 서버 오류로 처리
        throw new HttpsError("internal", "An unexpected error occurred during the withdrawal process.");
    }
});


// --- Cloud Function for Mining PHX (Secrets removed) ---
exports.minePhx = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    
    const userId = request.auth.uid;
    const userRef = db.collection("users").doc(userId);
    const MINING_SESSIONS_REQUIRED = 170;
    const MINING_REWARD = 0.1007;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                transaction.set(userRef, { 
                    phxBalance: MINING_REWARD,
                    miningSessions: 1,
                    lastMined: admin.firestore.FieldValue.serverTimestamp()
                });
                return;
            }

            const data = userDoc.data();
            const lastMined = data.lastMined ? data.lastMined.toDate() : new Date(0);
            
            if (Date.now() - lastMined.getTime() < TWENTY_FOUR_HOURS_MS) {
                throw new HttpsError("failed-precondition", "You can only mine once every 24 hours.");
            }
            
            const newBalance = (data.phxBalance || 0) + MINING_REWARD;
            const newSessions = (data.miningSessions || 0) + 1;

            transaction.update(userRef, { 
                phxBalance: newBalance,
                miningSessions: newSessions,
                lastMined: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { status: "success", message: "Mining successful!" };

    } catch (error) {
        console.error("Mining transaction failed:", error);
         if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred during mining.");
    }
});
