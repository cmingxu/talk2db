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
}

type sqlToolOutput struct {
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
	Count   int        `json:"count"`
	Error   string     `json:"error,omitempty"`
}

func NewSQLExecuteTool(reg *datasource.Registry, dsID int64) (tool.InvokableTool, error) {
	return utils.InferTool("execute_sql",
		"Execute a read-only SQL SELECT query against the database and return results as JSON with columns and rows.",
		func(ctx context.Context, input sqlToolInput) (sqlToolOutput, error) {
			query := strings.TrimSpace(input.Query)
			if err := ValidateSQL(query); err != nil {
				return sqlToolOutput{Error: err.Error()}, nil
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
			})

			return sqlToolOutput{Columns: columns, Rows: result, Count: len(result)}, nil
		},
	)
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
