export default async function run(page, ui) {
  // Set up network request monitoring
  const networkRequests = [];
  page.on('request', request => {
    networkRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  });
  
  // Set up console monitoring
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });
  
  // Navigate to game page directly
  await page.goto('http://localhost:3000/game.html');
  await page.waitForTimeout(5000);
  
  // Filter for ferris wheel related requests
  const ferrisWheelRequests = networkRequests.filter(req => 
    req.url.toLowerCase().includes('ferris') || 
    req.url.toLowerCase().includes('wheel')
  );
  
  // Filter for ferris wheel related console messages
  const ferrisWheelLogs = consoleMessages.filter(msg => 
    msg.text.toLowerCase().includes('ferris') || 
    msg.text.toLowerCase().includes('wheel')
  );
  
  // Check CDN configuration
  const cdnConfig = await page.evaluate(() => {
    return {
      useCdn: window.USE_CDN,
      cdnBaseUrl: window.CDN_BASE_URL,
      hasRuntimeConfig: typeof window.RUNTIME_CONFIG !== 'undefined'
    };
  });
  
  // Get page title and basic info
  const title = await page.title();
  const url = page.url();
  
  return {
    title,
    url,
    cdnConfig,
    ferrisWheelRequests,
    ferrisWheelLogs: ferrisWheelLogs.slice(0, 15), // Limit to most relevant logs
    totalNetworkRequests: networkRequests.length,
    totalConsoleMessages: consoleMessages.length
  };
}