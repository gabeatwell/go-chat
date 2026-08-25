"use strict";
// ---------- DOM refs ----------
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const statusDot = document.querySelector(".status-dot");
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const installBtn = document.getElementById("installBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminBtn = document.getElementById("adminBtn");
const clearBtn = document.getElementById("clearBtn");
const adminModal = document.getElementById("adminModal");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminCancelBtn = document.getElementById("adminCancelBtn");
const adminErrorMsg = document.getElementById("adminErrorMsg");
if (clearBtn) {
    clearBtn.hidden = true;
    clearBtn.style.display = "none";
}
const adminLoginForm = document.getElementById("adminLoginForm");
if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleAdminLogin();
    });
}
const nameForm = document.getElementById("nameForm");
if (nameForm) {
    nameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await joinChat();
    });
}
// ---------- Halt if critical elements are missing ----------
if (!messagesDiv ||
    !input ||
    !sendBtn ||
    !nameModal ||
    !nameInput ||
    !joinBtn) {
    console.error("Required HTML elements not found");
    throw new Error("Missing DOM elements");
}
let username = "";
let ws = null;
let reconnectAttempts = 0;
let unreadCount = 0;
const recentMessages = new Set();
const DEDUP_WINDOW_MS = 3000;
const NAME_KEY = "chatski_username";
const ORIGINAL_TITLE = document.title;
const ORIGINAL_FAVICON = document.querySelector('link[rel="icon"]')
    ?.href || "./icons/favicon.png";
const VAPID_PUBLIC_KEY = "BIRtPT_tN2Wfk0SqmgQhCMNxMZmVDmiNNQQ6oqxmOC0UQfLGckhFzKEyyA2ZtEljJ9druugMmPbUEJi1Z1FBtmk";
// ---------- PWA helpers ----------
function isStandalone() {
    return (window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true);
}
function isIOS() {
    return (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
}
function urlBase64ToArrayBuffer(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
        output[i] = rawData.charCodeAt(i);
    }
    return buffer;
}
async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.log("Push not supported");
        return false;
    }
    if (!window.isSecureContext && location.hostname !== "localhost") {
        console.log("Push requires HTTPS or localhost.");
        return false;
    }
    // iOS: push only works from the Home Screen app
    if (isIOS() && !isStandalone()) {
        console.log("iOS: push only works when the app is installed from the Home Screen");
        return false;
    }
    if (!("Notification" in window)) {
        console.log("Notifications unavailable");
        return false;
    }
    let permission = Notification.permission;
    if (permission === "default") {
        permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
        console.log("Notification permission denied");
        return false;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
            });
        }
        const res = await fetch("/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub),
        });
        if (!res.ok) {
            console.warn("Subscription server rejected push registration:", res.status);
            return false;
        }
        console.log("Push subscribed");
        return true;
    }
    catch (err) {
        console.error("Push subscribe failed:", err);
        return false;
    }
}
async function requestNotifyPermission() {
    return enablePush();
}
function isMacOS() {
    if (isIOS())
        return false;
    return /Mac/i.test(navigator.userAgent) || navigator.platform === "MacIntel";
}
function showInstallDirections() {
    // Remove any existing hint
    document.getElementById("install-hint")?.remove();
    let title = "Install chatski";
    let body = "";
    if (isIOS()) {
        title = "Add to Home Screen";
        body =
            "1. Open in Safari<br>" +
                "2. Tap the <strong>Share</strong> button <span style='opacity:.8'>(square with arrow)</span><br>" +
                "3. Scroll and tap <strong>Add to Home Screen</strong><br>" +
                "4. Tap <strong>Add</strong><br>" +
                "5. Open <strong>chatski</strong> from your Home Screen, then allow notifications.";
    }
    else if (isMacOS()) {
        title = "Add to Dock (Mac)";
        body =
            "In <strong>Safari</strong>:<br>" +
                "1. Open this site in Safari<br>" +
                "2. Menu bar: <strong>File → Add to Dock…</strong><br>" +
                "&nbsp;&nbsp;&nbsp;(or Share → Add to Dock)<br>" +
                "3. Open chatski from the Dock and allow notifications if asked.<br><br>" +
                "Chrome/Edge on Mac: use the install icon in the address bar, or the Install button if it appears.";
    }
    else {
        title = "Install app";
        body =
            "Use your browser’s install option, or the Install button when it appears.";
    }
    const el = document.createElement("div");
    el.id = "install-hint";
    el.style.cssText =
        "position:fixed;bottom:80px;left:12px;right:12px;max-width:420px;margin:auto;" +
            "padding:14px 16px;background:#1e293b;color:#fff;border-radius:12px;" +
            "z-index:9999;font:14px/1.45 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.35)";
    el.innerHTML =
        `<div style="display:flex;justify-content:space-between;gap:12px;align-items:start">` +
            `<strong>${title}</strong>` +
            `<button type="button" id="install-hint-close" style="background:none;border:0;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1">×</button>` +
            `</div>` +
            `<div style="margin-top:8px;color:#e2e8f0">${body}</div>`;
    document.body.appendChild(el);
    document
        .getElementById("install-hint-close")
        ?.addEventListener("click", () => el.remove());
}
function setupInstallButton() {
    if (!installBtn)
        return;
    // Already installed as PWA → hide
    if (isStandalone()) {
        installBtn.hidden = true;
        return;
    }
    // iOS / iPad: always show button (beforeinstallprompt never fires)
    if (isIOS()) {
        installBtn.hidden = false;
        const label = installBtn.querySelector(".install-label");
        if (label)
            label.textContent = "Install";
        installBtn.onclick = (e) => {
            e.preventDefault();
            showInstallDirections();
        };
        return;
    }
    // mac safari: show directions (Chrome/Edge may still use beforeinstallprompt)
    if (isMacOS()) {
        installBtn.hidden = false;
        installBtn.onclick = (e) => {
            e.preventDefault();
            showInstallDirections();
        };
    }
}
setupInstallButton();

