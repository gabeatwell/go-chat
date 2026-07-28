package hub

import (
	"log"
	"net/http"
	"sync"

	"github.com/gabeatwell/go-chat/internal/client"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins
	},
}

type Hub struct {
	clients    map[*client.Client]bool
	broadcast  chan []byte
	register   chan *client.Client
	unregister chan *client.Client
	mu         sync.Mutex
}

func New() *Hub {
	return &Hub{
		clients:    make(map[*client.Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *client.Client),
		unregister: make(chan *client.Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()
			log.Println("Client connected. Total:", len(h.clients))

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.Send)
			}
			h.mu.Unlock()
			log.Println("Client disconnected. Total:", len(h.clients))

		case message := <-h.broadcast:
			h.mu.Lock()
			for c := range h.clients {
				select {
				case c.Send <- message:
				default:
					close(c.Send)
					delete(h.clients, c)
				}
			}
			h.mu.Unlock()
		}
	}
}

func ServeWS(h *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	c := client.New(conn)
	h.register <- c

	go c.WritePump()
	go c.ReadPump(h)
}

func (h *Hub) Broadcast(msg []byte) {
	h.broadcast <- msg
}

func (h *Hub) Unregister(c *client.Client) {
	h.unregister <- c
}