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

    const normalized = localPath.startsWith('/') ? localPath : `/${localPath}`;

    if (USE_VIDEO_CDN && VIDEO_CDN_BASE_URL) {
        try {
            // CDN serves from /Videos/ - replace /Videos/Cropped/ with /Videos/
            const pathForCDN = normalized.replace('/Videos/Cropped/', '/Videos/');
            // Replace spaces with %20 for CDN URLs
            const pathWithEncodedSpaces = pathForCDN.replace(/ /g, '%20');
            return `${VIDEO_CDN_BASE_URL}${pathWithEncodedSpaces}`;
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
    1: { name: 'Las Vegas Raiders', videos: ['/Videos/LVRaidersVid.mp4'], images: [] },
    2: { name: 'Community Cards', videos: [], images: [] },
    3: { name: 'Las Vegas Grand Prix', videos: ['/Videos/LV Grand Prix.mp4', '/Videos/LV Grand Prix End.mp4'], images: [] },
    4: { name: 'Income Tax', videos: [], images: [] },
    5: { name: 'Las Vegas Monorail', videos: ['/Videos/Las Vegas Monorail1.mp4', '/Videos/Las Vegas Monorail2.mp4'], images: [] },
    6: { name: 'Speed Vegas Off Roading', videos: ['/Videos/Offroading 1.mp4'], images: [] },
    7: { name: 'Chance', videos: [], images: [] },
    8: { name: 'Las Vegas Golden Knights', videos: ['/Videos/LV GKnights 1.mp4', '/Videos/LV GKnights 2.mp4', '/Videos/LV Golden Knights.mp4'], images: [] },
    9: { name: 'Maverick Helicopter Rides', videos: ['/Videos/MavHeli 2.mp4', '/Videos/MavHeli 3.mp4'], images: [] },
    10: { name: 'JAIL', videos: ['/Videos/Imgoingtojail.mp4', '/Videos/Jailclip4.mp4', '/Videos/Jailclip5.mp4', '/Videos/Jailmoment2(cropped).mp4', '/Videos/jailclip6.mp4_1743296163946.mp4', '/Videos/jailmoment3(cropped).mp4'], images: [] },
    11: { name: 'Brothel', videos: ['/Videos/BrothelVid.mp4', 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Videos/Brothel2.webm', 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Videos/Brothel3.mp4', 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Videos/Brothel4.mp4'], images: [] },
    12: { name: 'Electric Company', videos: [], images: ['/Images/yellow_light_bulb.jpg'] },
    13: { name: 'Venetian', videos: [], images: [] },
    14: { name: 'Las Vegas Monorail', videos: ['/Videos/Las Vegas Monorail1.mp4', '/Videos/Las Vegas Monorail2.mp4'], images: [] },
    15: { name: 'Bellagio', videos: ['/Videos/Cropped/Bellagio2.mp4'], images: [] },
    16: { name: 'Las Vegas Aces', videos: ['/Videos/WNBA.mp4', '/Videos/WNBAHL2.mp4', '/Videos/WNBAHL3.mp4', '/Videos/WNBAHL4.mp4'], images: [] },
    17: { name: 'Community Cards', videos: [], images: [] },
    18: { name: 'Santa Fe Hotel and Casino', videos: ['/Videos/Santa Fe Hotel And Casino1.mp4', '/Videos/Santa Fe Hotel And Casino2.mp4'], images: [] },
    19: { name: 'Resorts World Theatre', videos: ['/Videos/Resorts World Theatre1.mp4', '/Videos/Resorts World Theatre2.mp4', '/Videos/Resorts World Theatre3.mp4', '/Videos/Resorts World Theatre4.mp4'], images: [] },
    20: { name: 'FREE PARKING', videos: [], images: [] },
    21: { name: 'Hard Rock Hotel', videos: ['/Videos/Hard Rock Hotel.mp4'], images: [] },
    22: { name: 'Chance', videos: [], images: [] },
    23: { name: 'Shriners Children\'s Open', videos: ['/Videos/Shriners 1.mp4', '/Videos/Shriners 3.mp4', '/Videos/Shriners 4.mp4'], images: [] },
    24: { name: 'County Fair', videos: ['https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Videos/KHAOS%20KMG%20Afterburner%20POV%20Clark%20county%20fair_35_45.mp4', 'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Videos/YTDown.com_Shorts_CRAZY-carnival-ride-fun-exciting-statefa_Media_H-IcVGpmpwE_001_1080p.mp4'], images: [] },
    25: { name: 'Las Vegas Little White Wedding Chapel', videos: ['/Videos/Las Vegas Little White Wedding Chapel1.mp4', '/Videos/Las Vegas Little White Wedding Chapel2.mp4'], images: [] },
    26: { name: 'Community Cards', videos: [], images: [] },
    27: { name: 'Sphere', videos: ['/Videos/Sphere1.mp4', '/Videos/Sphere2.mp4'], images: [] },
    28: { name: 'Water Works', videos: [], images: ['https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Images/water%20works.png'] },
    29: { name: 'Caesars Palace', videos: ['/Videos/Caesars Palace1.mp4', '/Videos/Caesars Palace3.mp4', '/Videos/Caesars Palace4.mp4'], images: [] },
    30: { name: 'GO TO JAIL', videos: ['/Videos/Imgoingtojail.mp4', '/Videos/Jailclip4.mp4', '/Videos/Jailclip5.mp4', '/Videos/Jailmoment2(cropped).mp4', '/Videos/jailclip6.mp4_1743296163946.mp4', '/Videos/jailmoment3(cropped).mp4'], images: [] },
    31: { name: 'Luxury Tax', videos: [], images: [] },
    32: { name: 'Chance', videos: [], images: [] },
    33: { name: 'House of Blues', videos: ['/Videos/House Of Blues1.mp4', '/Videos/House Of Blues2.mp4', '/Videos/House Of Blues3.mp4'], images: [] },
    34: { name: 'Bet MGM', videos: ['/Videos/MGMBoxing 1.mp4', '/Videos/MGMBoxing 3.mp4'], images: [] },
    35: { name: 'Wynn Las Vegas', videos: ['/Videos/Wynn Las Vegas1.mp4', '/Videos/Wynn Las Vegas2.mp4', '/Videos/Wynn Las Vegas3.mp4'], images: [] },
    36: { name: 'The Cosmopolitan', videos: ['/Videos/The Cosmopolitan1.mp4', '/Videos/The Cosmopolitan2.mp4', '/Videos/The Cosmopolitan3.mp4'], images: [] },
    37: { name: 'Las Vegas Monorail', videos: ['/Videos/Las Vegas Monorail1.mp4', '/Videos/Las Vegas Monorail2.mp4'], images: [] },
    38: { name: 'Horseback Riding', videos: ['/Videos/horse6.mp4'], images: [] },
    39: { name: 'Speed Vegas Off Roading', videos: ['/Videos/Offroading 1.mp4'], images: [] }
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
