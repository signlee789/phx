
const admin = require("firebase-admin");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const logger = require("firebase-functions/logger");
const sharp = require("sharp");
const path = require("path");
const os = require("os");
const fs = require("fs");

const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;

/**
 * [V2 UPGRADE] Triggered when a new image is uploaded to Cloud Storage.
 * It resizes the image and saves it to a `resized/` directory.
 */
exports.resizeImage = onObjectFinalized({ region: 'us-central1' }, async (event) => {
    const { bucket, name, contentType } = event.data;

    if (!contentType || !contentType.startsWith("image/")) {
        logger.log("This is not an image.");
        return null;
    }
    if (name.startsWith("resized/")) {
        logger.log("Already resized.");
        return null;
    }

    const storageBucket = admin.storage().bucket(bucket);
    const tempFilePath = path.join(os.tmpdir(), path.basename(name));
    const metadata = { contentType };

    try {
        await storageBucket.file(name).download({ destination: tempFilePath });
        logger.log(`Image downloaded locally to ${tempFilePath}`);

        const resizedTempPath = tempFilePath + "_resized";
        
        await sharp(tempFilePath)
            .resize(MAX_WIDTH, MAX_HEIGHT, {
                fit: sharp.fit.inside,
                withoutEnlargement: true,
            })
            .toFile(resizedTempPath);

        logger.log(`Image resized successfully.`);

        const resizedFilePath = `resized/${path.basename(name)}`;
        await storageBucket.upload(resizedTempPath, {
            destination: resizedFilePath,
            metadata: metadata,
        });

        logger.log(`Resized image uploaded to gs://${bucket}/${resizedFilePath}`);

        // Clean up temporary files
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(resizedTempPath);

        return null;

    } catch (error) {
        logger.error("Error resizing image:", error);
        // Clean up temp file on error if it exists
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        const resizedTempPath = tempFilePath + "_resized";
        if (fs.existsSync(resizedTempPath)) fs.unlinkSync(resizedTempPath);
        return null;
    }
});
