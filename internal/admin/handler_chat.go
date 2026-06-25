package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"

	"talk2db/internal/agent"
	"talk2db/internal/db"
	"talk2db/internal/datasource"
	"talk2db/internal/logger"
	"talk2db/internal/models"
	"talk2db/internal/skill"
)

type chatHandler struct {
	store         *db.Store
	registry      *datasource.Registry
	agentFactory  *agent.AgentFactory
	sessionStore  sessions.Store
	memoryStore   *agent.MemoryStore
	skillRegistry *skill.Registry
	skillRunner   *skill.Runner
}

func (h *chatHandler) messages(c *gin.Context) {
	sessionID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	userID := getUserID(c, h.sessionStore)
	role := getRole(c)
	if role != models.RoleAdmin && session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	list, err := h.store.ListMessages(c.Request.Context(), sessionID, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *chatHandler) chat(c *gin.Context) {
	sessionID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	var req struct {
		Message string `json:"message"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message required"})
		return
	}
	userContent := strings.TrimSpace(req.Message)

	// Load session and datasource
	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	// Ownership check
	userID := getUserID(c, h.sessionStore)
	role := getRole(c)
	if role != models.RoleAdmin && session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	// Datasource permission check for normal users
	if role == models.RoleNormal {
		assigned, err := h.store.GetUserDatasourceIDs(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		found := false
		for _, id := range assigned {
			if id == session.DatasourceID {
				found = true
				break
			}
		}
		if !found {
			c.JSON(http.StatusForbidden, gin.H{"error": "datasource not assigned"})
			return
		}
	}

	ds, err := h.store.GetDatasource(c.Request.Context(), session.DatasourceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "datasource not found"})
		return
	}

	// Load previous messages BEFORE saving current one (so history excludes it)
	prevMessages, err := h.store.ListMessages(c.Request.Context(), sessionID, 0)
	if err != nil {
		logger.Error("chat_context", "failed to load history", map[string]any{
			"session_id": sessionID,
			"error":      err.Error(),
		})
	}

	// Save user message
	_, err = h.store.AddMessage(c.Request.Context(), models.Message{
		SessionID: sessionID,
		Role:      "user",
		Content:   userContent,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logger.Info("chat_request", "incoming chat message", map[string]any{
		"session_id":    sessionID,
		"user_id":       session.UserID,
		"datasource_id": ds.ID,
		"message":       userContent,
	})

	// Load table spaces for this datasource
	tableSpaces, err := h.store.ListTableSpaces(c.Request.Context(), ds.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Build system prompt
	systemPrompt := agent.BuildSystemPrompt(c.Request.Context(), h.registry, ds, tableSpaces)

	// Append skill prompts
	if h.skillRegistry != nil {
		skillPrompt := buildSkillPrompt(h.skillRegistry)
		if skillPrompt != "" {
			systemPrompt += "\n\n" + skillPrompt
		}
	}

	// Get LLM config
	llmCfg, err := h.store.GetLLMConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Errorf("get llm config: %w", err).Error()})
		return
	}
	if llmCfg.APIKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "LLM API key is not configured"})
		return
	}

	// Open target DB connection
	if err := h.registry.Open(ds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Errorf("open datasource: %w", err).Error()})
		return
	}

	// Create model and tools
	chatModel := agent.NewOpenAIChatModel(llmCfg.BaseURL, llmCfg.APIKey, llmCfg.ModelName)

	// 1. execute_sql tool (always present)
	sqlTool, err := agent.NewSQLExecuteTool(h.registry, ds.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 2. Skill tools
	var allTools []tool.InvokableTool
	allTools = append(allTools, sqlTool)

	// 保留 tool 名称，skill tool 不能覆盖
		reservedTools := map[string]bool{"execute_sql": true}

		// 收集 skill tool 的 name → InvokableTool 映射，供执行阶段使用
	skillToolMap := make(map[string]tool.InvokableTool)
	if h.skillRegistry != nil {
		for _, sk := range h.skillRegistry.AllSkills() {
			for _, st := range sk.Tools {
				if reservedTools[st.Name] {
					logger.Error("skill_setup", "skill tool name conflicts with reserved tool", map[string]any{
						"tool": st.Name,
					})
					continue
				}
				einoTool := skill.NewEinoTool(h.skillRunner, &st)
				allTools = append(allTools, einoTool)
				skillToolMap[st.Name] = einoTool
			}
		}
	}

	// 3. 收集所有 tool info 并绑定到 model
	var toolInfos []*schema.ToolInfo
	for _, t := range allTools {
		info, err := t.Info(c.Request.Context())
		if err != nil {
			logger.Error("skill_setup", "failed to get tool info", map[string]any{
				"error": err.Error(),
			})
			continue
		}
		toolInfos = append(toolInfos, info)
	}

	tooledModel, err := chatModel.WithTools(toolInfos)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Setup SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	ctx := c.Request.Context()

	// Build conversation history from previous DB messages
	var history []*schema.Message
	for _, m := range prevMessages {
		history = append(history, &schema.Message{
			Role:    schema.RoleType(m.Role),
			Content: m.Content,
		})
	}

	sessionMemory := h.memoryStore.Get(sessionID)
	messages := agent.CompactMessages(systemPrompt, sessionMemory, history, userContent, agent.DefaultMaxTokens)

	const maxSteps = 30
	var allSQL []string

	// Custom ReAct loop
	for step := 0; step < maxSteps; step++ {
		resp, err := tooledModel.Generate(ctx, messages)
		if err != nil {
			logger.Error("chat_response", "model generation failed", map[string]any{
				"session_id": sessionID,
				"step":       step,
				"error":      err.Error(),
			})
			sendSSEEvent(c.Writer, flusher, "error", map[string]string{"error": err.Error()})
			return
		}


		if len(resp.ToolCalls) > 0 {
			// Append assistant message with tool calls to conversation
			messages = append(messages, resp)

			for _, tc := range resp.ToolCalls {
				toolName := tc.Function.Name
				toolArgs := tc.Function.Arguments

				sendSSEEvent(c.Writer, flusher, "tool_call", map[string]string{
					"tool":      toolName,
					"arguments": toolArgs,
				})

				var resultJSON string
				var toolErr error

				if skTool, ok := skillToolMap[toolName]; ok {
					// Skill tool: LLM 传入的 toolArgs 已是扁平参数 JSON，
					// 直接传给 InvokableRun
					resultJSON, toolErr = skTool.InvokableRun(ctx, toolArgs)
				} else {
					// 默认：execute_sql tool
					resultJSON, toolErr = sqlTool.InvokableRun(ctx, toolArgs)
				}
				if toolErr != nil {
					logger.Error("chat_response", "tool execution failed", map[string]any{
						"session_id": sessionID,
						"tool":       toolName,
						"error":      toolErr.Error(),
					})
					sendSSEEvent(c.Writer, flusher, "tool_result", map[string]any{
						"tool":  toolName,
						"error": toolErr.Error(),
					})
				} else {
					// Try SQL result format first (must have columns field to qualify)
					var sqlResult struct {
						Columns []string   `json:"columns"`
						Rows    [][]string `json:"rows"`
						Count   int        `json:"count"`
						Error   string     `json:"error,omitempty"`
					}
					if json.Unmarshal([]byte(resultJSON), &sqlResult) == nil && sqlResult.Columns != nil {
						sendSSEEvent(c.Writer, flusher, "tool_result", map[string]any{
							"tool":    toolName,
							"type":    "table",
							"columns": sqlResult.Columns,
							"rows":    sqlResult.Rows,
							"count":   sqlResult.Count,
							"error":   sqlResult.Error,
						})
					} else {
						// Skill tool result: unwrap {success, result: {type, config, ...}}
						var skillResult struct {
							Success bool           `json:"success"`
							Result  map[string]any `json:"result"`
							Error   string         `json:"error"`
						}
						if json.Unmarshal([]byte(resultJSON), &skillResult) == nil && skillResult.Success && skillResult.Result != nil {
							resultData := map[string]any{"tool": toolName}
							for k, v := range skillResult.Result {
								resultData[k] = v
							}
							if skillResult.Error != "" {
								resultData["error"] = skillResult.Error
							}
							sendSSEEvent(c.Writer, flusher, "tool_result", resultData)
						} else {
							sendSSEEvent(c.Writer, flusher, "tool_result", map[string]any{
								"tool":   toolName,
								"result": resultJSON,
							})
						}
					}
				}

				// Collect SQL for saving
				if toolName == "execute_sql" {
					var args struct {
						Query string `json:"query"`
					}
					if json.Unmarshal([]byte(toolArgs), &args) == nil && args.Query != "" {
						allSQL = append(allSQL, args.Query)
					}
				}

				// Append tool result to conversation (truncated for token budget)
				messages = append(messages, schema.ToolMessage(agent.CompactToolResult(resultJSON), tc.ID, schema.WithToolName(toolName)))
			}
		} else {
			// Final response — no tool calls
			sendSSEEvent(c.Writer, flusher, "text", map[string]string{"content": resp.Content})

			// Save assistant message
			assistantSQL := ""
			if len(allSQL) > 0 {
				assistantSQL = strings.Join(allSQL, ";\n")
			}
			_, err = h.store.AddMessage(ctx, models.Message{
				SessionID: sessionID,
				Role:      "assistant",
				Content:   resp.Content,
				SQL:       assistantSQL,
			})
			if err != nil {
				logger.Error("chat_response", "failed to save assistant message", map[string]any{
					"session_id": sessionID,
					"error":      err.Error(),
				})
			}

			// Update session memory with queries and facts from this turn
			h.updateMemory(ctx, sessionID, userContent, allSQL)

			// Auto-generate session title on first message
			if len(prevMessages) == 0 {
				h.generateTitle(ctx, llmCfg.BaseURL, llmCfg.APIKey, llmCfg.ModelName, sessionID, userContent)
			}

			logger.Info("chat_response", "chat completed", map[string]any{
				"session_id":     sessionID,
				"content_length": len(resp.Content),
				"steps":          step + 1,
				"sqls":           allSQL,
			})

			sendSSEEvent(c.Writer, flusher, "done", map[string]string{})
			return
		}
	}

	// Exceeded max steps
	logger.Error("chat_response", "exceeds max steps", map[string]any{
		"session_id": sessionID,
	})
	sendSSEEvent(c.Writer, flusher, "error", map[string]string{"error": "exceeds max steps"})
}

func sendSSEEvent(w http.ResponseWriter, flusher http.Flusher, event string, data any) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(b))
	flusher.Flush()
}

// generateTitle calls the LLM to produce a short session title from the
// first user message. Errors are logged but not returned — title generation
// is best-effort and must not block the chat response.
func (h *chatHandler) generateTitle(ctx context.Context, baseURL, apiKey, modelName string, sessionID int64, userMessage string) {
	titleModel := agent.NewOpenAIChatModel(baseURL, apiKey, modelName)
	msgs := []*schema.Message{
		{Role: schema.System, Content: "Generate a concise title (under 15 characters) for a conversation. Return ONLY the title, no quotes, no explanation."},
		{Role: schema.User, Content: userMessage},
	}

	resp, err := titleModel.Generate(ctx, msgs)
	if err != nil {
		logger.Error("title_gen", "failed to generate title", map[string]any{"error": err.Error()})
		return
	}

	title := strings.TrimSpace(resp.Content)
	if title == "" {
		return
	}

	if err := h.store.UpdateSession(ctx, models.Session{ID: sessionID, Name: title}); err != nil {
		logger.Error("title_gen", "failed to update session title", map[string]any{"error": err.Error()})
	}
}

// updateMemory extracts key information from a completed chat turn and
// stores it in the session memory for use in future compaction cycles.
func (h *chatHandler) updateMemory(_ context.Context, sessionID int64, userMsg string, sqls []string) {
	// Record executed SQL queries (columns/rows are not available here,
	// but the query text itself is valuable context)
	for _, sql := range sqls {
		h.memoryStore.AddQuery(sessionID, agent.QueryRecord{
			SQL: sql,
		})
	}

	// Record a concise fact about what was asked
	if len(userMsg) > 150 {
		userMsg = userMsg[:150] + "..."
	}
	h.memoryStore.AddFact(sessionID, "用户问: "+userMsg)
}

// buildSkillPrompt 从已注册的 skill 构建要注入的 system prompt 片段。
func buildSkillPrompt(reg *skill.Registry) string {
	skills := reg.AllSkills()
	if len(skills) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("[可用技能 - 根据用户需求选择合适的工具]\n\n")
	for _, sk := range skills {
		sb.WriteString(fmt.Sprintf("## %s (%s)\n", sk.DisplayName, sk.Name))
		sb.WriteString(sk.Description + "\n")
		if sk.Prompt != "" {
			sb.WriteString(sk.Prompt + "\n")
		}
		toolNames := make([]string, len(sk.Tools))
		for i, t := range sk.Tools {
			toolNames[i] = t.Name
		}
		sb.WriteString(fmt.Sprintf("可用工具: %s\n\n", strings.Join(toolNames, ", ")))
	}
	return sb.String()
}
