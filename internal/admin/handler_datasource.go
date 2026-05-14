package admin

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"talk2db/internal/db"
	"talk2db/internal/models"
)

// datasourceRequest is used for create/update binding so the password
// field is accepted from JSON. The model's Password has json:"-" to
// prevent leaking it in GET/LIST responses.
type datasourceRequest struct {
	Name         string `json:"name"`
	Engine       string `json:"engine"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	DatabaseName string `json:"databaseName"`
}

func (r datasourceRequest) toModel() models.Datasource {
	return models.Datasource{
		Name:         r.Name,
		Engine:       r.Engine,
		Host:         r.Host,
		Port:         r.Port,
		Username:     r.Username,
		Password:     r.Password,
		DatabaseName: r.DatabaseName,
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
	created, err := h.store.CreateDatasource(c.Request.Context(), req.toModel())
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

	// If no password provided, preserve the existing one (edit form
	// sends empty password when user didn't change it).
	if strings.TrimSpace(req.Password) == "" {
		existing, err := h.store.GetDatasource(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		ds.Password = existing.Password
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
