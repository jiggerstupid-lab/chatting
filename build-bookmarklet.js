#!/usr/bin/env node
// build-bookmarklet.js
// Reads bookmarklet-src.js and writes:
//   - bookmarklet.min.js (the wrapped bookmarklet code)
//   - bookmarklet.html  (drag-to-bookmark installer page)

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'bookmarklet-src.js'), 'utf8');

// Simple minification: strip comments, collapse whitespace
function minify(code) {
  return code
    // Remove single-line comments (careful not to remove URLs)
    .replace(/(?<!:)\/\/(?!https?:).*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Collapse newlines and excess whitespace
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // Remove whitespace around common operators/punctuation
    .replace(/\s*([{};,=+\-*/<>!&|?:%^~\[\]])\s*/g, '$1')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim();
}

const minified = minify(src);
const bookmarklet = 'javascript:' + encodeURIComponent(minified);

fs.writeFileSync(path.join(__dirname, 'bookmarklet.min.js'), minified);

// Generate a nice installer HTML page
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GlobalChat Bookmarklet Installer</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f0f13;color:#e2e2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#1e1e2a;border-radius:20px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4)}
  .logo{font-size:56px;margin-bottom:16px}
  h1{font-size:26px;font-weight:800;margin-bottom:8px;background:linear-gradient(135deg,#6366f1,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .sub{color:#888;font-size:14px;line-height:1.6;margin-bottom:32px}
  .bookmark-btn{
    display:inline-block;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    color:#fff;
    padding:14px 28px;
    border-radius:12px;
    font-size:16px;
    font-weight:700;
    text-decoration:none;
    cursor:grab;
    box-shadow:0 4px 20px rgba(99,102,241,0.4);
    transition:transform 0.15s,box-shadow 0.15s;
    user-select:none;
  }
  .bookmark-btn:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(99,102,241,0.5)}
  .bookmark-btn:active{cursor:grabbing}
  .instructions{margin-top:28px;background:#0f0f13;border-radius:12px;padding:20px;text-align:left}
  .instructions h2{font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px}
  .step{display:flex;gap:12px;margin-bottom:10px;align-items:flex-start;font-size:13px;color:#aaa;line-height:1.5}
  .step-num{background:#6366f1;color:#fff;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}
  .warning{margin-top:20px;font-size:12px;color:#555;line-height:1.5}
  code{background:#0f0f13;padding:2px 6px;border-radius:4px;font-size:12px;color:#a78bfa}
</style>
</head>
<body>
<div class="card">
  <div class="logo">💬</div>
  <h1>GlobalChat</h1>
  <p class="sub">A global chatroom that floats on top of any website.<br>Just drag the button to your bookmarks bar.</p>

  <a class="bookmark-btn" href="${bookmarklet}" onclick="return false;">
    💬 GlobalChat
  </a>

  <div class="instructions">
    <h2>How to install</h2>
    <div class="step">
      <div class="step-num">1</div>
      <div>Make sure your <strong>bookmarks bar is visible</strong> (Ctrl+Shift+B / Cmd+Shift+B)</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div><strong>Drag</strong> the <code>💬 GlobalChat</code> button above into your bookmarks bar</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div>Visit <strong>any website</strong> and click the bookmark to open the chat panel</div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div>Pick a username on your first visit — you're saved automatically after that</div>
    </div>
  </div>

  <p class="warning">
    ⚙ Make sure your GlobalChat server is running at
    <code>localhost:3000</code> (or update <code>SERVER_URL</code>
    in <code>bookmarklet-src.js</code> and rebuild).
  </p>
</div>
</body>
</html>`;
 
fs.writeFileSync(path.join(__dirname, 'bookmarklet.html'), html);

console.log('✅ Built successfully!');
console.log('   bookmarklet.min.js  — the raw bookmarklet code');
console.log('   bookmarklet.html    — drag-to-install page');
console.log('\nOpen bookmarklet.html in your browser to install the bookmarklet.');
