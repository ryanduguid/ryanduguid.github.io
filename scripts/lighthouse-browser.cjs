// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

'use strict';

// Activating LHCI's supported Puppeteer-managed browser path avoids an
// upstream chrome-launcher temporary-profile cleanup race on Windows.
module.exports = async function usePuppeteerManagedBrowser() {};
