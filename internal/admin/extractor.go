package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	"talk2db/internal/logger"
)

const (
	// extractMaxRows bounds the number of data rows the extraction round may
	// inject into the main agent conversation.
	extractMaxRows = 500

	// extractMaxChars bounds the injected subset text length.
	extractMaxChars = 8000

	// extractorMaxChars bounds the full content sent to the extractor LLM in
	// a single call (guards against many/large attachments accumulating).
	extractorMaxChars = 150000
)

// extractionOutput is the JSON contract the intention-guess LLM must return.
type extractionOutput struct {
	RelevantColumns []string   `json:"relevant_columns"`
	RelevantRows    [][]string `json:"relevant_rows"`
	Notes           string     `json:"notes"`
}

// extractRelevantBlock runs the one-time "intention guess" round: it sends the
// user question plus the full attachment content to the LLM and asks it to
// extract only the meaningful subset for this question. The returned block is
// what the main agent carries (small enough to be resent every ReAct step).
// On any failure it falls back to a bounded preview of the attachments.
func extractRelevantBlock(ctx context.Context, chatModel model.ToolCallingChatModel, question string, uploads []*UploadedData) string {
	if len(uploads) == 0 {
		return ""
	}

	var content strings.Builder
	for i, u := range uploads {
		if i > 0 {
			content.WriteString("\n\n")
		}
		fmt.Fprintf(&content, "=== 文件 %d: %s（共 %d 行）===\n%s", i+1, u.Filename, len(u.Rows), u.TSV())
	}

	full := content.String()
	if r := []rune(full); len(r) > extractorMaxChars {
		full = string(r[:extractorMaxChars]) + "\n...(内容过大，已截断)"
	}

	system := `你是一个表格数据提取助手。用户上传了表格文件并提出了一个问题。请根据用户的问题，从表格中提取与该问题相关的、有意义的内容，供后续 SQL 生成使用。
要求：
1. 只保留与问题相关的列和行；无关的列和行应丢弃。
2. 保持单元格原始值不变，不要改写、换算或汇总，因为后续需要精确匹配。
3. 相关行很多时，最多保留 500 行，并在 notes 中说明"共 N 行，仅返回前 500 行"。
4. relevant_rows 只包含数据行，不要包含列名行。
5. 如果表格与问题完全无关，relevant_columns 和 relevant_rows 都返回空数组。
6. 只输出 JSON，不要输出任何其他文字。格式：
{"relevant_columns": ["列名"], "relevant_rows": [["值","值"]], "notes": "说明"}`

	msgs := []*schema.Message{
		{Role: schema.System, Content: system},
		{Role: schema.User, Content: fmt.Sprintf("用户问题：%s\n\n表格内容：\n%s", question, full)},
	}

	resp, err := chatModel.Generate(ctx, msgs)
	if err != nil {
		logger.Error("extract", "extraction model call failed", map[string]any{"error": err.Error()})
		return previewBlock(uploads)
	}

	var out extractionOutput
	if err := json.Unmarshal([]byte(stripJSONFence(resp.Content)), &out); err != nil {
		logger.Error("extract", "failed to parse extraction JSON", map[string]any{
			"error":   err.Error(),
			"content": resp.Content,
		})
		return previewBlock(uploads)
	}

	if len(out.RelevantColumns) == 0 && len(out.RelevantRows) == 0 {
		return ""
	}
	return buildRelevantBlock(out)
}

// buildRelevantBlock turns the extracted columns/rows into the compact text
// block injected into the main agent's user message.
func buildRelevantBlock(out extractionOutput) string {
	var sb strings.Builder
	sb.WriteString("[附件相关内容 — 已按问题提取]\n")
	if len(out.RelevantColumns) > 0 {
		sb.WriteString("相关列: " + strings.Join(out.RelevantColumns, ", ") + "\n")
	}

	if len(out.RelevantRows) > 0 {
		rows := out.RelevantRows
		if len(rows) > extractMaxRows {
			rows = rows[:extractMaxRows]
		}
		lines := make([]string, 0, len(rows)+1)
		lines = append(lines, strings.Join(sanitizeCells(out.RelevantColumns), "\t"))
		for _, r := range rows {
			line := sanitizeCells(r)
			for len(line) < len(out.RelevantColumns) {
				line = append(line, "")
			}
			lines = append(lines, strings.Join(line, "\t"))
		}
		tsv := strings.Join(lines, "\n")
		if r := []rune(tsv); len(r) > extractMaxChars {
			tsv = string(r[:extractMaxChars]) + "\n...(已截断)"
		}
		sb.WriteString("相关数据:\n" + tsv + "\n")
	}

	if out.Notes != "" {
		sb.WriteString("说明: " + out.Notes + "\n")
	}
	return sb.String()
}

// previewBlock is the fallback when the extraction round fails: a bounded
// preview of each attachment (header + first rows).
func previewBlock(uploads []*UploadedData) string {
	var sb strings.Builder
	for _, u := range uploads {
		fmt.Fprintf(&sb, "[附件: %s — 共 %d 行]\n%s\n\n", u.Filename, len(u.Rows), u.Preview(200))
	}
	return strings.TrimSpace(sb.String())
}

// stripJSONFence removes markdown code fences and any text around the JSON
// object so it can be unmarshalled.
func stripJSONFence(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	if i := strings.LastIndex(s, "```"); i >= 0 {
		s = s[:i]
	}
	if i := strings.Index(s, "{"); i >= 0 {
		s = s[i:]
	}
	if j := strings.LastIndex(s, "}"); j >= 0 {
		s = s[:j+1]
	}
	return strings.TrimSpace(s)
}
