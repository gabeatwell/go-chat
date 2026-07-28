const messagesDiv = document.getElementById('messages');
const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

const username = prompt("Enter your name:") || "Guest";

// automatically uses current domain
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}/ws`);

ws.onopen = () => console.log('Connected to chat');
ws.onclose = () => console.log('Disconnected');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    addMessage(data.user, data.text, data.user === username);
};

function addMessage(user, text, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = isOwn ? text : `<strong>${user}</strong><br>${text}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const payload = JSON.stringify({ user: username, text });
    ws.send(payload);
    input.value = '';
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});