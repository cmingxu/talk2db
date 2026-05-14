//go:build embed

package webui

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed all:dist
var distFS embed.FS

func Register(r *gin.Engine) {
	d, err := fs.Sub(distFS, "dist")
	if err != nil {
		return
	}
	fsys := http.FS(d)

	r.GET("/", func(c *gin.Context) {
		serveIndexFromFS(c, d)
	})

	r.GET("/assets/*path", func(c *gin.Context) {
		p := strings.TrimPrefix(c.Param("path"), "/")
		if p == "" {
			c.Status(http.StatusNotFound)
			return
		}
		if info, err := fs.Stat(d, "assets/"+p); err == nil && !info.IsDir() {
			c.FileFromFS("assets/"+p, fsys)
			return
		}
		c.Status(http.StatusNotFound)
	})

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		serveIndexFromFS(c, d)
	})
}

func serveIndexFromFS(c *gin.Context, dist fs.FS) {
	f, err := dist.Open("index.html")
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer f.Close()
	b, _ := io.ReadAll(f)
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html; charset=utf-8", b)
}
