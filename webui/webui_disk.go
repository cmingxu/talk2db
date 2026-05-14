//go:build !embed

package webui

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

func Register(r *gin.Engine) {
	distDir := filepath.Join("webui", "dist")
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return
	}

	fs := http.Dir(distDir)

	r.GET("/", func(c *gin.Context) {
		serveIndexFromPath(c, indexPath)
	})

	r.GET("/assets/*path", func(c *gin.Context) {
		p := strings.TrimPrefix(c.Param("path"), "/")
		if p == "" {
			c.Status(http.StatusNotFound)
			return
		}
		c.FileFromFS(filepath.Join("assets", p), fs)
	})

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		serveIndexFromPath(c, indexPath)
	})
}

func serveIndexFromPath(c *gin.Context, indexPath string) {
	b, err := os.ReadFile(indexPath)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html; charset=utf-8", b)
}
