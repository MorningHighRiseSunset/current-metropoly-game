# Video Source Tracking

This document tracks whether videos are served from local files or CDN, and whether CDN videos are full originals or replacements.

## Configuration

- **USE_VIDEO_CDN**: Controlled by `window.USE_VIDEO_CDN` (set via environment or runtime)
- **CDN Base URL**: `https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev`
- **CDN Path**: `/metropoly-models/Videos/`
- **Local Path**: `/Videos/Cropped/`

## Video Path Mapping

The `getVideoUrl()` function in `public/tile-media.js` converts local paths to CDN URLs:
- Local: `/Videos/Cropped/filename.mp4`
- CDN: `https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/metropoly-models/Videos/filename.mp4`

## Recent Path Changes (Aug 2026)

The following video paths were normalized to remove spaces for CDN compatibility:

| Old Path | New Path | Reason |
|----------|----------|--------|
| `/Videos/Cropped/Offroading 1 (1).mp4` | `/Videos/Cropped/Offroading1 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/LV GKnights 1 (1).mp4` | `/Videos/Cropped/LV GKnights1 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/LV GKnights 2 (1).mp4` | `/Videos/Cropped/LV GKnights2 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/MavHeli 2 (1).mp4` | `/Videos/Cropped/MavHeli2 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/MavHeli 3 (1).mp4` | `/Videos/Cropped/MavHeli3 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/MGMBoxing 1 (1).mp4` | `/Videos/Cropped/MGMBoxing1 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/MGMBoxing 3 (1).mp4` | `/Videos/Cropped/MGMBoxing3 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/WNBA (1).mp4` | `/Videos/Cropped/WNBA1 (1).mp4` | Space removal for CDN encoding |
| `/Videos/Cropped/horse6 (1).mp4` | `/Videos/Cropped/horse6.mp4` | Removed (1) suffix |
| `/Videos/Cropped/BrothelVid (1).mp4` | `/Videos/Cropped/Brothel1.mp4` | Renamed for consistency |

## CDN vs Local Status

### Videos Using CDN URLs (when USE_VIDEO_CDN is true)
All videos in `tile-media.js` use local paths that are converted to CDN URLs at runtime via the Proxy.

### Videos Using Direct CDN URLs (bypassing conversion)
- Electric Company (position 12): Image uses direct CDN URL
- Water Works (position 29): Image uses direct CDN URL
- County Fair (position 24): Image uses direct CDN URL

### Local Files Available
The following video files exist in the local `Videos/` directory:
- 38 video files totaling ~200MB
- Some files have "(1)" suffixes indicating duplicates or versions
- One file is 0 bytes: `tapDancingWomen (1).mp4`

## Video Inventory Comparison

### Videos Referenced in tile-media.js (48 files)

| Position | Property | Video Files |
|----------|----------|-------------|
| 1 | Las Vegas Raiders | LVRaidersVid.mp4 |
| 3 | Las Vegas Grand Prix | LV Grand Prix.mp4, LV Grand Prix End (1).mp4 |
| 5 | Las Vegas Monorail | Las Vegas Monorail1.mp4, Las Vegas Monorail2.mp4 |
| 6 | Speed Vegas Off Roading | Offroading1 (1).mp4, Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4 |
| 8 | Las Vegas Golden Knights | LV GKnights1 (1).mp4, LV GKnights2 (1).mp4, LV Golden Knights (1).mp4 |
| 9 | Maverick Helicopter Rides | MavHeli2 (1).mp4, MavHeli3 (1).mp4 |
| 10 | JAIL | Imgoingtojail.mp4, Jailclip4.mp4, Jailclip5.mp4, Jailmoment2(cropped).mp4, jailclip6.mp4_1743296163946.mp4, jailmoment3(cropped).mp4 |
| 11 | Brothel | Brothel1.mp4 |
| 13 | Bet MGM | MGMBoxing1 (1).mp4, MGMBoxing3 (1).mp4 |
| 14 | Las Vegas Monorail | Las Vegas Monorail1.mp4, Las Vegas Monorail2.mp4 |
| 15 | Bellagio | Bellagio2.mp4 |
| 16 | Las Vegas Aces | WNBA1 (1).mp4, WNBAHL2 (1).mp4, WNBAHL3 (1).mp4, WNBAHL4 (1).mp4 |
| 18 | Horseback Riding | horse6.mp4 |
| 19 | Resorts World Theatre | Resorts World Theatre1.mp4, Resorts World Theatre2.mp4, Resorts World Theatre3.mp4, Resorts World Theatre4.mp4 |
| 21 | Hard Rock Hotel | Hard Rock Hotel.mp4 |
| 23 | Wynn Las Vegas | Wynn Las Vegas1.mp4, Wynn Las Vegas2.mp4, Wynn Las Vegas3.mp4 |
| 26 | Las Vegas Little White Wedding Chapel | Las Vegas Little White Wedding Chapel1.mp4, Las Vegas Little White Wedding Chapel2.mp4 |
| 28 | Sphere | Sphere1.mp4, Sphere2.mp4 |
| 30 | GO TO JAIL | Imgoingtojail.mp4, Jailclip4.mp4, Jailclip5.mp4, Jailmoment2(cropped).mp4, jailclip6.mp4_1743296163946.mp4, jailmoment3(cropped).mp4 |
| 31 | Caesars Palace | Caesars Palace1.mp4, Caesars Palace3.mp4, Caesars Palace4.mp4 |
| 32 | Santa Fe Hotel and Casino | Santa Fe Hotel And Casino1.mp4, Santa Fe Hotel And Casino2.mp4 |
| 35 | House of Blues | House Of Blues1.mp4, House Of Blues2.mp4, House Of Blues3.mp4 |
| 37 | The Cosmopolitan | The Cosmopolitan1.mp4, The Cosmopolitan2.mp4, The Cosmopolitan3.mp4 |
| 38 | Las Vegas Monorail | Las Vegas Monorail1.mp4, Las Vegas Monorail2.mp4 |
| 39 | Speed Vegas Off Roading | Offroading1 (1).mp4, Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4 |

