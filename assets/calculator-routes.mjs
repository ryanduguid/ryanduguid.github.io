// Old links used one page with a hash per calculator. Send them to the
// calculator's own page so bookmarks and third-party links keep working.
const target = /^#(gst|business-use|margin|break-even|hourly|variance|loan|staff|cash)$/.exec(window.location.hash);
if (target) window.location.replace(`/tools/business-calculators/${target[1]}/`);
