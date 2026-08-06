# Go Chat

A real-time chat application built with Go on the backend and vanilla HTML/CSS/TypeScript on the frontend. WebSocket communication is powered by the gorilla/websocket package.

## Features

Real-time messaging — Messages are broadcast to all connected clients instantly via WebSockets.
Username identification — Each user is prompted for a name on join; messages from others show the sender's name.

Connection tracking — The server logs connect/disconnect events and the current total of active clients.
Graceful disconnect handling — Slow or disconnected clients are automatically cleaned up without disrupting others.

Responsive dark-theme UI — A modern chat interface with styled own/other message bubbles.
Project Structure

## Project Structure

```text
go-chat/
├── cmd/
│   └── server/
│       └── main.go              # Entry point — starts the HTTP + WebSocket server
├── internal/
│   ├── client/
│   │   └── client.go            # Client connection handling (read/write pumps)
│   └── hub/
│       └── hub.go               # Central hub — manages clients and message broadcast
├── web/
│   ├── index.html               # Chat UI
│   ├── styles.css               # Stylesheet
│   └── script.ts                # Client-side WebSocket logic
├── go.mod                       # Go module definition
└── README.md
```

### How it works

**Server** (`main.go`)

- Serves the static files from the web directory at the root (/).
- Exposes a WebSocket endpoint at /ws that upgrades HTTP connections.
- Configurable port via the PORT environment variable (defaults to 8080).

**Hub** (`hub.go`)

The hub is the central message router. It runs in its own goroutine and uses three channels for communication:

| Channel    | Purpose                                   |
| ---------- | ----------------------------------------- |
| register   | New clients are added here                |
| unregister | Disconnected clients are removed here     |
| broadcast  | Incoming messages are sent to all clients |

A sync.Mutex protects the clients map during concurrent access.

**Client** (`client.go`)

Each connected user is represented by a Client struct with two goroutines:

- ReadPump — Reads messages from the WebSocket connection and sends them to the hub for broadcasting.
- WritePump — Reads from the Send channel and writes messages to the WebSocket connection.

The client package defines a Hub interface to avoid a circular import with the hub package.

**Frontend** (`script.ts`)

- Connects to the WebSocket server automatically.
- Prompts for a username on page load.
- Renders messages with different styles for own vs. other users.
- Supports sending via the send button or the Enter key.

## Getting started

### Prerequisites

- Go 1.26 or later

Run Locally:

```bash
git clone https://github.com/gabeatwell/go-chat.git
cd go-chat
go run ./cmd/server/
```

Open your browser to `http://localhost:8080`. Open multiple tabs to test real-time messaging.

### Run on a Custom Port

```bash
# macOS / Linux
export PORT=3000

# Windows PowerShell
$env:PORT=3000

# then
go run ./cmd/server/
```

#### Configuration

| Environment Variable | Default | Description        |
| -------------------- | ------- | ------------------ |
| PORT                 | 8080    | Server listen port |

### Built With

- Go — Backend language
- gorilla/websocket — WebSocket implementation
- Vanilla HTML, CSS, and JavaScript — Frontend (no frameworks)
