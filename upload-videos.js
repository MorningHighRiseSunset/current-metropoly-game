const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Read environment variables
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!BLOB_READ_WRITE_TOKEN) {
    console.error('Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.error('Run: vercel env pull .env.local');
    process.exit(1);
}

const videosDir = path.join(__dirname, 'Videos');

// Read all video files
const videoFiles = fs.readdirSync(videosDir).filter(file => file.endsWith('.mp4'));

console.log(`Found ${videoFiles.length} video files to upload`);

async function uploadVideos() {
    const uploadedUrls = [];
    
    for (const file of videoFiles) {
        const filePath = path.join(videosDir, file);
        const fileBuffer = fs.readFileSync(filePath);
        
        try {
            console.log(`Uploading ${file}...`);
            const blob = await put(file, fileBuffer, {
                access: 'public',
                token: BLOB_READ_WRITE_TOKEN,
            });
            
            console.log(`✓ Uploaded: ${file}`);
            console.log(`  URL: ${blob.url}`);
            uploadedUrls.push({ file, url: blob.url });
        } catch (error) {
            console.error(`✗ Failed to upload ${file}:`, error.message);
        }
    }
    
    // Save uploaded URLs to a file
    fs.writeFileSync('video-urls.json', JSON.stringify(uploadedUrls, null, 2));
    console.log(`\nSaved ${uploadedUrls.length} URLs to video-urls.json`);
    
    // Extract base URL from first upload
    if (uploadedUrls.length > 0) {
        const firstUrl = uploadedUrls[0].url;
        const baseUrl = firstUrl.substring(0, firstUrl.lastIndexOf('/'));
        console.log(`\nSet VIDEO_CDN_BASE_URL to: ${baseUrl}`);
    }
}

uploadVideos().catch(console.error);
