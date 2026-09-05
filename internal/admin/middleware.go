package admin

import (
	"bytes"
	"encoding/json"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"talk2db/internal/logger"
)

const maxLoggedFieldLen = 4096

// sensitiveKeyParts are matched case-insensitively as substrings of JSON keys.
// Any value under a matching key is redacted from request-body logging so
// passwords, API keys and tokens never end up in the log file.
var sensitiveKeyParts = []string{"password", "apikey", "api_key", "token", "secret"}

// staticExts are file extensions served to the browser (SPA assets). They are
// not "user interactions" and are skipped to keep the log focused and quiet.
var staticExts = map[string]bool{
	".js": true, ".css": true, ".map": true, ".png": true, ".jpg": true,
	".jpeg": true, ".gif": true, ".svg": true, ".ico": true, ".woff": true,
	".woff2": true, ".ttf": true, ".eot": true, ".html": true, ".json": true,
}

// requestLogger logs every HTTP request as a "user interaction" event:
// method, path, query string, client IP, user agent, response status,
// duration and a sanitized copy of the request body.
func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		var rawBody []byte
		if c.Request.Body != nil && c.Request.Method != "GET" && c.Request.Method != "HEAD" {
			rawBody, _ = io.ReadAll(c.Request.Body)
			// Restore the body so downstream handlers can read it again.
			c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
		}

		c.Next()

		if isStaticAsset(c.Request.URL.Path) {
			return
		}

		logger.Info("http_request", "user interaction", map[string]any{
			"method":         c.Request.Method,
			"path":           c.Request.URL.Path,
			"query":          c.Request.URL.RawQuery,
			"client_ip":      c.ClientIP(),
			"user_agent":     c.Request.UserAgent(),
			"status":         c.Writer.Status(),
			"duration_ms":    time.Since(start).Milliseconds(),
			"response_bytes": c.Writer.Size(),
			"body":           sanitizeBody(rawBody),
		})
	}
}

func isStaticAsset(path string) bool {
	if !strings.HasPrefix(path, "/api/") {
		// Non-API requests are the SPA shell + static assets; only skip
		// known asset extensions, keep page/document requests.
		return staticExts[strings.ToLower(filepath.Ext(path))]
	}
	return false
}

// sanitizeBody returns a log-safe string representation of a request body.
// JSON bodies are parsed and sensitive keys are redacted; non-JSON bodies are
// returned as-is (truncated).
func sanitizeBody(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return truncate(string(raw), maxLoggedFieldLen)
	}
	redact(v)
	out, err := json.Marshal(v)
	if err != nil {
		return truncate(string(raw), maxLoggedFieldLen)
	}
	return truncate(string(out), maxLoggedFieldLen)
}

func redact(v any) {
	switch t := v.(type) {
	case map[string]any:
		for k, val := range t {
			if isSensitiveKey(k) {
				t[k] = "***"
				continue
			}
			redact(val)
		}
	case []any:
		for _, item := range t {
			redact(item)
		}
	}
}

func isSensitiveKey(key string) bool {
	lk := strings.ToLower(key)
	for _, part := range sensitiveKeyParts {
		if strings.Contains(lk, part) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "...(truncated)"
}
