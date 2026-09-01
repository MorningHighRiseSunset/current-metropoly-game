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
