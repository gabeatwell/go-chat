package client

import (
	"log"

	"github.com/gorilla/websocket"
)

type Hub interface {
	Broadcast(msg []byte)
    Unregister(c *Client)
}

type Client struct {
	Conn *websocket.Conn
	Send chan []byte
}

func New(conn *websocket.Conn) *Client {
	return &Client{
		Conn: conn,
		Send: make(chan []byte, 256),
	}
}

func (c *Client) ReadPump(h Hub) {
	defer func() {
		h.Unregister(c)
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error: %v", err)
			}
			break
		}
		h.Broadcast(message)
	}
}

func (c *Client) WritePump() {
	defer c.Conn.Close()

	for message := range c.Send {
		err := c.Conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Println("Write error:", err)
			break
		}
	}
}