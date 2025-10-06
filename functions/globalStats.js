const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * Periodically calculates and updates global mining statistics.
 * Runs every day at midnight (US Eastern Time).
 */
exports.calculateGlobalStats = functions.pubsub.schedule('0 0 * * *').timeZone('America/New_York').onRun(async (context) => {
  try {
    const usersRef = admin.database().ref('/users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    let totalMined = 0;
    let activeMiners = 0;
    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000; // 24 hours ago

    if (users) {
      for (const userId in users) {
        const user = users[userId];
        if (user.totalMined) {
          totalMined += user.totalMined;
        }
        // Consider users who have mined in the last 24 hours as 'active miners'
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
