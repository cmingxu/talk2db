package admin

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"talk2db/internal/agent"
	"talk2db/internal/datasource"
	"talk2db/internal/db"
	"talk2db/internal/logger"
)

type tableSpaceHandler struct {
	store    *db.Store
	registry *datasource.Registry
}

func (h *tableSpaceHandler) listTables(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}

	if err := h.registry.Open(ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tables, err := h.registry.ListTables(c.Request.Context(), id, ds.DatabaseName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

func (h *tableSpaceHandler) list(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	list, err := h.store.ListTableSpaces(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *tableSpaceHandler) add(c *gin.Context) {
	dsID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Tables []string `json:"tables"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.store.AddTableSpaces(c.Request.Context(), dsID, req.Tables); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *tableSpaceHandler) remove(c *gin.Context) {
	tsID, err := strconv.ParseInt(c.Param("tsid"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.store.DeleteTableSpace(c.Request.Context(), tsID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *tableSpaceHandler) executeSql(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Query string `json:"query"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Query) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query required"})
		return
	}
	query := strings.TrimSpace(req.Query)

	if err := agent.ValidateSQL(query); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Auto-connect if not already connected
	ds, err := h.store.GetDatasource(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}
	if err := h.registry.Open(ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("datasource connect failed: %v", err)})
		return
	}

	db, err := h.registry.GetDB(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "datasource not available"})
		return
	}

	ctx := c.Request.Context()
	logger.Info("sql_api", "executing query", map[string]any{"datasource_id": id, "query": query})

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		logger.Error("sql_api", "query failed", map[string]any{"datasource_id": id, "error": err.Error()})
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var result [][]string
	limit := 1000
	for rows.Next() {
		if len(result) >= limit {
			break
		}
		values := make([]any, len(columns))
		valuePtrs := make([]any, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		row := make([]string, len(columns))
		for i, v := range values {
			if v == nil {
				row[i] = "NULL"
			} else {
				row[i] = agent.ValueToString(v)
			}
		}
		result = append(result, row)
	}

	logger.Info("sql_api", "query completed", map[string]any{"datasource_id": id, "columns": columns, "row_count": len(result)})
	c.JSON(http.StatusOK, gin.H{"ok": true, "columns": columns, "rows": result, "count": len(result)})
}

func (h *tableSpaceHandler) testConnection(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}

	tables, err := h.registry.TestConnection(c.Request.Context(), ds)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "tables": tables})
}
