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

