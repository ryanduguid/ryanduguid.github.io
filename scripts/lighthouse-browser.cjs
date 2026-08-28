'use strict';

// Activating LHCI's supported Puppeteer-managed browser path avoids an
// upstream chrome-launcher temporary-profile cleanup race on Windows.
module.exports = async function usePuppeteerManagedBrowser() {};