// ---------- Name modal ----------
async function startWithName(name) {
    username = name;
    if (nameModal)
        nameModal.style.display = "none";
    localStorage.setItem(NAME_KEY, name);
    // await handleAdminLogout();
    try {
        await loadHistory();
    }
    catch (err) {
        console.warn("History load failed, continuing anyway:", err);
    }
    connect();
    // requestNotifyPermission();
}
async function joinChat() {
    if (!nameInput)
        return;
    const name = nameInput.value.trim();
    if (!name)
        return;
    await startWithName(name);
}
if (nameInput) {
    nameInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            joinChat();
    });
}
// auto-join if already have name
const savedName = localStorage.getItem(NAME_KEY);
let adminLoggedIn = false;
updateAdminUI();
async function init() {
    // await handleAdminLogout();
    if (savedName) {
        await startWithName(savedName);
    }
    else {
        if (nameInput) {
            nameInput.focus();
        }
    }
}
init();
function updateAdminUI() {
    if (adminLoggedIn) {
        if (clearBtn) {
            clearBtn.hidden = false;
            clearBtn.style.display = "inline-flex";
        }
        if (adminBtn) {
            adminBtn.hidden = true;
        }
    }
    else {
        if (clearBtn) {
            clearBtn.hidden = true;
            clearBtn.style.display = "none";
        }
        if (adminBtn) {
            adminBtn.hidden = false;
        }
    }
}
async function checkAdminStatus() {
    try {
        const res = await fetch("/admin/status");
        if (!res.ok)
            throw new Error("status failed");
        const body = (await res.json());
        adminLoggedIn = !!body.loggedIn;
    }
    catch (err) {
        adminLoggedIn = false;
    }
    updateAdminUI();
}
function openAdminModal() {
    if (!adminModal || !adminErrorMsg || !adminPasswordInput)
        return;
    adminErrorMsg.textContent = "";
    adminPasswordInput.value = "";
    adminModal.style.display = "flex";
    adminPasswordInput.focus();
}
function closeAdminModal() {
    if (!adminModal || !adminErrorMsg)
        return;
    adminModal.style.display = "none";
    adminErrorMsg.textContent = "";
}
async function handleAdminLogin() {
    if (!adminPasswordInput || !adminErrorMsg)
        return;
    const password = adminPasswordInput.value.trim();
    if (!password) {
        adminErrorMsg.textContent = "Enter the admin password.";
        return;
    }
    try {
        const res = await fetch("/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });
        if (!res.ok) {
            if (res.status === 401) {
                adminErrorMsg.textContent = "Incorrect password.";
            }
            else {
                adminErrorMsg.textContent = "Login failed. Try again.";
            }
            return;
        }
        adminLoggedIn = true;
        username = "Admin";
        localStorage.setItem(NAME_KEY, "Admin");
        updateAdminUI();
        closeAdminModal();
    }
    catch (err) {
        adminErrorMsg.textContent = "Login failed. Try again.";
        console.error(err);
    }
}
async function handleAdminLogout() {
    try {
        await fetch("/admin/logout", { method: "POST" });
    }
    catch (err) {
        console.error("admin logout failed", err);
    }
    adminLoggedIn = false;
    updateAdminUI();
}
async function handleClearMessages() {
    if (!confirm("Clear all chat messages? This cannot be undone."))
        return;
    try {
        const res = await fetch("/clear", { method: "POST" });
        if (res.status === 204) {
            if (messagesDiv)
                messagesDiv.innerHTML = "";
            return;
        }
        if (res.status === 401) {
            adminLoggedIn = false;
            updateAdminUI();
            alert("Admin session expired. Please log in again.");
            return;
        }
        throw new Error("Clear failed");
    }
    catch (err) {
        alert("Unable to clear chat.");
        console.error(err);
    }
}
// ---------- Logout Button ----------
async function logout() {
    localStorage.removeItem(NAME_KEY);
    username = "";
    // Stop websocket
    if (ws) {
        ws.onclose = null; // avoid auto-reconnect during logout
        ws.close();
        ws = null;
    }
    // Clear chat UI (optional)
    if (messagesDiv) {
        messagesDiv.innerHTML = "";
    }
    unreadCount = 0;
    updateTitle();
    // If the user is also admin, clear that session too
    if (adminLoggedIn) {
        await handleAdminLogout();
    }
    adminLoggedIn = false;
    updateAdminUI();
    // Show name modal again
    if (nameModal) {
        nameModal.style.display = ""; // or "flex" if that's your overlay style
    }
    if (nameInput) {
        nameInput.value = "";
        nameInput.focus();
    }
}
if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
}
if (adminBtn) {
    adminBtn.addEventListener("click", openAdminModal);
}
if (clearBtn) {
    clearBtn.addEventListener("click", handleClearMessages);
}
if (adminCancelBtn) {
    adminCancelBtn.addEventListener("click", closeAdminModal);
}
if (adminPasswordInput) {
    adminPasswordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            handleAdminLogin();
    });
}
// ---------- Helper to escape HTML ----------
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
function addMessage(user, text, isOwn) {
    if (!messagesDiv)
        return;
    const div = document.createElement("div");
    div.className = `message ${isOwn ? "own" : "other"}`;
    div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(text)}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
