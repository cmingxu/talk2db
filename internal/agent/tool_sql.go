package agent

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	"talk2db/internal/datasource"
	"talk2db/internal/logger"
)

// ctxKey is an unexported type for context keys, avoiding collisions.
type ctxKey string

const sessionIDKey ctxKey = "talk2db.session_id"

// WithSessionID returns a context carrying the chat session ID so SQL tool
// logs can be correlated back to the conversation that triggered them.
func WithSessionID(ctx context.Context, sessionID int64) context.Context {
	return context.WithValue(ctx, sessionIDKey, sessionID)
}

// SessionIDFrom returns the session ID stored in ctx, or 0 when absent.
func SessionIDFrom(ctx context.Context) int64 {
	if v, ok := ctx.Value(sessionIDKey).(int64); ok {
		return v
	}
	return 0
}

// forbiddenKeywords are SQL statements that should never be executed.
var forbiddenKeywords = []string{"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE"}

// keywordPattern matches forbidden keywords as whole words only.
// Uses \b (word boundary) so column/table names like "last_updated" or
// "updates" don't trigger false positives for "UPDATE".
var keywordPattern = buildKeywordPattern()

// fromTablePattern matches the first table name in a FROM clause (used to
// derive a default download filename).
var fromTablePattern = regexp.MustCompile(`(?i)\bfrom\s+([a-zA-Z0-9_."` + "`" + `]+)`)

func buildKeywordPattern() *regexp.Regexp {
	var parts []string
	for _, kw := range forbiddenKeywords {
		parts = append(parts, regexp.QuoteMeta(kw))
	}
	return regexp.MustCompile(`\b(` + strings.Join(parts, "|") + `)\b`)
}

// ValidateSQL checks that a query is a read-only SELECT and returns
// an error with the forbidden keyword if found, or nil if the query is safe.
func ValidateSQL(query string) error {
	upper := strings.ToUpper(strings.TrimSpace(query))
	if upper == "" {
		return fmt.Errorf("empty query")
	}
	if !strings.HasPrefix(upper, "SELECT") {
		return fmt.Errorf("only SELECT queries are allowed")
	}
	if m := keywordPattern.FindString(upper); m != "" {
		return fmt.Errorf("forbidden keyword: %s", m)
	}
	return nil
}

type sqlToolInput struct {
	Query string `json:"query" jsonschema:"required" jsonschema_description:"The SELECT SQL query to execute"`
	// Filename lets the LLM suggest a meaningful download name for the query
	// result (no extension, e.g. "2024年各部门销售额").
	Filename string `json:"filename" jsonschema_description:"可选：为查询结果指定有意义的下载文件名（不含扩展名，例如 '2024年各部门销售额'）。不提供时自动根据查询生成。"`
}

type sqlToolOutput struct {
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
	Count   int        `json:"count"`
	Error   string     `json:"error,omitempty"`
	// Filename is the suggested download filename (without extension) for
	// the result, either provided by the LLM or auto-generated.
	Filename string `json:"filename"`
}

