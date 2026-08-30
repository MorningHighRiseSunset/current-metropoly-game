// Get video CDN base URL from environment or use local path

/*
// TEMP DEBUG — remove after diagnosing video load failures
window.__VIDEO_DEBUG__ = window.__VIDEO_DEBUG__ || {
    configFromApi: null,
    configFromRuntime: null,
    scriptSources: {},
    urlConstructions: [],
    assignments: []
};

function logVideoUrlConstruction(localPath, result, context) {
    const entry = {
        at: new Date().toISOString(),
        localPath,
        result,
        useVideoCdn: window.USE_VIDEO_CDN,
        cdnBaseUrl: window.VIDEO_CDN_BASE_URL,
        ...context
    };
    window.__VIDEO_DEBUG__.urlConstructions.push(entry);
    console.group('[Video Debug] getVideoUrl');
    console.log('localPath:', localPath);
    console.log('USE_VIDEO_CDN:', window.USE_VIDEO_CDN);
    console.log('VIDEO_CDN_BASE_URL (at construction):', window.VIDEO_CDN_BASE_URL);
    console.log('constructed URL:', result);
    try {
        console.log('protocol:', new URL(result, window.location.href).protocol);
    } catch (e) {
        console.log('protocol: (could not parse URL)', e.message);
    }
    console.groupEnd();
    return result;
}
*/

