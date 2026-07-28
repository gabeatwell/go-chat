package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/gabeatwell/go-chat/internal/db"
	"github.com/gabeatwell/go-chat/internal/hub"
)

func main() {
	// Initialize SQLite
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./chat.db" // default for local + free tier
	}

	if err := db.Init(dbPath); err != nil {
		log.Fatal("Failed to open database:", err)
	}
	log.Println("Database ready:", dbPath)

	h := hub.New()
	go h.Run()

	http.Handle("/", http.FileServer(http.Dir("web")))

	// New endpoint: return recent messages
	http.HandleFunc("/history", func(w http.ResponseWriter, r *http.Request) {
		messages, err := db.GetRecentMessages(50)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(h, w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}