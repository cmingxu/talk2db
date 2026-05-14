package admin

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"
)

func isSecureRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		return true
	}
	if strings.EqualFold(r.Header.Get("X-Forwarded-Ssl"), "on") {
		return true
	}
	return false
}

func authMiddleware(sessionStore sessions.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") {
			if p == "/api/login" {
				c.Next()
				return
			}

			session, _ := sessionStore.Get(c.Request, "session-name")
			if auth, ok := session.Values["authenticated"].(bool); !ok || !auth {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				c.Abort()
				return
			}

			var userID int64
			switch v := session.Values["userID"].(type) {
			case int64:
				userID = v
			case int:
				userID = int64(v)
			case int32:
				userID = int64(v)
			case float64:
				userID = int64(v)
			}
			if userID <= 0 {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				c.Abort()
				return
			}

			role, _ := session.Values["role"].(string)
			c.Set("userID", userID)
			c.Set("role", role)
			c.Next()
			return
		}

		if p == "/login" || p == "/assets/" || strings.HasPrefix(p, "/assets/") {
			c.Next()
			return
		}

		session, _ := sessionStore.Get(c.Request, "session-name")
		if auth, ok := session.Values["authenticated"].(bool); !ok || !auth {
			c.Redirect(http.StatusFound, "/login")
			c.Abort()
			return
		}
		c.Next()
	}
}

func getUserID(c *gin.Context, sessionStore sessions.Store) int64 {
	if uid, exists := c.Get("userID"); exists {
		return uid.(int64)
	}
	session, _ := sessionStore.Get(c.Request, "session-name")
	if uid, ok := session.Values["userID"].(int64); ok {
		return uid
	}
	return 0
}
