const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * 주기적으로 전역 채굴 통계를 계산하고 업데이트합니다.
 * 매일 자정 (미국 동부 시간 기준)에 실행됩니다.
 */
exports.calculateGlobalStats = functions.pubsub.schedule('0 0 * * *').timeZone('America/New_York').onRun(async (context) => {
  try {
    const usersRef = admin.database().ref('/users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    let totalMined = 0;
    let activeMiners = 0;
    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000; // 24시간 전

    if (users) {
      for (const userId in users) {
        const user = users[userId];
        if (user.totalMined) {
          totalMined += user.totalMined;
        }
        // 최근 24시간 이내에 채굴한 사용자를 '활동 중인 채굴자'로 간주
        if (user.lastMined && user.lastMined > oneDayAgo) {
          activeMiners++;
        }
      }
    }

    const globalStatsRef = admin.database().ref('/globalStats/mining');
    await globalStatsRef.set({
      totalMined: totalMined,
      activeMiners: activeMiners,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
    });

    console.log('Daily global mining stats updated successfully.');
    return null;
  } catch (error) {
    console.error('Error calculating daily global mining stats:', error);
    return null;
  }
});
