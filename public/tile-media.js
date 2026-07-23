// Get video CDN base URL from environment or use local path
function getVideoUrl(localPath) {
    const USE_VIDEO_CDN = window.USE_VIDEO_CDN || false;
    const VIDEO_CDN_BASE_URL = window.VIDEO_CDN_BASE_URL || '';

    if (USE_VIDEO_CDN && VIDEO_CDN_BASE_URL) {
        // Extract filename from local path and construct CDN URL
        const filename = localPath.split('/').pop();
        return `${VIDEO_CDN_BASE_URL}/${filename}`;
    }
    return localPath;
}

// Tile media mapping (videos and images for each tile)
const tileMedia = {
    0: { name: 'GO', videos: [], images: [] },
    1: { name: 'Las Vegas Raiders', videos: [getVideoUrl('/Videos/LVRaidersVid.mp4')], images: ['/images/raidersimage.png'] },
    2: { name: 'Community Cards', videos: [], images: [] },
    3: { name: 'Las Vegas Grand Prix', videos: [getVideoUrl('/Videos/LV Grand Prix.mp4'), getVideoUrl('/Videos/LV Grand Prix End (1).mp4')], images: [] },
    4: { name: 'Income Tax', videos: [], images: [] },
    5: { name: 'Las Vegas Monorail', videos: [getVideoUrl('/Videos/Monorail (1).mp4')], images: [] },
    6: { name: 'Speed Vegas Off Roading', videos: [getVideoUrl('/Videos/Offroading 1 (1).mp4')], images: ['/images/SpeedVegasOffroading.jpg', '/images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg'] },
    7: { name: 'Chance', videos: [], images: [] },
    8: { name: 'Las Vegas Golden Knights', videos: [getVideoUrl('/Videos/LV GKnights 1 (1).mp4'), getVideoUrl('/Videos/LV GKnights 2 (1).mp4'), getVideoUrl('/Videos/LV Golden Knights (1).mp4')], images: ['/images/230613231941-04-knights-stanley-cup-061323.jpg'] },
    9: { name: 'Maverick Helicopter Rides', videos: [getVideoUrl('/Videos/MavHeli 1.mp4 (1).mp4'), getVideoUrl('/Videos/MavHeli 2 (1).mp4'), getVideoUrl('/Videos/MavHeli 3 (1).mp4')], images: ['/images/HelicopterRidesNight.jpg', '/images/702-helicopters.webp'] },
    10: { name: 'JAIL', videos: [], images: [] },
    11: { name: 'Brothel', videos: [getVideoUrl('/Videos/BrothelVid (1).mp4')], images: [] },
    12: { name: 'Electric Company', videos: [], images: [] },
    13: { name: 'Bet MGM', videos: [getVideoUrl('/Videos/MGMBoxing 1 (1).mp4'), getVideoUrl('/Videos/MGMBoxing 3 (1).mp4')], images: ['/images/BetMGM-Jamie-Foxx.webp'] },
    14: { name: 'Las Vegas Monorail', videos: [getVideoUrl('/Videos/Monorail (1).mp4')], images: [] },
    15: { name: 'Bellagio', videos: [], images: ['/images/bellagio.jpg'] },
    16: { name: 'Las Vegas Aces', videos: [getVideoUrl('/Videos/WNBA (1).mp4'), getVideoUrl('/Videos/WNBAHL2 (1).mp4'), getVideoUrl('/Videos/WNBAHL3 (1).mp4'), getVideoUrl('/Videos/WNBAHL4 (1).mp4')], images: [] },
    17: { name: 'Community Cards', videos: [], images: [] },
    18: { name: 'Horseback Riding', videos: [getVideoUrl('/Videos/horse6 (1).mp4')], images: [] },
    19: { name: 'Resorts World Theatre', videos: [], images: ['/images/ResortsWorldTheater.jpg', '/images/Richling-house-of-blues-sunset.webp'] },
    20: { name: 'FREE PARKING', videos: [], images: ['/images/free parking.jpg'] },
    21: { name: 'Hard Rock Hotel', videos: [], images: [] },
    22: { name: 'Chance', videos: [], images: [] },
    23: { name: 'Wynn Las Vegas', videos: [], images: ['/images/Wynn_2_(2).jpg'] },
    24: { name: 'County Fair', videos: [], images: ['/images/County fair.png'] },
    25: { name: 'Shriners Children\'s Open', videos: [], images: [] },
    26: { name: 'Las Vegas Little White Wedding Chapel', videos: [], images: [] },
    27: { name: 'Community Cards', videos: [], images: [] },
    28: { name: 'Sphere', videos: [getVideoUrl('/Videos/Sphere (1).mp4')], images: ['/images/LasVegasSphere.jpg', '/images/thesphere.jpg', '/images/PIX-1-Exosphere-Architecture.jpg'] },
    29: { name: 'Water Works', videos: [], images: [] },
    30: { name: 'GO TO JAIL', videos: [], images: [] },
    31: { name: 'Caesars Palace', videos: [], images: ['/images/welcome-to-caesars-palace.jpg'] },
    32: { name: 'Santa Fe Hotel and Casino', videos: [], images: ['/images/santafecasino.jpg'] },
    33: { name: 'Chance', videos: [], images: [] },
    34: { name: 'Luxury Tax', videos: [], images: [] },
    35: { name: 'House of Blues', videos: [], images: ['/images/Richling-house-of-blues-sunset.webp'] },
    36: { name: 'Venetian', videos: [], images: [] },
    37: { name: 'The Cosmopolitan', videos: [], images: ['/images/cosmopolitan.jpg'] },
    38: { name: 'Las Vegas Monorail', videos: [getVideoUrl('/Videos/Monorail (1).mp4')], images: [] },
    39: { name: 'Speed Vegas Off Roading', videos: [getVideoUrl('/Videos/Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4')], images: ['/images/SpeedVegasOffroading.jpg', '/images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg'] }
};
