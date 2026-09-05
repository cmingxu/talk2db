package admin

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/cloudwego/eino/schema"
	"github.com/gin-gonic/gin"

	"talk2db/internal/agent"
	"talk2db/internal/datasource"
	"talk2db/internal/db"
	"talk2db/internal/logger"
	"talk2db/internal/models"
)

type dashboardHandler struct {
	store    *db.Store
	registry *datasource.Registry
}

type panelRequest struct {
	Name            string `json:"name"`
	SQL             string `json:"sql"`
	ChartType       string `json:"chartType"`
	Theme           string `json:"theme"`
	SortOrder       int    `json:"sortOrder"`
	RefreshInterval int    `json:"refreshInterval"`
}

func (r panelRequest) toModel(datasourceID int64) models.DashboardPanel {
	ct := r.ChartType
	switch ct {
	case "bar", "pie", "line", "text", "scatter", "bar-stack":
	default:
		ct = "bar"
	}
	theme := r.Theme
	if theme == "" {
		theme = "default"
	}
	interval := r.RefreshInterval
	if interval < 0 {
		interval = 0
	}
	return models.DashboardPanel{
		DatasourceID:    datasourceID,
		Name:            r.Name,
		SQL:             r.SQL,
		ChartType:       ct,
		Theme:           theme,
		SortOrder:       r.SortOrder,
		RefreshInterval: interval,
	}
}

