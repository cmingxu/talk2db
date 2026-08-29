package admin

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"talk2db/internal/db"
	"talk2db/internal/models"
)

// datasourceRequest is used for create/update binding so the password
// field is accepted from JSON. The model's Password has json:"-" to
// prevent leaking it in GET/LIST responses.
type datasourceRequest struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Engine       string `json:"engine"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	DatabaseName string `json:"databaseName"`
	ChatTitle    string `json:"chatTitle"`
	ChatDesc     string `json:"chatDesc"`
}

func (r datasourceRequest) toModel() models.Datasource {
	return models.Datasource{
		Name:         r.Name,
		Slug:         r.Slug,
		Engine:       r.Engine,
		Host:         r.Host,
		Port:         r.Port,
		Username:     r.Username,
		Password:     r.Password,
		DatabaseName: r.DatabaseName,
		ChatTitle:    r.ChatTitle,
		ChatDesc:     r.ChatDesc,
	}
}

type datasourceHandler struct {
	store *db.Store
}

func (h *datasourceHandler) list(c *gin.Context) {
	uid := c.GetInt64("userID")
	role := getRole(c)
	list, err := h.store.ListDatasourcesForUser(c.Request.Context(), uid, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []models.Datasource{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *datasourceHandler) create(c *gin.Context) {
	var req datasourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ds := req.toModel()
	// Default the chat title to the datasource name when not provided.
	if strings.TrimSpace(ds.ChatTitle) == "" {
		ds.ChatTitle = ds.Name
	}
	// Default the slug from the name when not provided.
	if strings.TrimSpace(ds.Slug) == "" {
		ds.Slug = db.Slugify(ds.Name)
		if ds.Slug == "" {
			ds.Slug = fmt.Sprintf("ds-%d", time.Now().Unix())
		}
	}
	created, err := h.store.CreateDatasource(c.Request.Context(), ds)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (h *datasourceHandler) get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ds, err := h.store.GetDatasource(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, ds)
}

// lookup resolves a datasource by slug (e.g. /chat/sakila-movies) with a
// numeric-id fallback so legacy /chat/1 links keep working.
func (h *datasourceHandler) lookup(c *gin.Context) {
	ds, err := h.store.LookupDatasource(c.Request.Context(), c.Param("ref"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}
	c.JSON(http.StatusOK, ds)
}

func (h *datasourceHandler) update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req datasourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ds := req.toModel()
	ds.ID = id

	// Preserve existing password/chat title/slug when not provided (the edit
	// form sends empty values when the user didn't change them).
	if strings.TrimSpace(req.Password) == "" || strings.TrimSpace(req.ChatTitle) == "" || strings.TrimSpace(req.Slug) == "" {
		existing, err := h.store.GetDatasource(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if strings.TrimSpace(req.Password) == "" {
			ds.Password = existing.Password
		}
		if strings.TrimSpace(req.ChatTitle) == "" {
			ds.ChatTitle = existing.ChatTitle
		}
		if strings.TrimSpace(req.Slug) == "" {
			ds.Slug = existing.Slug
		}
	}

	if err := h.store.UpdateDatasource(c.Request.Context(), ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *datasourceHandler) delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.store.DeleteDatasource(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
