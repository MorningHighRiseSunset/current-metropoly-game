// Configuration for CDN paths
// Set USE_CDN to true after uploading models to Cloudflare R2 or similar
const USE_CDN = false;
const CDN_BASE_URL = 'https://your-r2-bucket.r2.dev/Models'; // Replace with your actual R2 public URL

module.exports = {
  USE_CDN,
  CDN_BASE_URL,
  
  // Helper function to get model path
  getModelPath(localPath) {
    if (USE_CDN && CDN_BASE_URL) {
      // Convert local path like '/Models/Cheeseburger/cheeseburger.glb' to CDN URL
      return localPath.replace('/Models', CDN_BASE_URL);
    }
    return localPath;
  }
};
