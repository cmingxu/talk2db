package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"

	"talk2db/internal/agent"
	"talk2db/internal/db"
	"talk2db/internal/models"
)

type sessionHandler struct {
	store        *db.Store
	sessionStore sessions.Store
}

func (h *sessionHandler) list(c *gin.Context) {
	userID := getUserID(c, h.sessionStore)
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	role := getRole(c)
	var queryUserID int64 = userID
	if role == models.RoleAdmin && c.Query("all") == "true" {
		queryUserID = 0
	}

	var dsID *int64
	if v := c.Query("datasourceId"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err == nil {
			dsID = &id
		}
	}

	list, err := h.store.ListSessionsByUser(c.Request.Context(), queryUserID, dsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

type recentSession struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	DatasourceID   int64  `json:"datasourceId"`
	DatasourceName string `json:"datasourceName"`
	LastMessage    string `json:"lastMessage"`
	UpdatedAt      string `json:"updatedAt"`
}

func (h *sessionHandler) recent(c *gin.Context) {
	userID := getUserID(c, h.sessionStore)
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	sessions, err := h.store.ListRecentSessions(c.Request.Context(), userID, 3)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]recentSession, 0, len(sessions))
	for _, s := range sessions {
		rs := recentSession{
			ID:           s.ID,
			Name:         s.Name,
			DatasourceID: s.DatasourceID,
			UpdatedAt:    s.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}

		if ds, err := h.store.GetDatasource(c.Request.Context(), s.DatasourceID); err == nil {
			rs.DatasourceName = ds.Name
		}

		if msg, err := h.store.GetLastUserMessage(c.Request.Context(), s.ID); err == nil {
			preview := msg.Content
			if len([]rune(preview)) > 100 {
				preview = string([]rune(preview)[:100]) + "..."
			}
			rs.LastMessage = preview
		}

		result = append(result, rs)
	}

	c.JSON(http.StatusOK, result)
}

func (h *sessionHandler) create(c *gin.Context) {
	userID := getUserID(c, h.sessionStore)
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Name         string `json:"name"`
		DatasourceID int64  `json:"datasourceId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	session, err := h.store.CreateSession(c.Request.Context(), models.Session{
		Name:         req.Name,
		DatasourceID: req.DatasourceID,
		UserID:       userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, session)
}

func (h *sessionHandler) get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	session, err := h.store.GetSession(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !h.checkSessionOwnership(c, session) {
		return
	}
	c.JSON(http.StatusOK, session)
}

func (h *sessionHandler) update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	session, err := h.store.GetSession(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !h.checkSessionOwnership(c, session) {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.store.UpdateSession(c.Request.Context(), models.Session{ID: id, Name: req.Name}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *sessionHandler) delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	session, err := h.store.GetSession(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !h.checkSessionOwnership(c, session) {
		return
	}
	if err := h.store.DeleteSession(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	agent.GetMemoryStore().Remove(id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *sessionHandler) checkSessionOwnership(c *gin.Context, session models.Session) bool {
	userID := getUserID(c, h.sessionStore)
	role := getRole(c)
	if role != models.RoleAdmin && session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return false
	}
	return true
}
