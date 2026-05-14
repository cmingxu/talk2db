package admin

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"talk2db/internal/db"
)

type systemHandler struct {
	store *db.Store
}

func (h *systemHandler) get(c *gin.Context) {
	if h.store == nil {
		c.JSON(http.StatusOK, gin.H{"items": gin.H{}})
		return
	}
	sc, err := h.store.GetSystemConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": map[string]string{
			"warn_text": sc.WarnText,
		},
	})
}

func (h *systemHandler) update(c *gin.Context) {
	if h.store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "db not configured"})
		return
	}
	var req struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var upd db.SystemConfigUpdate
	switch strings.ToLower(strings.TrimSpace(req.Key)) {
	case "warn_text":
		upd.WarnText = &req.Value
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown key"})
		return
	}

	if _, err := h.store.UpdateSystemConfig(c.Request.Context(), upd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