### Local Files Available (38 files)

| File | Size | Status |
|------|------|--------|
| BrothelVid (1).mp4 | 3.9MB | ⚠️ Renamed to Brothel1.mp4 in config |
| Imgoingtojail.mp4 | 799KB | ✅ Used |
| Jailclip4.mp4 | 3.7MB | ✅ Used |
| Jailclip5.mp4 | 3.9MB | ✅ Used |
| Jailmoment2(cropped).mp4 | 2.5MB | ✅ Used |
| LV GKnights 1 (1).mp4 | 4.3MB | ⚠️ Renamed to LV GKnights1 (1).mp4 in config |
| LV GKnights 2 (1).mp4 | 4.3MB | ⚠️ Renamed to LV GKnights2 (1).mp4 in config |
| LV GKnights 3 (1).mp4 | 5.7MB | ❌ Not referenced in config |
| LV Golden Knights (1).mp4 | 4.3MB | ✅ Used |
| LV Golden Knights (2).mp4 | 4.3MB | ❌ Not referenced in config |
| LV Grand Prix End (1).mp4 | 5.7MB | ✅ Used |
| LV Grand Prix.mp4 | 4.6MB | ✅ Used |
| LVRaiders 2 (1).mp4 | 5.4MB | ❌ Not referenced in config |
| LVRaiders 3 (1).mp4 | 5.9MB | ❌ Not referenced in config |
| LVRaiders 4 (1).mp4 | 5.5MB | ❌ Not referenced in config |
| LVRaiders 5 (1).mp4 | 6.5MB | ❌ Not referenced in config |
| LVRaidersVid.mp4 | 2.6MB | ✅ Used |
| MGM 2.mp4 | 8.2MB | ❌ Not referenced in config |
| MGMBoxing 1 (1).mp4 | 4.3MB | ⚠️ Renamed to MGMBoxing1 (1).mp4 in config |
| MGMBoxing 3 (1).mp4 | 5.6MB | ⚠️ Renamed to MGMBoxing3 (1).mp4 in config |
| MavHeli 1.mp4 (1).mp4 | 4.6MB | ❌ Not referenced in config (MavHeli1 missing) |
| MavHeli 2 (1).mp4 | 3.5MB | ⚠️ Renamed to MavHeli2 (1).mp4 in config |
| MavHeli 3 (1).mp4 | 3.7MB | ⚠️ Renamed to MavHeli3 (1).mp4 in config |
| Monorail (1).mp4 | 6.1MB | ❌ Not referenced in config |
| Offroading 1 (1).mp4 | 5.8MB | ⚠️ Renamed to Offroading1 (1).mp4 in config |
| Shriners 1 (1).mp4 | 2.8MB | ❌ Not referenced in config |
| Shriners 3 (1).mp4 | 3.0MB | ❌ Not referenced in config |
| Shriners 4 (1).mp4 | 1.4MB | ❌ Not referenced in config |
| Sphere (1).mp4 | 5.5MB | ❌ Not referenced in config |
| Vegas Off-Road Experience at Speed Vegas Motorsport Park (1).mp4 | 6.2MB | ✅ Used |
| WNBA (1).mp4 | 48.9MB | ⚠️ Renamed to WNBA1 (1).mp4 in config |
| WNBAHL2 (1).mp4 | 1.0MB | ✅ Used |
| WNBAHL3 (1).mp4 | 1.6MB | ✅ Used |
| WNBAHL4 (1).mp4 | 1.5MB | ✅ Used |
| horse6 (1).mp4 | 6.3MB | ⚠️ Renamed to horse6.mp4 in config |
| jailclip6.mp4_1743296163946.mp4 | 4.8MB | ✅ Used |
| jailmoment3(cropped).mp4 | 2.9MB | ✅ Used |
| tapDancingWomen (1).mp4 | 0 bytes | ❌ Corrupted file |

