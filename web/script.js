const messagesDiv = document.getElementById('messages');
const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const statusDot = document.getElementById('statusDot');

let username = "";
let ws = null;

// --- Name modal ---
joinBtn.addEventListener('click', joinChat);
nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

function joinChat() {
    const name = nameInput.value.trim();
    if (!name) return;
    username = name;
    nameModal.style.display = 'none';
    connectWebSocket();
}

// --- WebSocket ---
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
        console.log('Connected to chat');
        statusDot.style.background = '#22c55e';
    };

    ws.onclose = () => {
        console.log('Disconnected');
        statusDot.style.background = '#ef4444';
    };

    ws.onerror = () => {
        console.log('WebSocket error');
        statusDot.style.background = '#ef4444';
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addMessage(data.user, data.text, data.user === username);
        } catch (e) {
            // if server sends plain text, display it
            addMessage('System', event.data, false);
        }
    };
}

// --- Render message ---
function addMessage(user, text, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = isOwn ? text : `strong>${escapeHtml(user)}</strong>br>${escapeHtml(text)}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Send ---
function sendMessage() {
    const text = input.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    const payload = JSON.stringify({ user: username, text });
    ws.send(payload);
    input.value = '';
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});