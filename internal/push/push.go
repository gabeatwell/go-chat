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

    for _, sub := range subs {
        wsSub := webpush.Subscription{
            Endpoint: sub.Endpoint,
            Keys: webpush.Keys{
                P256dh: sub.P256dh,   // ← your db.PushSubscription fields
                Auth:   sub.Auth,
            },
        }
        _, err := webpush.SendNotification(payload, &wsSub, &webpush.Options{
            VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
            VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
            Subscriber:      "mailto:gabrielatwell@proton.me",   // ← was Subject
            TTL:             60,
        })
        if err != nil {
            log.Println("Push failed:", err)
            if strings.Contains(err.Error(), "410") || strings.Contains(err.Error(), "404") {
                db.DeleteSubscription(sub.Endpoint)
            }
        }
    }
    return nil
}