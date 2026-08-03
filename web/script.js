// ---------- DOM refs ----------
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusDot = document.querySelector('.status-dot');
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const installBtn = document.getElementById('installBtn');

// ---------- Halt if critical elements are missing ----------
if (!messagesDiv || !input || !sendBtn || !nameModal || !nameInput || !joinBtn) {
    console.error('Required HTML elements not found');
    throw new Error('Missing DOM elements');
}

let username = '';
let ws;
let reconnectAttempts = 0;
let unreadCount = 0;
const ORIGINAL_TITLE = document.title;
const ORIGINAL_FAVICON =
  document.querySelector('link[rel="icon"]')?.href || "./icons/favicon.png";

// ---------- Name modal ----------
function joinChat() {
    const name = nameInput.value.trim();
    if (!name) return;
    username = name;
    nameModal.style.display = 'none';
    loadHistory();
    connect();
    // Ask for notification permission (doesn't block anything if denied)
    requestNotifyPermission();
}

joinBtn.addEventListener('click', joinChat);
nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});
nameInput.focus();

// ---------- Helper to escape HTML ----------
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addMessage(user, text, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;

    div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(text)}`;

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---------- Load history from the server ----------
async function loadHistory() {
    try {
        const res = await fetch('/history');
        if (!res.ok) throw new Error('Failed to load history');

        const messages = await res.json();

        messages.forEach(msg => {
            addMessage(msg.User, msg.Text, msg.User === username);
        });
    } catch (err) {
        console.error('Could not load chat history:', err);
    }
}

// ---------- Unread count & Notifications ----------
function updateTitle() {
    // document title
    if (unreadCount > 0) {
        document.title = `(${unreadCount}) ${ORIGINAL_TITLE}`;
    } else {
        document.title = ORIGINAL_TITLE;
    }

    // badge png
    updateFaviconBadge(unreadCount);

    // pwa badge
    updateAppBadge(unreadCount);
}

//  ---------- Red PNG favicon badge ----------
function updateFaviconBadge(count) {
  const link =
    document.querySelector('link[rel="icon"]') ||
    document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";

  if (count <= 0) {
    link.href = ORIGINAL_FAVICON;
    if (!link.parentNode) document.head.appendChild(link);
    return;
  }

  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // Draw original favicon
    ctx.drawImage(img, 0, 0, size, size);

    // Red circle (top-right)
    const r = 9;
    const x = size - r - 1;
    const y = r + 1;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444"; // red
    ctx.fill();

    // White border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number
    ctx.fillStyle = "#ffffff";
    ctx.font = count > 9
        ? "bold 10px system-ui, -apple-system, sans-serif"
        : "bold 12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = count > 9 ? "9+" : String(count);
    ctx.fillText(text, x, y + 0.5);

    link.href = canvas.toDataURL("image/png");
    if (!link.parentNode) document.head.appendChild(link);
  };
  img.onerror = () => {
    link.href = ORIGINAL_FAVICON;
  };
  img.src = ORIGINAL_FAVICON;
}

/* ---------- Native PWA app-icon badge ---------- */
function updateAppBadge(count) {
  if (!("setAppBadge" in navigator)) return;

  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {});
  } else {
    navigator.clearAppBadge().catch(() => {});
  }
}

/* ---------- Permission + toast-style notification ---------- */
async function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function notifyMessage(user, text) {
  if (!("Notification" in window)) return;
  if (
    Notification.permission === "granted" &&
    document.visibilityState !== "visible"
  ) {
    const n = new Notification(user, {
      body: text,
      icon: "/icons/icon-192.svg",
    });
    setTimeout(() => n.close(), 4000);
  }
}

/* ---------- Clear when user comes back ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    unreadCount = 0;
    updateTitle();
  }
});
window.addEventListener("focus", () => {
  unreadCount = 0;
  updateTitle();
});

// ---------- WebSocket ----------
function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
        console.log('Connected');
        if (statusDot) statusDot.style.background = '#22c55e';
        reconnectAttempts = 0;
    };

    ws.onclose = () => {
        console.log('Disconnected – reconnecting...');
        if (statusDot) statusDot.style.background = '#ef4444';
        setTimeout(connect, Math.min(1000 * (reconnectAttempts + 1), 5000));
        reconnectAttempts++;
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        if (statusDot) statusDot.style.background = '#ef4444';
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addMessage(data.user, data.text, data.user === username);

            if (data.user !== username) {
                unreadCount++;
                updateTitle();
                notifyMessage(data.user, data.text);
            }
        } catch (e) {
            console.error('Bad message:', event.data);
        }
    };
}

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected yet. Please wait a few seconds and try again.');
        return;
    }
    unreadCount = 0;
    updateTitle();

    ws.send(JSON.stringify({ user: username, text }));
    input.value = '';
}
messagesDiv.addEventListener('click', () => { unreadCount = 0; updateTitle(); });

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ---------- PWA: Service Worker ----------
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    navigator.serviceWorker.ready.then((reg) => reg.update());
}

// ---------- PWA: Install prompt ----------
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        installBtn.hidden = true;
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        console.log('Install result:', result.outcome);
        deferredPrompt = null;
    });
}