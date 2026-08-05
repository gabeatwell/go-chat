package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/subtle"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"flag"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gabeatwell/go-chat/internal/db"
	"github.com/gabeatwell/go-chat/internal/hub"
)

const (
	adminSessionCookie   = "gochat_admin_session"
	adminSessionDuration = 30 * time.Minute
	defaultAdminPassword = "Admin1234"
)

var adminSessions = struct {
	sync.Mutex
	sessions map[string]time.Time
}{
	sessions: map[string]time.Time{},
}

func main() {
	devHTTPS := flag.Bool("dev-https", false, "Serve HTTPS with a self-signed cert on :8443")
	flag.Parse()

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

	// handlers
	swTemplate, err := os.ReadFile("web/sw.js")
	if err != nil {
		log.Fatal("Failed to read sw.js template:", err)
	}

	http.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Cache-Control", "no-cache") // SW script must always revalidate
		out := strings.Replace(string(swTemplate), "__CACHE_VERSION__", cacheVersion(), 1)
		w.Write([]byte(out))
	})
	http.Handle("/", http.FileServer(http.Dir("web")))

	http.HandleFunc("/history", func(w http.ResponseWriter, r *http.Request) {
		messages, err := db.GetRecentMessages(50)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	})

	http.HandleFunc("/subscribe", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var sub db.PushSubscription
		if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if err := db.SaveSubscription(sub); err != nil {
			http.Error(w, "internal error", 500)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(h, w, r)
	})

	http.HandleFunc("/admin/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		adminPassword := os.Getenv("ADMIN_PASSWORD")
		if adminPassword == "" {
			adminPassword = defaultAdminPassword
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		if subtle.ConstantTimeCompare([]byte(body.Password), []byte(adminPassword)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		secureCookie := r.TLS != nil
		if err := createAdminSession(w, secureCookie); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})

	http.HandleFunc("/admin/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		loggedIn := isAdmin(r)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"loggedIn": loggedIn})
	})

	http.HandleFunc("/admin/logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		clearAdminSession(w, r)
		w.WriteHeader(http.StatusNoContent)
	})

	http.HandleFunc("/clear", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		token := os.Getenv("ADMIN_TOKEN")
		if !isAdmin(r) && (token == "" || r.Header.Get("X-Admin-Token") != token) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if err := db.ClearMessages(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if *devHTTPS {
		// Generate a self-signed cert for localhost
		cert, key, err := generateSelfSignedCert()
		if err != nil {
			log.Fatal("Failed to generate TLS cert:", err)
		}

		// Write temp files (cleaned up at exit)
		certFile := "./localhost.crt"
		keyFile := "./localhost.key"
		os.WriteFile(certFile, cert, 0644)
		os.WriteFile(keyFile, key, 0644)
		defer os.Remove(certFile)
		defer os.Remove(keyFile)

		// Launch HTTP redirector on port 80 in background
		go func() {
			log.Println("HTTP redirect :80 -> https://localhost:8443")
			redirectMux := http.NewServeMux()
			redirectMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				http.Redirect(w, r, "https://localhost:8443"+r.URL.Path, http.StatusMovedPermanently)
			})
			log.Fatal(http.ListenAndServe(":80", redirectMux))
		}()

		log.Printf("Dev HTTPS server starting on https://localhost:8443%s", "")
		log.Fatal(http.ListenAndServeTLS(":8443", certFile, keyFile, nil))
	} else {
		log.Printf("Server starting on :%s", port)
		log.Fatal(http.ListenAndServe(":"+port, nil))
	}
}

func generateSelfSignedCert() ([]byte, []byte, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName: "localhost",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost", "127.0.0.1"},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}

	certPEM := pemEncode(certDER, "CERTIFICATE")
	keyBytes, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, nil, err
	}
	keyPEM := pemEncode(keyBytes, "EC PRIVATE KEY")

	return certPEM, keyPEM, nil
}

func pemEncode(data []byte, blockType string) []byte {
	b64 := base64.StdEncoding.EncodeToString(data)
	// Wrap at 64 chars
	var pem []byte
	pem = append(pem, []byte("-----BEGIN "+blockType+"-----\n")...)
	for i := 0; i < len(b64); i += 64 {
		end := i + 64
		if end > len(b64) {
			end = len(b64)
		}
		pem = append(pem, []byte(b64[i:end]+"\n")...)
	}
	pem = append(pem, []byte("-----END "+blockType+"-----\n")...)
	return pem
}

func generateRandomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func createAdminSession(w http.ResponseWriter, secure bool) error {
	token, err := generateRandomToken()
	if err != nil {
		return err
	}

	adminSessions.Lock()
	adminSessions.sessions[token] = time.Now().Add(adminSessionDuration)
	adminSessions.Unlock()

	cookie := &http.Cookie{
		Name:     adminSessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(adminSessionDuration.Seconds()),
		Secure:   secure,
	}
	http.SetCookie(w, cookie)
	return nil
}

func isAdmin(r *http.Request) bool {
	cookie, err := r.Cookie(adminSessionCookie)
	if err != nil {
		return false
	}

	adminSessions.Lock()
	expiry, ok := adminSessions.sessions[cookie.Value]
	if !ok {
		adminSessions.Unlock()
		return false
	}

	if time.Now().After(expiry) {
		delete(adminSessions.sessions, cookie.Value)
		adminSessions.Unlock()
		return false
	}
	adminSessions.Unlock()
	return true
}

func clearAdminSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(adminSessionCookie)
	if err == nil {
		adminSessions.Lock()
		delete(adminSessions.sessions, cookie.Value)
		adminSessions.Unlock()
	}

	expiredCookie := &http.Cookie{
		Name:     adminSessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Secure:   r.TLS != nil,
	}
	http.SetCookie(w, expiredCookie)
}

var buildVersion = "dev"
func cacheVersion() string {
    return "go-chat-" + buildVersion
}