package push

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/gabeatwell/go-chat/internal/db"
)

// SendToSubscribers sends a web push to every stored subscription.
func SendToSubscribers(user, text string) error {
    subs, err := db.GetSubscriptions()
    if err != nil {
        return err
    }
    if len(subs) == 0 {
        return nil // nobody subscribed yet
    }

    payload, err := json.Marshal(map[string]string{"user": user, "text": text})
    if err != nil {
        return err
    }

    for _, s := range subs {
        _, err := webpush.SendNotification(s, payload, &webpush.Options{
            VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
            VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
            Subject:         "mailto:gabrielatwell@proton.me",
            TTL:             60,
        })
        if err != nil {
            log.Println("Push failed:", err)
            // 404/410 means the subscription is dead — remove it
            if strings.Contains(err.Error(), "410") || strings.Contains(err.Error(), "404") {
                db.DeleteSubscription(s.Endpoint)
            }
        }
    }
    return nil
}