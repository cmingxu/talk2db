package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"talk2db/internal/agent"
	"talk2db/internal/db"
	"talk2db/internal/models"
)

type llmHandler struct {
	store        *db.Store
	agentFactory *agent.AgentFactory
}

func (h *llmHandler) get(c *gin.Context) {
	cfg, err := h.store.GetLLMConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cfg.APIKey = "" // never send API key to client
	c.JSON(http.StatusOK, cfg)
}

type llmConfigRequest struct {
	Provider  string `json:"provider"`
	BaseURL   string `json:"baseUrl"`
	APIKey    string `json:"apiKey"`
	ModelName string `json:"modelName"`
}

func (h *llmHandler) update(c *gin.Context) {
	var req llmConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	cfg := models.LLMConfig{
		ID:        1,
		Provider:  req.Provider,
		BaseURL:   req.BaseURL,
		APIKey:    req.APIKey,
		ModelName: req.ModelName,
	}

	if cfg.APIKey == "" {
		existing, err := h.store.GetLLMConfig(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if existing.APIKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "API key is required"})
			return
		}
		cfg.APIKey = existing.APIKey
	}

	if err := h.store.UpdateLLMConfig(ctx, cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.agentFactory != nil {
		h.agentFactory.InvalidateAll()
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