func (h *dashboardHandler) list(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid datasource id"})
		return
	}
	list, err := h.store.ListDashboardPanels(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []models.DashboardPanel{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *dashboardHandler) create(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid datasource id"})
		return
	}
	var req panelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	created, err := h.store.CreateDashboardPanel(c.Request.Context(), req.toModel(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (h *dashboardHandler) update(c *gin.Context) {
	pid, err := parseID(c.Param("pid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid panel id"})
		return
	}
	var req panelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p := req.toModel(0)
	p.ID = pid
	if err := h.store.UpdateDashboardPanel(c.Request.Context(), p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *dashboardHandler) delete(c *gin.Context) {
	pid, err := parseID(c.Param("pid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid panel id"})
		return
	}
	if err := h.store.DeleteDashboardPanel(c.Request.Context(), pid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// generate uses the configured LLM to turn a natural-language request into a
// dashboard panel suggestion (name + SELECT sql + chartType + theme).
func (h *dashboardHandler) generate(c *gin.Context) {
	dsID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid datasource id"})
		return
	}

	var req struct {
		Request string `json:"request"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Request) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request is required"})
		return
	}

	llmCfg, err := h.store.GetLLMConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if llmCfg.APIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "LLM API key is not configured"})
		return
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), dsID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}
	tableSpaces, err := h.store.ListTableSpaces(c.Request.Context(), dsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	systemPrompt := agent.BuildSystemPrompt(c.Request.Context(), h.registry, ds, tableSpaces)
	systemPrompt += `
现在请根据用户的需求，为仪表盘生成一个面板。只输出一个 JSON 对象，不要输出任何其他文字，不要用代码块包裹，格式如下：
{"name":"面板名称","sql":"SELECT ...","chartType":"bar","theme":"default"}
要求：
- name: 简短有意义的中文名称
- sql: 只允许 SELECT 查询，必须基于上面列出的表和列
- chartType: 只能是 bar / pie / line / text / scatter / bar-stack 之一
- theme: 只能是 default / ocean / forest / sunset / mono 之一
- 相对时间（如"过去十分钟""最近一周""今天"）必须使用数据库相对时间函数（如 NOW() - INTERVAL 10 MINUTE、CURRENT_TIMESTAMP），禁止硬编码具体时间戳；注意 NOW() 使用数据源服务器时区
- 如果数据范围较旧且与相对时间不匹配，仍按需求生成查询（结果可能为空）
如果需求不适合画图，使用 chartType 为 text 输出一个关键指标。`

	chatModel := agent.NewOpenAIChatModel(llmCfg.BaseURL, llmCfg.APIKey, llmCfg.ModelName)
	resp, err := chatModel.Generate(c.Request.Context(), []*schema.Message{
		{Role: schema.System, Content: systemPrompt},
		{Role: schema.User, Content: fmt.Sprintf("需求：%s", req.Request)},
	})
	if err != nil {
		logger.Error("panel_generate", "llm generation failed", map[string]any{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI 生成失败: %v", err)})
		return
	}

	var suggestion struct {
		Name      string `json:"name"`
		SQL       string `json:"sql"`
		ChartType string `json:"chartType"`
		Theme     string `json:"theme"`
	}
	if err := parsePanelSuggestion(resp.Content, &suggestion); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI 返回格式无法解析: %v", err)})
		return
	}
	if strings.TrimSpace(suggestion.SQL) == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 未生成 SQL"})
		return
	}
	if err := agent.ValidateSQL(suggestion.SQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI 生成的 SQL 不合法: %v", err)})
		return
	}
	if strings.TrimSpace(suggestion.Name) == "" {
		suggestion.Name = "AI 面板"
	}
	switch suggestion.ChartType {
	case "bar", "pie", "line", "text", "scatter", "bar-stack":
	default:
		suggestion.ChartType = "bar"
	}
	switch suggestion.Theme {
	case "default", "ocean", "forest", "sunset", "mono":
	default:
		suggestion.Theme = "default"
	}

	c.JSON(http.StatusOK, gin.H{
		"name":      suggestion.Name,
		"sql":       suggestion.SQL,
		"chartType": suggestion.ChartType,
		"theme":     suggestion.Theme,
	})
}

// parsePanelSuggestion extracts a JSON object from an LLM response, tolerating
// markdown code fences and surrounding prose.
func parsePanelSuggestion(content string, out any) error {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return fmt.Errorf("no JSON object found in response")
	}
	return json.Unmarshal([]byte(content[start:end+1]), out)
}

// data executes the SQL of one or more panels (all when panelIds is empty)
// and returns chart-ready columns/rows for each. Queries are validated as
// read-only SELECT and capped at maxPanelRows rows per panel.
func (h *dashboardHandler) data(c *gin.Context) {
	dsID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid datasource id"})
		return
	}

	var req struct {
		PanelIDs []int64 `json:"panelIds"`
	}
	_ = c.ShouldBindJSON(&req)

	var panels []models.DashboardPanel
	if len(req.PanelIDs) > 0 {
		for _, pid := range req.PanelIDs {
			p, err := h.store.GetDashboardPanel(c.Request.Context(), pid)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("panel %d not found", pid)})
				return
			}
			if p.DatasourceID != dsID {
				c.JSON(http.StatusForbidden, gin.H{"error": "panel does not belong to this datasource"})
				return
			}
			panels = append(panels, p)
		}
	} else {
		panels, err = h.store.ListDashboardPanels(c.Request.Context(), dsID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), dsID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}
	if err := h.registry.Open(ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("datasource connect failed: %v", err)})
		return
	}
	conn, err := h.registry.GetDB(dsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "datasource not available"})
		return
	}

	const maxPanelRows = 1000
	type panelResult struct {
		ID        int64      `json:"id"`
		Name      string     `json:"name"`
		ChartType string     `json:"chartType"`
		Theme     string     `json:"theme"`
		Columns   []string   `json:"columns,omitempty"`
		Rows      [][]string `json:"rows,omitempty"`
		Count     int        `json:"count"`
		Error     string     `json:"error,omitempty"`
	}

	// Execute every panel's query concurrently (sql.DB is safe for parallel
	// use), so one slow query doesn't block the whole dashboard.
	results := make([]panelResult, len(panels))
	var wg sync.WaitGroup
	for i, p := range panels {
		wg.Add(1)
		go func(i int, p models.DashboardPanel) {
			defer wg.Done()
			results[i] = executePanelQuery(c.Request.Context(), conn, p, maxPanelRows)
		}(i, p)
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{"panels": results})
}

// executePanelQuery runs a single panel's SQL (validated read-only SELECT,
// capped at maxRows) and returns chart-ready data or an error message.
func executePanelQuery(ctx context.Context, conn *sql.DB, p models.DashboardPanel, maxRows int) (result struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	ChartType string     `json:"chartType"`
	Theme     string     `json:"theme"`
	Columns   []string   `json:"columns,omitempty"`
	Rows      [][]string `json:"rows,omitempty"`
	Count     int        `json:"count"`
	Error     string     `json:"error,omitempty"`
}) {
	result.ID = p.ID
	result.Name = p.Name
	result.ChartType = p.ChartType
	result.Theme = p.Theme

	query := p.SQL
	if err := agent.ValidateSQL(query); err != nil {
		logger.Error("dashboard_data", "invalid panel sql", map[string]any{
			"panel_id": p.ID,
			"error":    err.Error(),
		})
		result.Error = err.Error()
		return
	}
	logger.Info("dashboard_data", "executing panel sql", map[string]any{
		"panel_id": p.ID,
		"query":    query,
	})
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		logger.Error("dashboard_data", "query failed", map[string]any{
			"panel_id": p.ID,
			"query":    query,
			"error":    err.Error(),
		})
		result.Error = err.Error()
		return
	}
	cols, err := rows.Columns()
	if err != nil {
		rows.Close()
		logger.Error("dashboard_data", "failed to get columns", map[string]any{
			"panel_id": p.ID,
			"error":    err.Error(),
		})
		result.Error = err.Error()
		return
	}
	var out [][]string
	for rows.Next() && len(out) < maxRows {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			logger.Error("dashboard_data", "row scan failed", map[string]any{
				"panel_id": p.ID,
				"error":    err.Error(),
			})
			result.Error = err.Error()
			break
		}
		row := make([]string, len(cols))
		for i, v := range values {
			if v == nil {
				row[i] = "NULL"
			} else {
				row[i] = agent.ValueToString(v)
			}
		}
		out = append(out, row)
	}
	rows.Close()
	if result.Error == "" {
		result.Columns = cols
		result.Rows = out
		result.Count = len(out)
	}
	logger.Info("dashboard_data", "panel executed", map[string]any{
		"panel_id": p.ID,
		"rows":     len(out),
		"query":    query,
	})
	return
}

// exportData streams a panel's FULL query result as a CSV download — no row
// cap (unlike the chart data endpoint). Header = database fields.
func (h *dashboardHandler) exportData(c *gin.Context) {
	dsID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid datasource id"})
		return
	}
	pid, err := parseID(c.Param("pid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid panel id"})
		return
	}

	panel, err := h.store.GetDashboardPanel(c.Request.Context(), pid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "panel not found"})
		return
	}
	if panel.DatasourceID != dsID {
		c.JSON(http.StatusForbidden, gin.H{"error": "panel does not belong to this datasource"})
		return
	}
	if err := agent.ValidateSQL(panel.SQL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), dsID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}
	if err := h.registry.Open(ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("datasource connect failed: %v", err)})
		return
	}
	conn, err := h.registry.GetDB(dsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "datasource not available"})
		return
	}

	rows, err := conn.QueryContext(c.Request.Context(), panel.SQL)
	if err != nil {
		logger.Error("panel_export", "query failed", map[string]any{
			"datasource_id": dsID,
			"panel_id":      pid,
			"query":         panel.SQL,
			"error":         err.Error(),
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	logger.Info("panel_export", "exporting panel data", map[string]any{
		"datasource_id": dsID,
		"panel_id":      pid,
		"query":         panel.SQL,
	})
	cols, err := rows.Columns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := exportFilename(panel.Name)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	// RFC 5987: ASCII fallback + UTF-8 encoded name so Chinese filenames
	// survive browsers (raw UTF-8 in filename="..." gets mojibake'd).
	c.Header("Content-Disposition", fmt.Sprintf(
		"attachment; filename*=UTF-8''%s; filename=%q",
		url.PathEscape(filename), exportAsciiFallback(panel.Name),
	))
	// UTF-8 BOM so Excel opens Chinese correctly.
	if _, err := c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return
	}

	csvw := csv.NewWriter(c.Writer)
	csvw.UseCRLF = true // Windows/Excel-friendly line endings
	if err := csvw.Write(cols); err != nil {
		logger.Error("panel_export", "write header failed", map[string]any{"error": err.Error()})
		return
	}
	rowCount := 0
	values := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range values {
		ptrs[i] = &values[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		rec := make([]string, len(cols))
		for i, v := range values {
			if v == nil {
				rec[i] = ""
			} else {
				rec[i] = agent.ValueToString(v)
			}
		}
		if err := csvw.Write(rec); err != nil {
			break
		}
		rowCount++
	}
	csvw.Flush()
	logger.Info("panel_export", "export completed", map[string]any{
		"datasource_id": dsID,
		"panel_id":      pid,
		"rows":          rowCount,
	})
}

// exportAsciiFallback returns a safe ASCII-only fallback filename for the
// legacy filename="..." Content-Disposition part.
func exportAsciiFallback(name string) string {
	name = exportFilename(name)
	var b strings.Builder
	for _, r := range name {
		if r < 128 && r != '"' && r != '\\' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	s := b.String()
	if strings.TrimSpace(s) == "" || s == ".csv" {
		return "panel.csv"
	}
	return s
}

// exportFilename builds a safe download filename (without extension).
func exportFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "panel"
	}
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_", "?", "_",
		"\"", "_", "<", "_", ">", "_", "|", "_",
	)
	name = replacer.Replace(name)
	name = strings.Join(strings.Fields(name), "_")
	name = strings.TrimRight(name, ". ")
	runes := []rune(name)
	if len(runes) > 60 {
		name = string(runes[:60])
	}
	return strings.TrimSpace(name) + ".csv"
}
