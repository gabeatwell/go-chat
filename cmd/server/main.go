package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gabeatwell/go-chat/internal/hub"
)

func main() {
	h := hub.New()
	go h.Run()

	// serve chat ui
	http.Handle("/", http.FileServer(http.Dir("web")))

	// websocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(h, w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Chat server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}