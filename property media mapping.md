# Tile Property Media Mapping

This document maps each tile property (0-39) to its associated images and videos.

## Tile Media Mapping

| Tile # | Tile Name | Videos | Images | Notes |
|--------|-----------|--------|--------|-------|
| 0 | GO | None | None | Starting tile |
| 1 | Las Vegas Raiders | Videos/LVRaidersVid.mp4, Videos/LVRaiders 2 (1).mp4, Videos/LVRaiders 3 (1).mp4, Videos/LVRaiders 4 (1).mp4, Videos/LVRaiders 5 (1).mp4 | Images/raidersimage.png | Allegiant Stadium |
| 2 | Community Cards | None | None | Chance/Community Chest space |
| 3 | Las Vegas Grand Prix | Videos/LV Grand Prix.mp4, Videos/LV Grand Prix End (1).mp4 | None | Las Vegas Motor Speedway |
| 4 | Income Tax | None | None | Tax space |
| 5 | Las Vegas Monorail | Videos/Monorail (1).mp4 | None | Transportation |
| 6 | Speed Vegas Off Roading | Videos/Offroading 1 (1).mp4 | Images/SpeedVegasOffroading.jpg, Images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg | SPEEDVEGAS |
| 7 | Chance | None | None | Chance space |
| 8 | Las Vegas Golden Knights | Videos/LV GKnights 1 (1).mp4, Videos/LV GKnights 2 (1).mp4, Videos/LV Golden Knights (1).mp4 | Images/230613231941-04-knights-stanley-cup-061323.jpg | T-Mobile Arena |
| 9 | Maverick Helicopter Rides | Videos/MavHeli 1.mp4 (1).mp4, Videos/MavHeli 2.mp4 (1).mp4, Videos/MavHeli 3.mp4 (1).mp4 | Images/helicopter image.png, Images/HelicopterRidesNight.jpg, Images/702-helicopters.webp | Helicopter tours |
| 10 | JAIL | Videos/Jailclip4.mp4, Videos/Jailclip5.mp4, Videos/jailclip6.mp4_1743296163946.mp4, Videos/Jailmoment2(cropped).mp4, Videos/jailmoment3(cropped).mp4, Videos/Imgoingtojail.mp4 | None | Jail/Just Visiting |
| 11 | Brothel | Videos/tapDancingWomen.mp4, Videos/BrothelVid (1).mp4 | Images/brothel model.png | Nevada Brothel (Fictional) |
| 12 | Electric Company | None | None | Utility |
| 13 | Bet MGM | Videos/MGMBoxing 1 (1).mp4, Videos/MGMBoxing 3 (1).mp4 | Images/BetMGM, Images/BetMGM-Jamie-Foxx.webp, Images/693695_050215-ap-mayweather-img.jpg | Betting/Boxing |
| 14 | Las Vegas Monorail | Videos/Monorail (1).mp4 | None | Transportation |
| 15 | Bellagio | None | Images/bellagio.jpg | Hotel/Casino |
| 16 | Las Vegas Aces | Videos/WNBA (1).mp4, Videos/WNBAHL2 (1).mp4, Videos/WNBAHL3 (1).mp4, Videos/WNBAHL4 (1).mp4 | None | Michelob ULTRA Arena |
| 17 | Community Cards | None | None | Chance/Community Chest space |
| 18 | Horseback Riding | Videos/horse6 (1).mp4 | None | Red Rock Canyon |
| 19 | Resorts World Theatre | Videos/Eagles_Highlights_Compressed.mp4 | Images/ResortsWorldTheater.jpg, Images/Richling-house-of-blues-sunset.webp | Resorts World |
| 20 | FREE PARKING | None | Images/free parking.jpg, Images/free parking-Photoroom.png | Free parking space |
| 21 | Chance | None | None | Chance space |
| 22 | Hard Rock Hotel | None | None | Hotel/Casino |
| 23 | Wynn Las Vegas | None | Images/Wynn_2_(2).jpg | Hotel/Casino |
| 24 | Shriners Children's Open | Videos/Shriners 1 (1).mp4, Videos/Shriners 3 (1).mp4, Videos/Shriners 4 (1).mp4 | Images/ShrinersChildrens-18-hole-2022.jpg | Golf tournament |
| 25 | Bachelor & Bachelorette Parties | None | None | Party services |
| 26 | Las Vegas Little White Wedding Chapel | None | Images/Las+Vegas+Elopement+Wedding+Champagne+Pop.webp | Wedding chapel |
| 27 | Sphere | Videos/Sphere (1).mp4 | Images/LasVegasSphere.jpg, Images/thesphere.jpg, Images/PIX-1-Exosphere-Architecture.jpg | The Sphere venue |
| 28 | Community Cards | None | None | Chance/Community Chest space |
| 29 | Water Works | None | None | Utility |
| 30 | GO TO JAIL | Videos/Imgoingtojail.mp4 | None | Go to Jail space |
| 31 | Caesars Palace | None | Images/welcome-to-caesars-palace.jpg | Hotel/Casino |
| 32 | Santa Fe Hotel and Casino | None | Images/santafecasino.jpg | Hotel/Casino |
| 33 | Chance | None | None | Chance space |
| 34 | Luxury Tax | None | Images/luxuryTax.png | Tax space |
| 35 | House of Blues | None | Images/Richling-house-of-blues-sunset.webp | Music venue |
| 36 | The Cosmopolitan | None | Images/cosmopolitan.jpg | Hotel/Casino |
| 37 | Community Cards | None | None | Chance/Community Chest space |
| 38 | Las Vegas Monorail | Videos/Monorail (1).mp4 | None | Transportation |
| 39 | Speed Vegas Off Roading | Videos/Shriners 1 (1).mp4, Videos/Shriners 3 (1).mp4, Videos/Shriners 4 (1).mp4 | Images/SpeedVegasOffroading.jpg, Images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg | SPEEDVEGAS |

## Notes

- **Video Format**: Videos are stored in the `Videos/` directory with `.mp4` extension
- **Image Format**: Images are stored in the `Images/` directory with various formats (.jpg, .png, .webp)
- **Multiple Videos**: Some tiles have multiple videos that can be randomly selected
- **Missing Media**: Some tiles do not have associated videos or images in the current implementation
- **Image Mapping**: There is no explicit `tileImages` mapping in the codebase. Images listed above are based on filename analysis and may not be officially mapped to specific tiles in the game logic
- **Video Mapping**: Videos are officially mapped in the `tileVideos` object in `game.js`

## Data Sources

- Tile names and video mappings: `game.js` (lines 111-196)
- Tile addresses: `game.js` (lines 2-23)
- Image files: `Images/` directory
- Video files: `Videos/` directory
