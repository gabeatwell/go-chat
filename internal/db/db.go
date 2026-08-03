package db

import (
	"database/sql"
	"time"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

type Message struct {
	ID        int64
	User      string
	Text      string
	CreatedAt time.Time
}

func Init(path string) error {
	var err error
	DB, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}

	_, err = DB.Exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user TEXT NOT NULL,
			text TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)
	return err
}

func SaveSubscription(s webpush.Subscription) error {
    _, err := DB.Exec(`
        INSERT INTO push_subscriptions (endpoint, p256dh, auth)
        VALUES (?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth
    `, s.Endpoint, s.Keys.P256dh, s.Keys.Auth)
    return err
}

func GetSubscriptions() ([]webpush.Subscription, error) {
    rows, err := DB.Query(`SELECT endpoint, p256dh, auth FROM push_subscriptions`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var subs []webpush.Subscription
    for rows.Next() {
        var s webpush.Subscription
        if err := rows.Scan(&s.Endpoint, &s.Keys.P256dh, &s.Keys.Auth); err != nil {
            return nil, err
        }
        subs = append(subs, s)
    }
    return subs, nil
}

func DeleteSubscription(endpoint string) error {
    _, err := DB.Exec(`DELETE FROM push_subscriptions WHERE endpoint = ?`, endpoint)
    return err
}

func SaveMessage(user, text string) error {
	_, err := DB.Exec(
		`INSERT INTO messages (user, text) VALUES (?, ?)`,
		user, text,
	)
	return err
}

func GetRecentMessages(limit int) ([]Message, error) {
	rows, err := DB.Query(`
		SELECT id, user, text, created_at
		FROM messages
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		err := rows.Scan(&m.ID, &m.User, &m.Text, &m.CreatedAt)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}

	// reverse so oldest is first
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}