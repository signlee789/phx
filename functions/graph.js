const functions = require('firebase-functions');

// Firestore and Storage Bucket instances are injected from index.js
let db;
let bucket;

function initialize(database, storageBucket) {
  db = database;
  bucket = storageBucket;
}

// Admin UID (consistent with index.js)
const ADMIN_UID = 'gu2dcY575mONgAkSFhlhidH550n2';

/**
 * Publishes graph data from Firestore to a public JSON file in Firebase Storage.
 */
async function publishGraphData() {
    if (!db || !bucket) {
        throw new Error("Firestore or Storage has not been initialized. Call initialize(db, bucket) first.");
    }

    const snapshot = await db.collection('graph_data').orderBy('date', 'asc').get();
    const graphData = snapshot.docs.map(doc => doc.data());

    // Define the file in Firebase Storage.
    const file = bucket.file('graph-data.json'); 
    const contents = JSON.stringify(graphData, null, 2);

    // Save the file with appropriate metadata
    await file.save(contents, {
        metadata: {
            contentType: 'application/json',
            // Clients should revalidate frequently.
            cacheControl: 'public, max-age=300, s-maxage=600',
        },
    });

    // Make the file publicly readable. This is crucial.
    await file.makePublic();

    functions.logger.info(`Successfully published ${graphData.length} data points to Firebase Storage.`);
}

/**
 * Cloud Function handler for adding a new data point.
 */
const addGraphDataPoint = async (data, context) => {
    if (!db) {
        throw new functions.https.HttpsError("internal", "The database is not initialized.");
    }
    if (context.auth?.uid !== ADMIN_UID) {
        throw new functions.https.HttpsError("unauthenticated", "You must be an admin to perform this action.");
    }

    const { date, phxValue } = data;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new functions.https.HttpsError('invalid-argument', 'Date must be in YYYY-MM-DD format.');
    }
    if (typeof phxValue !== 'number' || phxValue < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'PHX Value must be a non-negative number.');
    }

    // Use the date as the document ID to prevent duplicates and allow easy updates
    const docRef = db.collection('graph_data').doc(date);
    await docRef.set({
        date: date,
        phxValue: phxValue,
    });

    functions.logger.info(`Graph data point for ${date} saved to Firestore.`);

    // After saving to Firestore, trigger the publication of the JSON file.
    try {
        await publishGraphData();
        return { status: 'success', message: `Data point for ${date} saved and graph data has been republished.` };
    } catch (error) {
        functions.logger.error("FATAL: Error republishing graph data:", error);
        // Even if publishing fails, the data is in Firestore. 
        // We throw an error so the client knows something went wrong with the publishing step.
        throw new functions.https.HttpsError("internal", "The data point was saved, but publishing the updated graph failed. Please try again or manually trigger a republish if the issue persists.");
    }
};

module.exports = {
    initialize,
    addGraphDataPoint,
    publishGraphData // Exporting for potential manual trigger
};