function getVideoUrl(localPath) {
    if (!localPath) return localPath;
    if (/^https?:\/\//i.test(localPath)) {
        return localPath.replace(/^http:\/\//i, 'https://');
    }

    const USE_VIDEO_CDN = window.USE_VIDEO_CDN || false;
    let VIDEO_CDN_BASE_URL = (window.VIDEO_CDN_BASE_URL || '').trim();
    VIDEO_CDN_BASE_URL = VIDEO_CDN_BASE_URL.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');

    // Remove /Videos/ prefix if present
    let normalized = localPath.startsWith('/') ? localPath : `/${localPath}`;
    normalized = normalized.replace(/^\/Videos\//i, '/');

    if (USE_VIDEO_CDN && VIDEO_CDN_BASE_URL) {
        try {
            return new URL(normalized.replace(/^\//, ''), `${VIDEO_CDN_BASE_URL}/`).href;
        } catch (e) {
            const parts = normalized.split('/');
            const filename = encodeURIComponent(parts.pop());
            return `${VIDEO_CDN_BASE_URL}${parts.join('/')}/${filename}`;
        }
    }

    const parts = normalized.split('/');
    const filename = encodeURIComponent(parts.pop());
    return `${parts.join('/')}/${filename}`;
}

// Tile media mapping (videos and images for each tile)
// Store local paths, convert to CDN URLs on access
const tileMediaRaw = {
    0: { name: 'GO', videos: [], images: [] },
    1: { name: 'Las Vegas Raiders', videos: ['LVRaidersVid.mp4'], images: ['/images/raidersimage.png'] },
    2: { name: 'Community Cards', videos: [], images: [] },
    3: { name: 'Las Vegas Grand Prix', videos: ['LV Grand Prix.mp4', 'LV Grand Prix End (1).mp4'], images: [] },
    4: { name: 'Income Tax', videos: [], images: [] },
    5: { name: 'Las Vegas Monorail', videos: ['Las Vegas Monorail1.mp4', 'Las Vegas Monorail2.mp4'], images: [] },
    6: { name: 'Speed Vegas Off Roading', videos: ['Offroading 1 (1).mp4', 'Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4'], images: ['/images/SpeedVegasOffroading.jpg', '/images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg'] },
    7: { name: 'Chance', videos: [], images: [] },
    8: { name: 'Las Vegas Golden Knights', videos: ['LV GKnights 1 (1).mp4', 'LV GKnights 2 (1).mp4', 'LV Golden Knights (1).mp4'], images: ['/images/230613231941-04-knights-stanley-cup-061323.jpg'] },
    9: { name: 'Maverick Helicopter Rides', videos: ['MavHeli 2 (1).mp4', 'MavHeli 3 (1).mp4'], images: ['/images/HelicopterRidesNight.jpg', '/images/702-helicopters.webp'] },
    10: { name: 'JAIL', videos: ['Imgoingtojail.mp4', 'Jailclip4.mp4', 'Jailclip5.mp4', 'Jailmoment2(cropped).mp4', 'jailclip6.mp4_1743296163946.mp4', 'jailmoment3(cropped).mp4'], images: ['/images/17509129_web1_INMATE-WHISPERER-FEB28-23__001-1.webp'] },
    11: { name: 'Brothel', videos: ['BrothelVid (1).mp4'], images: [] },
    12: { name: 'Electric Company', videos: [], images: ['/images/yellow_light_bulb.jpg'] },
    13: { name: 'Bet MGM', videos: ['MGMBoxing 1 (1).mp4', 'MGMBoxing 3 (1).mp4'], images: ['/images/BetMGM.jpg'] },
    14: { name: 'Las Vegas Monorail', videos: ['Las Vegas Monorail1.mp4', 'Las Vegas Monorail2.mp4'], images: [] },
    15: { name: 'Bellagio', videos: ['Bellagio2.mp4'], images: ['/images/bellagio.jpg'] },
    16: { name: 'Las Vegas Aces', videos: ['WNBA (1).mp4', 'WNBAHL2 (1).mp4', 'WNBAHL3 (1).mp4', 'WNBAHL4 (1).mp4'], images: [] },
    17: { name: 'Community Cards', videos: [], images: [] },
    18: { name: 'Horseback Riding', videos: ['horse6 (1).mp4'], images: [] },
    19: { name: 'Resorts World Theatre', videos: ['Resorts World Theatre1.mp4', 'Resorts World Theatre2.mp4', 'Resorts World Theatre3.mp4', 'Resorts World Theatre4.mp4'], images: ['/images/ResortsWorldTheater.jpg', '/images/Richling-house-of-blues-sunset.webp'] },
    20: { name: 'FREE PARKING', videos: [], images: ['/images/free parking.jpg'] },
    21: { name: 'Hard Rock Hotel', videos: ['Hard Rock Hotel.mp4'], images: [] },
    22: { name: 'Chance', videos: [], images: [] },
    23: { name: 'Wynn Las Vegas', videos: ['Wynn Las Vegas1.mp4', 'Wynn Las Vegas2.mp4', 'Wynn Las Vegas3.mp4'], images: ['/images/Wynn_2_(2).jpg'] },
    24: { name: 'County Fair', videos: [], images: ['https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Images/clark%20county%20fair.jpg'] },
    25: { name: 'Shriners Children\'s Open', videos: [], images: [] },
    26: { name: 'Las Vegas Little White Wedding Chapel', videos: ['Las Vegas Little White Wedding Chapel1.mp4', 'Las Vegas Little White Wedding Chapel2.mp4'], images: [] },
    27: { name: 'Community Cards', videos: [], images: [] },
    28: { name: 'Sphere', videos: ['Sphere1.mp4', 'Sphere2.mp4'], images: ['/images/LasVegasSphere.jpg', '/images/thesphere.jpg', '/images/PIX-1-Exosphere-Architecture.jpg'] },
    29: { name: 'Water Works', videos: [], images: ['/images/water works.png'] },
    30: { name: 'GO TO JAIL', videos: ['Imgoingtojail.mp4', 'Jailclip4.mp4', 'Jailclip5.mp4', 'Jailmoment2(cropped).mp4', 'jailclip6.mp4_1743296163946.mp4', 'jailmoment3(cropped).mp4'], images: ['/images/17509129_web1_INMATE-WHISPERER-FEB28-23__001-1.webp'] },
    31: { name: 'Caesars Palace', videos: ['Caesars Palace1.mp4', 'Caesars Palace3.mp4', 'Caesars Palace4.mp4'], images: ['/images/welcome-to-caesars-palace.jpg'] },
    32: { name: 'Santa Fe Hotel and Casino', videos: ['Santa Fe Hotel And Casino1.mp4', 'Santa Fe Hotel And Casino2.mp4'], images: ['/images/santafecasino.jpg'] },
    33: { name: 'Chance', videos: [], images: [] },
    34: { name: 'Luxury Tax', videos: [], images: [] },
    35: { name: 'House of Blues', videos: ['House Of Blues1.mp4', 'House Of Blues2.mp4', 'House Of Blues3.mp4'], images: ['/images/Richling-house-of-blues-sunset.webp'] },
    36: { name: 'Venetian', videos: [], images: [] },
    37: { name: 'The Cosmopolitan', videos: ['The Cosmopolitan1.mp4', 'The Cosmopolitan2.mp4', 'The Cosmopolitan3.mp4'], images: ['/images/cosmopolitan.jpg'] },
    38: { name: 'Las Vegas Monorail', videos: ['Las Vegas Monorail1.mp4', 'Las Vegas Monorail2.mp4'], images: [] },
    39: { name: 'Speed Vegas Off Roading', videos: ['Offroading 1 (1).mp4', 'Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4'], images: ['/images/SpeedVegasOffroading.jpg', '/images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg'] }
};

// Proxy to convert URLs on access
const tileMedia = new Proxy(tileMediaRaw, {
    get(target, prop) {
        const value = target[prop];
        if (value && typeof value === 'object') {
            const result = { ...value };
            // Convert video URLs on access
            if (value.videos && Array.isArray(value.videos)) {
                result.videos = value.videos.map(getVideoUrl);
            }
            // Convert image URLs on access
            if (value.images && Array.isArray(value.images)) {
                result.images = value.images.map(getVideoUrl);
            }
            return result;
        }
        return value;
    }
});