### Missing Videos (Referenced in config but not in local directory)

| Video File | Property |
|------------|----------|
| Las Vegas Monorail1.mp4 | Las Vegas Monorail (positions 5, 14, 38) |
| Las Vegas Monorail2.mp4 | Las Vegas Monorail (positions 5, 14, 38) |
| Bellagio2.mp4 | Bellagio (position 15) |
| Resorts World Theatre1.mp4 | Resorts World Theatre (position 19) |
| Resorts World Theatre2.mp4 | Resorts World Theatre (position 19) |
| Resorts World Theatre3.mp4 | Resorts World Theatre (position 19) |
| Resorts World Theatre4.mp4 | Resorts World Theatre (position 19) |
| Hard Rock Hotel.mp4 | Hard Rock Hotel (position 21) |
| Wynn Las Vegas1.mp4 | Wynn Las Vegas (position 23) |
| Wynn Las Vegas2.mp4 | Wynn Las Vegas (position 23) |
| Wynn Las Vegas3.mp4 | Wynn Las Vegas (position 23) |
| Las Vegas Little White Wedding Chapel1.mp4 | Las Vegas Little White Wedding Chapel (position 26) |
| Las Vegas Little White Wedding Chapel2.mp4 | Las Vegas Little White Wedding Chapel (position 26) |
| Sphere1.mp4 | Sphere (position 28) |
| Sphere2.mp4 | Sphere (position 28) |
| Caesars Palace1.mp4 | Caesars Palace (position 31) |
| Caesars Palace3.mp4 | Caesars Palace (position 31) |
| Caesars Palace4.mp4 | Caesars Palace (position 31) |
| Santa Fe Hotel And Casino1.mp4 | Santa Fe Hotel and Casino (position 32) |
| Santa Fe Hotel And Casino2.mp4 | Santa Fe Hotel and Casino (position 32) |
| House Of Blues1.mp4 | House of Blues (position 35) |
| House Of Blues2.mp4 | House of Blues (position 35) |
| House Of Blues3.mp4 | House of Blues (position 35) |
| The Cosmopolitan1.mp4 | The Cosmopolitan (position 37) |
| The Cosmopolitan2.mp4 | The Cosmopolitan (position 37) |
| The Cosmopolitan3.mp4 | The Cosmopolitan (position 37) |

### Extra Files (In local directory but not referenced in config)

| File | Notes |
|------|-------|
| LV GKnights 3 (1).mp4 | Extra Golden Knights video |
| LV Golden Knights (2).mp4 | Extra Golden Knights video |
| LVRaiders 2 (1).mp4 | Extra Raiders video |
| LVRaiders 3 (1).mp4 | Extra Raiders video |
| LVRaiders 4 (1).mp4 | Extra Raiders video |
| LVRaiders 5 (1).mp4 | Extra Raiders video |
| MGM 2.mp4 | Extra MGM video |
| MavHeli 1.mp4 (1).mp4 | MavHeli1 (missing from config) |
| Monorail (1).mp4 | Extra Monorail video |
| Shriners 1 (1).mp4 | Shriners Children's Open video (property has no videos in config) |
| Shriners 3 (1).mp4 | Shriners Children's Open video (property has no videos in config) |
| Shriners 4 (1).mp4 | Shriners Children's Open video (property has no videos in config) |
| Sphere (1).mp4 | Extra Sphere video |
| tapDancingWomen (1).mp4 | Corrupted (0 bytes) |

## Verification Needed

To determine if CDN videos are full originals or replacements:

1. **Compare file sizes**: Check if CDN video sizes match local file sizes
2. **Compare video duration**: Check if CDN videos have same duration as originals
3. **Compare video quality**: Check if CDN videos have same resolution/bitrate as originals

## Status

- **Last Updated**: Aug 31, 2026
- **CDN Enabled**: Yes (via `window.USE_VIDEO_CDN`)
- **Path Normalization**: Complete (spaces removed for CDN compatibility)
- **Verification**: Pending (need to compare CDN vs local files)
