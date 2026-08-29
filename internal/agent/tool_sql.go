package agent

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	"talk2db/internal/datasource"
	"talk2db/internal/logger"
)

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
			query := strings.TrimSpace(input.Query)
			if err := ValidateSQL(query); err != nil {
				return sqlToolOutput{Error: err.Error()}, nil
			}

			filename := sanitizeFilename(input.Filename)
			if filename == "" {
				filename = defaultFilename(query)
			}

			logger.Info("sql_execute", "executing query", map[string]any{
				"datasource_id": dsID,
				"query":         query,
			})

			db, err := reg.GetDB(dsID)
			if err != nil {
				logger.Error("sql_execute", "failed to get db connection", map[string]any{
					"datasource_id": dsID,
					"error":         err.Error(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			rows, err := db.QueryContext(ctx, query)
			if err != nil {
				logger.Error("sql_execute", "query execution failed", map[string]any{
					"datasource_id": dsID,
					"query":         query,
					"error":         err.Error(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}
			defer rows.Close()

			columns, err := rows.Columns()
			if err != nil {
				logger.Error("sql_result", "failed to get columns", map[string]any{
					"datasource_id": dsID,
					"error":         err.Error(),
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
				logger.Error("sql_result", "row iteration error", map[string]any{
					"datasource_id": dsID,
					"error":         err.Error(),
				})
				return sqlToolOutput{Error: err.Error()}, nil
			}

			logger.Info("sql_result", "query completed", map[string]any{
				"datasource_id": dsID,
				"columns":       columns,
				"row_count":     len(result),
				"filename":      filename,
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
