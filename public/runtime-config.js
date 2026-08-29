// Central place to configure where the browser should connect for Socket.IO.
// This MUST be a persistent Node server that runs `server.js` (not Vercel).
//
// Example (Render/Railway/Fly/etc):
//   window.RUNTIME_CONFIG.socketServerUrl = 'https://vegas-metropoly-backend.onrender.com';
//
// Local dev:
//   window.RUNTIME_CONFIG.socketServerUrl = 'http://localhost:3000';
window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {
    socketServerUrl: 'https://current-metropoly-game.onrender.com'
};

// Video CDN configuration for R2 bucket storage
window.USE_VIDEO_CDN = true;
window.VIDEO_CDN_BASE_URL = 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev';

// Model CDN configuration for R2 bucket storage
// Disabled due to SSL issues - models served from Vercel deployment
window.USE_CDN = false;
window.CDN_BASE_URL = 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Models';
