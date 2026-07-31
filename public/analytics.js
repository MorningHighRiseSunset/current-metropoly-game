// Vercel Analytics - Custom Event Tracking
// This file enables custom event tracking for the Metropoly game

(function() {
    // Track page views automatically via the CDN script
    // Custom event tracking can be added here as needed
    
    // Example: Track game creation
    window.trackGameCreated = function(gameId) {
        if (window.va) {
            window.va('event', 'game_created', {
                gameId: gameId
            });
        }
    };
    
    // Example: Track game joined
    window.trackGameJoined = function(gameId) {
        if (window.va) {
            window.va('event', 'game_joined', {
                gameId: gameId
            });
        }
    };
    
    // Example: Track dice roll
    window.trackDiceRoll = function(rollTotal) {
        if (window.va) {
            window.va('event', 'dice_roll', {
                total: rollTotal
            });
        }
    };
    
    // Example: Track property purchase
    window.trackPropertyPurchase = function(propertyName, price) {
        if (window.va) {
            window.va('event', 'property_purchase', {
                property: propertyName,
                price: price
            });
        }
    };
    
    console.log('Vercel Analytics initialized');
})();