// ---------- Load history from the server ----------
async function loadHistory() {
    try {
        const res = await fetch("/history");
        if (!res.ok)
            throw new Error("Failed to load history");
        const messages = (await res.json());
        messages.forEach((msg) => {
            addMessage(msg.User, msg.Text, msg.User === username);
        });
    }
    catch (err) {
        console.error("Could not load chat history:", err);
    }
}
// ---------- Unread count & Notifications ----------
function updateTitle() {
    // document title
    if (unreadCount > 0) {
        document.title = `(${unreadCount}) ${ORIGINAL_TITLE}`;
    }
    else {
        document.title = ORIGINAL_TITLE;
    }
    // badge png
    updateFaviconBadge(unreadCount);
    // pwa badge
    updateAppBadge(unreadCount);
}
//  ---------- Red PNG favicon badge ----------
function updateFaviconBadge(count) {
    const existing = document.querySelector('link[rel="icon"]');
    const link = existing ?? document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    if (count <= 0) {
        link.href = ORIGINAL_FAVICON;
        if (!link.parentNode)
            document.head.appendChild(link);
        return;
    }
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
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
        ctx.font =
            count > 9
                ? "bold 10px system-ui, -apple-system, sans-serif"
                : "bold 12px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = count > 9 ? "9+" : String(count);
        ctx.fillText(text, x, y + 0.5);
        link.href = canvas.toDataURL("image/png");
        if (!link.parentNode)
            document.head.appendChild(link);
    };
    img.onerror = () => {
        link.href = ORIGINAL_FAVICON;
    };
    img.src = ORIGINAL_FAVICON;
}
/* ---------- Native PWA app-icon badge ---------- */
function updateAppBadge(count) {
    if (!("setAppBadge" in navigator))
        return;
    if (count > 0) {
        navigator.setAppBadge?.(count).catch(() => { });
    }
    else {
        navigator.clearAppBadge?.().catch(() => { });
    }
}
function notifyMessage(user, text) {
    if (!("Notification" in window))
        return;
    if (Notification.permission === "granted" &&
        document.visibilityState !== "visible") {
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
    // Close any existing connection first to prevent duplicate messages
    if (ws) {
        ws.onclose = null; // Prevent reconnect loop
        ws.close();
        ws = null;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onopen = () => {
        console.log("Connected");
        if (statusDot)
            statusDot.style.background = "#22c55e";
        reconnectAttempts = 0;
    };
    ws.onclose = () => {
        console.log("Disconnected – reconnecting...");
        if (statusDot)
            statusDot.style.background = "#ef4444";
        setTimeout(connect, Math.min(1000 * (reconnectAttempts + 1), 5000));
        reconnectAttempts++;
    };
    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        if (statusDot)
            statusDot.style.background = "#ef4444";
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // Deduplicate: skip if we've seen this message recently
            const dedupKey = `${data.user}:${data.text}:${data.ts || ''}`;
            if (recentMessages.has(dedupKey)) {
                console.log("Duplicate message suppressed:", dedupKey);
                return;
            }
            recentMessages.add(dedupKey);
            setTimeout(() => recentMessages.delete(dedupKey), DEDUP_WINDOW_MS);
            addMessage(data.user, data.text, data.user === username);
            if (data.user !== username) {
                unreadCount++;
                updateTitle();
                notifyMessage(data.user, data.text);
            }
        }
        catch (e) {
            console.error("Bad message:", event.data);
        }
    };
}
function sendMessage() {
    if (!input)
        return;
    const text = input.value.trim();
    if (!text)
        return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Not connected yet. Please wait a few seconds and try again.");
        return;
    }
    unreadCount = 0;
    updateTitle();
    const payload = { user: username, text };
    ws.send(JSON.stringify(payload));
    input.value = "";
}
messagesDiv.addEventListener("click", () => {
    unreadCount = 0;
    updateTitle();
});
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter")
        sendMessage();
});
// ---------- PWA: Service Worker ----------
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
}
// ---------- PWA: Install prompt ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!installBtn || isIOS())
        return;
    installBtn.hidden = false;
    installBtn.onclick = async () => {
        if (!deferredPrompt)
            return;
        installBtn.hidden = true;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
    };
});
