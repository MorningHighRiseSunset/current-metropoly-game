// Tile hover functionality
const tileHoverPreview = document.getElementById('tileHoverPreview');
const tileHoverMedia = document.getElementById('tileHoverMedia');
const tileHoverName = document.getElementById('tileHoverName');
const tileHoverType = document.getElementById('tileHoverType');
let currentVideo = null;
let hoverTimeout = null;
const lastPlayedVideos = {}; // Track last played video for each tile to prevent repeats

// Function to hide tile hover immediately (for when modals open)
function hideTileHoverImmediately() {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
    }
    if (currentVideo) {
        currentVideo.pause();
        currentVideo = null;
    }
    tileHoverMedia.innerHTML = '';
    tileHoverPreview.classList.add('hidden');
}

function showTileHover(tilePosition) {
    if (!tileMedia || !tileMedia[tilePosition]) return;
    
    const media = tileMedia[tilePosition];
    
    // Clear previous media
    if (currentVideo) {
        currentVideo.pause();
        currentVideo = null;
    }
    tileHoverMedia.innerHTML = '';
    
    // Update info
    tileHoverName.textContent = media.name;
    
    // Determine type
    let typeText = 'Space';
    if (media.videos.length > 0 || media.images.length > 0) {
        typeText = 'Property';
    }
    tileHoverType.textContent = typeText;
    
    // Show media (prefer video if available)
    if (media.videos.length > 0) {
        // Get a random video that's different from the last played one
        let randomVideo;
        const lastVideo = lastPlayedVideos[tilePosition];
        
        if (media.videos.length === 1) {
            randomVideo = media.videos[0];
        } else {
            // Filter out the last played video
            const availableVideos = media.videos.filter(v => v !== lastVideo);
            randomVideo = availableVideos[Math.floor(Math.random() * availableVideos.length)];
        }
        
        // Track this video as the last played for this tile
        lastPlayedVideos[tilePosition] = randomVideo;
        
        const video = document.createElement('video');
        // TEMP TEST: crossOrigin disabled — see game.js showPropertyInfo
        // video.crossOrigin = 'anonymous';
        video.src = randomVideo;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.controls = true;
        video.style.width = '100%';
        video.style.maxHeight = '200px';
        video.style.objectFit = 'contain'; // Changed from 'cover' to handle portrait videos
        video.style.borderRadius = '8px';
        video.style.backgroundColor = '#000'; // Add black background for letterboxing
        currentVideo = video;
        tileHoverMedia.appendChild(video);
        
        video.addEventListener('error', (e) => {
            console.error(`[Video Error] ${media.name} - Failed to load video`);
        });
    } else if (media.images.length > 0) {
        const randomImage = media.images[Math.floor(Math.random() * media.images.length)];
        const img = document.createElement('img');
        img.src = randomImage;
        img.alt = media.name;
        img.style.width = '100%';
        img.style.maxHeight = '200px';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '8px';
        tileHoverMedia.appendChild(img);
    } else {
        // No media available, show placeholder
        tileHoverMedia.innerHTML = '<div style="color: #666; font-size: 0.9rem;">No media available</div>';
    }
    
    // Show preview
    tileHoverPreview.classList.remove('hidden');
}

function hideTileHover() {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
    }
    
    hoverTimeout = setTimeout(() => {
        if (currentVideo) {
            currentVideo.pause();
            currentVideo = null;
        }
        tileHoverMedia.innerHTML = '';
        tileHoverPreview.classList.add('hidden');
    }, 300);
}

// Initialize hover handlers after board is created
function initializeTileHover() {
    const boardSpaces = document.querySelectorAll('.board-space');
    
    boardSpaces.forEach(space => {
        const position = parseInt(space.dataset.position);
        
        if (!isNaN(position) && tileMedia && tileMedia[position]) {
            space.addEventListener('mouseenter', () => {
                // Don't show hover if any modal is open
                const buyModal = document.getElementById('buyModal');
                const propertyModal = document.getElementById('propertyModal');
                if (buyModal && !buyModal.classList.contains('hidden')) return;
                if (propertyModal && !propertyModal.classList.contains('hidden')) return;
                
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }
                showTileHover(position);
            });
            
            space.addEventListener('mouseleave', () => {
                hideTileHover();
            });
        }
    });
}

// Wait for board to be created, then initialize hover
const observer = new MutationObserver((mutations) => {
    const board = document.getElementById('gameBoard');
    if (board && board.children.length > 0) {
        initializeTileHover();
        observer.disconnect();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Also try to initialize immediately in case board already exists
setTimeout(initializeTileHover, 1000);
