// ─────────────────────────────────────────────────────────────────────────────
// GlobalChat Bookmarklet  –  bookmarklet-src.js
// Server URL is entered by the user in the UI and saved to localStorage.
// Run `node build-bookmarklet.js` to generate the minified bookmarklet.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Only inject once per page
  if (document.getElementById('__globalchat__')) {
    document.getElementById('__globalchat__').style.display = 'flex';
    return;
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────
  const LS_TOKEN  = '__gc_token__';
  const LS_USER   = '__gc_user__';
  const LS_SERVER = '__gc_server__';

  function getStorage(k)    { try { return localStorage.getItem(k); } catch { return null; } }
  function setStorage(k, v) { try { localStorage.setItem(k, v); }    catch {} }
  function delStorage(k)    { try { localStorage.removeItem(k); }     catch {} }

  let SERVER_URL   = getStorage(LS_SERVER) || '';
  let userToken    = getStorage(LS_TOKEN);
  let username     = getStorage(LS_USER);
  let eventSource  = null;
  let isMinimized  = false;
  let unreadCount  = 0;

  // ── Inject styles ───────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id    = '__globalchat_style__';
  style.textContent = `
    #__globalchat__ {
      all: initial;
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 340px;
      height: 480px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12);
      transition: height 0.25s cubic-bezier(.4,0,.2,1);
    }
    #__globalchat__.gc-minimized {
      height: 48px;
    }
    #__globalchat__ * { box-sizing: border-box; margin: 0; padding: 0; }
    .gc-header {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      padding: 0 14px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
    }
    .gc-header-left { display: flex; align-items: center; gap: 8px; }
    .gc-logo {
      width: 22px; height: 22px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
    }
    .gc-title {
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.02em;
    }
    .gc-badge {
      background: #f43f5e;
      color: #fff;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .gc-badge.visible { display: flex; }
    .gc-header-right { display: flex; align-items: center; gap: 6px; }
    .gc-online {
      font-size: 11px;
      color: rgba(255,255,255,0.75);
      display: flex; align-items: center; gap: 4px;
    }
    .gc-online-dot {
      width: 7px; height: 7px;
      background: #4ade80;
      border-radius: 50%;
    }
    .gc-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      width: 26px; height: 26px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .gc-btn:hover { background: rgba(255,255,255,0.3); }
    .gc-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #0f0f13;
      overflow: hidden;
    }
    .gc-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scroll-behavior: smooth;
    }
    .gc-messages::-webkit-scrollbar { width: 4px; }
    .gc-messages::-webkit-scrollbar-track { background: transparent; }
    .gc-messages::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
    .gc-msg {
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: gc-fadein 0.18s ease;
    }
    @keyframes gc-fadein {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .gc-msg.gc-own .gc-bubble {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      align-self: flex-end;
      border-radius: 16px 4px 16px 16px;
    }
    .gc-msg.gc-own .gc-meta { align-self: flex-end; }
    .gc-bubble {
      background: #1e1e2a;
      color: #e2e2ef;
      border-radius: 4px 16px 16px 16px;
      padding: 8px 12px;
      max-width: 85%;
      align-self: flex-start;
      line-height: 1.45;
      word-break: break-word;
    }
    .gc-meta {
      font-size: 10px;
      color: #555;
      padding: 0 4px;
      align-self: flex-start;
      display: flex; gap: 4px;
    }
    .gc-meta-user { color: #7c7caa; font-weight: 600; }
    .gc-system-msg {
      text-align: center;
      font-size: 11px;
      color: #444;
      padding: 2px 0;
    }
    .gc-input-area {
      padding: 10px;
      border-top: 1px solid #1e1e2a;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      background: #0f0f13;
      flex-shrink: 0;
    }
    .gc-input {
      flex: 1;
      background: #1e1e2a;
      border: 1px solid #2a2a3a;
      border-radius: 10px;
      color: #e2e2ef;
      padding: 8px 12px;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 90px;
      line-height: 1.4;
      transition: border-color 0.15s;
    }
    .gc-input::placeholder { color: #444; }
    .gc-input:focus { border-color: #6366f1; }
    .gc-send {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      color: #fff;
      width: 36px; height: 36px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 16px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .gc-send:hover { opacity: 0.85; }
    .gc-send:disabled { opacity: 0.35; cursor: default; }
    .gc-register {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px;
      background: #0f0f13;
    }
    .gc-register p {
      color: #888;
      font-size: 13px;
      text-align: center;
      line-height: 1.5;
    }
    .gc-register-input {
      width: 100%;
      background: #1e1e2a;
      border: 1px solid #2a2a3a;
      border-radius: 10px;
      color: #e2e2ef;
      padding: 10px 14px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .gc-register-input:focus { border-color: #6366f1; }
    .gc-register-btn {
      width: 100%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      color: #fff;
      padding: 10px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .gc-register-btn:hover { opacity: 0.85; }
    .gc-error {
      color: #f43f5e;
      font-size: 12px;
      text-align: center;
    }
    .gc-connecting {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: #555; font-size: 13px; gap: 8px;
    }
    .gc-spinner {
      width: 16px; height: 16px;
      border: 2px solid #333;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: gc-spin 0.7s linear infinite;
    }
    @keyframes gc-spin { to { transform: rotate(360deg); } }
    .gc-server-setup {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px;
      background: #0f0f13;
    }
    .gc-server-setup p {
      color: #888;
      font-size: 13px;
      text-align: center;
      line-height: 1.5;
    }
    .gc-server-setup .gc-label {
      width: 100%;
      font-size: 11px;
      font-weight: 700;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-align: left;
      margin-bottom: -8px;
    }
    .gc-server-hint {
      font-size: 11px;
      color: #444;
      text-align: left;
      width: 100%;
      margin-top: -6px;
    }
    .gc-settings-panel {
      position: absolute;
      top: 48px;
      right: 0;
      width: 100%;
      background: #1a1a26;
      border-bottom: 1px solid #2a2a3a;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 10;
      animation: gc-fadein 0.15s ease;
    }
    .gc-settings-panel .gc-label {
      font-size: 11px;
      font-weight: 700;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .gc-settings-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .gc-settings-row input {
      flex: 1;
      background: #0f0f13;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e2e2ef;
      padding: 7px 10px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }
    .gc-settings-row input:focus { border-color: #6366f1; }
    .gc-settings-save {
      background: #6366f1;
      border: none;
      color: #fff;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    .gc-settings-save:hover { opacity: 0.85; }
    .gc-settings-divider {
      border: none;
      border-top: 1px solid #2a2a3a;
      margin: 0;
    }
    .gc-settings-danger {
      background: none;
      border: 1px solid #f43f5e44;
      color: #f43f5e;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      width: 100%;
    }
    .gc-settings-danger:hover { background: #f43f5e22; }
    .gc-current-server {
      font-size: 11px;
      color: #555;
      word-break: break-all;
    }
    .gc-current-server span { color: #7c7caa; }
  `;
  document.head.appendChild(style);

  // ── Build DOM ───────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id    = '__globalchat__';
  root.innerHTML = `
    <div class="gc-header" id="gc-header">
      <div class="gc-header-left">
        <div class="gc-logo">💬</div>
        <span class="gc-title">GlobalChat</span>
        <span class="gc-badge" id="gc-badge">0</span>
      </div>
      <div class="gc-header-right">
        <span class="gc-online"><span class="gc-online-dot"></span><span id="gc-online-count">—</span></span>
        <button class="gc-btn" id="gc-settings-btn" title="Settings">⚙</button>
        <button class="gc-btn" id="gc-close-btn" title="Close">✕</button>
      </div>
    </div>
    <div class="gc-body" id="gc-body">
      <div class="gc-connecting" id="gc-connecting">
        <div class="gc-spinner"></div> Connecting…
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Drag to move ────────────────────────────────────────────────────────────
  (function initDrag() {
    const header = root.querySelector('#gc-header');
    let dragging = false, ox, oy;
    header.addEventListener('mousedown', e => {
      if (e.target.closest('.gc-btn')) return;
      dragging = true;
      const rect = root.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      let l = e.clientX - ox;
      let t = e.clientY - oy;
      l = Math.max(0, Math.min(window.innerWidth  - root.offsetWidth,  l));
      t = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, t));
      root.style.right  = 'auto';
      root.style.bottom = 'auto';
      root.style.left   = l + 'px';
      root.style.top    = t + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  })();

  // ── Minimize / close ────────────────────────────────────────────────────────
  root.querySelector('#gc-header').addEventListener('click', e => {
    if (e.target.closest('.gc-btn')) return;
    isMinimized = !isMinimized;
    root.classList.toggle('gc-minimized', isMinimized);
    if (!isMinimized) {
      unreadCount = 0;
      updateBadge();
    }
  });

  root.querySelector('#gc-close-btn').addEventListener('click', e => {
    e.stopPropagation();
    root.style.display = 'none';
    if (eventSource) { eventSource.close(); eventSource = null; }
  });

  // ── Settings panel ──────────────────────────────────────────────────────────
  let settingsOpen = false;

  root.querySelector('#gc-settings-btn').addEventListener('click', e => {
    e.stopPropagation();
    const existing = root.querySelector('.gc-settings-panel');
    if (existing) { existing.remove(); settingsOpen = false; return; }
    settingsOpen = true;

    const panel = document.createElement('div');
    panel.className = 'gc-settings-panel';
    panel.innerHTML = `
      <div class="gc-label">Server URL</div>
      <div class="gc-current-server">Current: <span>${SERVER_URL || 'not set'}</span></div>
      <div class="gc-settings-row">
        <input id="gc-server-input" type="url" placeholder="https://your-server.com" value="${SERVER_URL}" />
        <button class="gc-settings-save" id="gc-server-save">Save</button>
      </div>
      <hr class="gc-settings-divider" />
      <button class="gc-settings-danger" id="gc-reset-btn">⚠ Reset account (clear username &amp; token)</button>
    `;
    root.style.position = 'relative';
    root.appendChild(panel);

    panel.querySelector('#gc-server-save').addEventListener('click', () => {
      const val = panel.querySelector('#gc-server-input').value.trim().replace(/\/$/, '');
      if (!val) return;
      SERVER_URL = val;
      setStorage(LS_SERVER, SERVER_URL);
      panel.remove();
      settingsOpen = false;
      // Reconnect with new server
      if (userToken && username) {
        showChat();
      } else {
        showRegister();
      }
    });

    panel.querySelector('#gc-server-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') panel.querySelector('#gc-server-save').click();
      if (e.key === 'Escape') { panel.remove(); settingsOpen = false; }
    });

    panel.querySelector('#gc-reset-btn').addEventListener('click', () => {
      if (!confirm('Reset your account? You will need to pick a new username.')) return;
      delStorage(LS_TOKEN);
      delStorage(LS_USER);
      userToken = null;
      username  = null;
      if (eventSource) { eventSource.close(); eventSource = null; }
      panel.remove();
      settingsOpen = false;
      showRegister();
    });
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const body = root.querySelector('#gc-body');

  function setBody(html) { body.innerHTML = html; }

  function showConnecting() {
    setBody(`
      <div class="gc-connecting" id="gc-connecting">
        <div class="gc-spinner"></div> Connecting…
      </div>
    `);
  }

  function updateBadge() {
    const b = root.querySelector('#gc-badge');
    if (!b) return;
    if (unreadCount > 0 && isMinimized) {
      b.textContent = unreadCount > 99 ? '99+' : unreadCount;
      b.classList.add('visible');
    } else {
      b.classList.remove('visible');
    }
  }

  function updateOnlineCount() {
    fetch(`${SERVER_URL}/api/stats`)
      .then(r => r.json())
      .then(d => {
        const el = root.querySelector('#gc-online-count');
        if (el) el.textContent = d.onlineCount;
      }).catch(() => {});
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMessage(msg) {
    const list = root.querySelector('#gc-messages');
    if (!list) return;
    const isOwn  = msg.username === username;
    const el     = document.createElement('div');
    el.className = `gc-msg${isOwn ? ' gc-own' : ''}`;
    el.innerHTML = `
      <div class="gc-bubble">${msg.text}</div>
      <div class="gc-meta">
        <span class="gc-meta-user">${msg.username}</span>
        <span>${formatTime(msg.timestamp)}</span>
      </div>
    `;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;

    if (isMinimized) {
      unreadCount++;
      updateBadge();
    }
  }

  function appendSystem(text) {
    const list = root.querySelector('#gc-messages');
    if (!list) return;
    const el = document.createElement('div');
    el.className = 'gc-system-msg';
    el.textContent = text;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }

  // ── Server setup screen ─────────────────────────────────────────────────────
  function showServerSetup() {
    setBody(`
      <div class="gc-server-setup">
        <div class="gc-logo" style="font-size:32px;width:auto;height:auto;background:none;">🌐</div>
        <p>Enter your GlobalChat server URL.<br>This is saved and used on every site.</p>
        <div class="gc-label">Server URL</div>
        <input class="gc-register-input" id="gc-server-url-input"
               type="url" placeholder="https://chatting-yfxz.onrender.com" value="https://chatting-yfxz.onrender.com" autocomplete="off" />
        <div class="gc-server-hint">You can change this later in settings</div>
        <div class="gc-error" id="gc-server-error"></div>
        <button class="gc-register-btn" id="gc-server-connect-btn">Connect</button>
      </div>
    `);

    const input = root.querySelector('#gc-server-url-input');
    const btn   = root.querySelector('#gc-server-connect-btn');
    const err   = root.querySelector('#gc-server-error');
    input.focus();
    input.select(); // Select the default URL so user can easily replace it

    function tryConnect() {
      const val = input.value.trim().replace(/\/$/, '');
      if (!val) { err.textContent = 'Please enter a server URL.'; return; }
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Connecting…';

      fetch(`${val}/api/stats`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(() => {
          SERVER_URL = val;
          setStorage(LS_SERVER, SERVER_URL);
          showRegister();
        })
        .catch(() => {
          err.textContent = 'Could not reach that server. Check the URL and try again.';
          btn.disabled = false;
          btn.textContent = 'Connect';
        });
    }

    btn.addEventListener('click', tryConnect);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryConnect(); });
  }

  // ── Registration screen ─────────────────────────────────────────────────────
  function showRegister() {
    setBody(`
      <div class="gc-register">
        <div class="gc-logo" style="font-size:32px;width:auto;height:auto;background:none;">💬</div>
        <p>Join the global chat!<br>Pick a username to get started.</p>
        <input class="gc-register-input" id="gc-name-input"
               placeholder="Your username…" maxlength="24" autocomplete="off" />
        <div class="gc-error" id="gc-reg-error"></div>
        <button class="gc-register-btn" id="gc-join-btn">Join Chat</button>
      </div>
    `);
    const input = root.querySelector('#gc-name-input');
    const btn   = root.querySelector('#gc-join-btn');
    const err   = root.querySelector('#gc-reg-error');
    input.focus();

    function tryJoin() {
      const name = input.value.trim();
      if (!name) { err.textContent = 'Please enter a username.'; return; }
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Joining…';
      fetch(`${SERVER_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name })
      })
        .then(r => r.json())
        .then(d => {
          if (d.error) { err.textContent = d.error; btn.disabled = false; btn.textContent = 'Join Chat'; return; }
          userToken = d.token;
          username  = d.username;
          setStorage(LS_TOKEN, userToken);
          setStorage(LS_USER, username);
          showChat();
        })
        .catch(() => {
          err.textContent = 'Could not reach server. Is it running?';
          btn.disabled = false; btn.textContent = 'Join Chat';
        });
    }

    btn.addEventListener('click', tryJoin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  }

  // ── Chat screen ─────────────────────────────────────────────────────────────
  function showChat() {
    setBody(`
      <div class="gc-messages" id="gc-messages"></div>
      <div class="gc-input-area">
        <textarea class="gc-input" id="gc-input"
                  placeholder="Message everyone…" rows="1" maxlength="500"></textarea>
        <button class="gc-send" id="gc-send-btn">➤</button>
      </div>
    `);

    const input   = root.querySelector('#gc-input');
    const sendBtn = root.querySelector('#gc-send-btn');

    // Auto-grow textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });

    // Send message
    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;

      fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Token': userToken
        },
        body: JSON.stringify({ text })
      })
        .then(r => r.json())
        .then(d => {
          if (d.error) appendSystem(`⚠ ${d.error}`);
        })
        .catch(() => appendSystem('⚠ Failed to send message.'))
        .finally(() => { sendBtn.disabled = false; });
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Connect SSE
    connectSSE();
    updateOnlineCount();
    setInterval(updateOnlineCount, 15_000);
  }

  // ── SSE connection ──────────────────────────────────────────────────────────
  function connectSSE() {
    if (eventSource) { eventSource.close(); }

    eventSource = new EventSource(`${SERVER_URL}/api/stream`);

    eventSource.addEventListener('connected', e => {
      const data = JSON.parse(e.data);
      const list = root.querySelector('#gc-messages');
      if (!list) return;
      list.innerHTML = '';
      if (data.messages.length === 0) {
        appendSystem('No messages yet. Say hello! 👋');
      } else {
        data.messages.forEach(appendMessage);
        appendSystem('— End of recent history —');
      }
    });

    eventSource.addEventListener('message', e => {
      const msg = JSON.parse(e.data);
      appendMessage(msg);
    });

    eventSource.onerror = () => {
      appendSystem('⚠ Connection lost. Reconnecting…');
    };
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  if (!SERVER_URL) {
    showServerSetup();
  } else if (userToken && username) {
    showChat();
  } else {
    showRegister();
  }

})();