func NewSQLExecuteTool(reg *datasource.Registry, dsID int64) (tool.InvokableTool, error) {
	return utils.InferTool("execute_sql",
		"Execute a read-only SQL SELECT query against the database and return results as JSON with columns and rows.",
		func(ctx context.Context, input sqlToolInput) (sqlToolOutput, error) {
			start := time.Now()
			sessionID := SessionIDFrom(ctx)
			query := strings.TrimSpace(input.Query)

			// Log every SQL statement the agent produces, even the ones that
			// fail validation, so the full SQL trail is available for audit.
			logger.Info("sql", "agent sql statement", map[string]any{
				"datasource_id": dsID,
				"session_id":    sessionID,
				"query":         query,
				"filename":      input.Filename,
			})

			if err := ValidateSQL(query); err != nil {
				logger.Error("sql", "agent sql rejected", map[string]any{
					"datasource_id": dsID,
					"session_id":    sessionID,
					"query":         query,
					"error":         err.Error(),
					"duration_ms":   time.Since(start).Milliseconds(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			filename := sanitizeFilename(input.Filename)
			if filename == "" {
				filename = defaultFilename(query)
			}

			db, err := reg.GetDB(dsID)
			if err != nil {
				logger.Error("sql", "failed to get db connection", map[string]any{
					"datasource_id": dsID,
					"session_id":    sessionID,
					"query":         query,
					"error":         err.Error(),
					"duration_ms":   time.Since(start).Milliseconds(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			rows, err := db.QueryContext(ctx, query)
			if err != nil {
				logger.Error("sql", "query execution failed", map[string]any{
					"datasource_id": dsID,
					"session_id":    sessionID,
					"query":         query,
					"error":         err.Error(),
					"duration_ms":   time.Since(start).Milliseconds(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}
			defer rows.Close()

			columns, err := rows.Columns()
			if err != nil {
				logger.Error("sql", "failed to get columns", map[string]any{
					"datasource_id": dsID,
					"session_id":    sessionID,
					"query":         query,
					"error":         err.Error(),
					"duration_ms":   time.Since(start).Milliseconds(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			var result [][]string
			for rows.Next() {
				values := make([]any, len(columns))
				valuePtrs := make([]any, len(columns))
				for i := range values {
					valuePtrs[i] = &values[i]
				}
				if err := rows.Scan(valuePtrs...); err != nil {
					logger.Error("sql", "row scan failed", map[string]any{
						"datasource_id": dsID,
						"session_id":    sessionID,
						"query":         query,
						"error":         err.Error(),
						"duration_ms":   time.Since(start).Milliseconds(),
					})
					return sqlToolOutput{Error: err.Error()}, nil
				}
				row := make([]string, len(columns))
				for i, v := range values {
					if v == nil {
						row[i] = "NULL"
					} else {
						row[i] = ValueToString(v)
					}
				}
				result = append(result, row)
			}
			if err := rows.Err(); err != nil {
				logger.Error("sql", "row iteration error", map[string]any{
					"datasource_id": dsID,
					"session_id":    sessionID,
					"query":         query,
					"error":         err.Error(),
					"duration_ms":   time.Since(start).Milliseconds(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			// Result summary: columns + row count + timing. Full rows are not
			// logged (they can be large and are returned to the LLM/frontend).
			logger.Info("sql", "agent sql result", map[string]any{
				"datasource_id": dsID,
				"session_id":    sessionID,
				"query":         query,
				"columns":       columns,
				"row_count":     len(result),
				"filename":      filename,
				"duration_ms":   time.Since(start).Milliseconds(),
			})

			return sqlToolOutput{Columns: columns, Rows: result, Count: len(result), Filename: filename}, nil
		},
	)
}

// sanitizeFilename cleans a suggested filename for use as a download name:
// strips path separators and characters illegal on common filesystems,
// collapses whitespace, trims trailing dots/spaces and caps the length.
func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_", "?", "_",
		"\"", "_", "<", "_", ">", "_", "|", "_", "\x00", "",
	)
	s = replacer.Replace(s)
	s = strings.Join(strings.Fields(s), "_")
	s = strings.TrimRight(s, ". ")
	runes := []rune(s)
	if len(runes) > 80 {
		s = string(runes[:80])
	}
	return strings.TrimSpace(s)
}

// defaultFilename derives a download name from the query, using the first
// table referenced in the FROM clause, or a generic fallback.
func defaultFilename(query string) string {
	m := fromTablePattern.FindStringSubmatch(query)
	if len(m) > 1 {
		if name := sanitizeFilename(m[1]); name != "" {
			return name
		}
	}
	return "查询结果"
}

func ValueToString(v any) string {
	switch val := v.(type) {
	case []byte:
		return string(val)
	case string:
		return val
	default:
		return fmt.Sprintf("%v", v)
	}
}
