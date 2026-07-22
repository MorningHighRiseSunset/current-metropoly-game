// Configuration for CDN paths
// Models served from Cloudflare R2
const USE_CDN = true;
const CDN_BASE_URL = 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/metropoly-models/Models';

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
