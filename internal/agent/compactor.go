package agent

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/schema"
)

const (
	// DefaultMaxTokens is the default token budget for the full message list.
	DefaultMaxTokens = 16000

	// maxToolResultRows is the max rows kept in a compacted tool result.
	maxToolResultRows = 20

	// maxToolResultChars is the max character length of a compacted tool result.
	maxToolResultChars = 2000

	// recentTurnsKeep is the number of recent user/assistant turns kept intact.
	recentTurnsKeep = 3
)

// estimateTokens gives a rough token count for a message list.
// Chinese chars ≈1.5 tokens, English words ≈1.3 tokens/word.
// Using chars/3 as a conservative estimate for mixed CN/EN/SQL text.
func estimateTokens(messages []*schema.Message) int {
	total := 0
	for _, msg := range messages {
		total += len(msg.Content) + len(msg.ReasoningContent)
		for _, tc := range msg.ToolCalls {
			total += len(tc.Function.Name) + len(tc.Function.Arguments)
		}
	}
	return total / 3
}

// CompactToolResult truncates a JSON tool result to maxRows and maxChars.
// Returns the original string if it's not a valid SQL result JSON.
func CompactToolResult(content string) string {
	var result struct {
		Columns []string   `json:"columns"`
		Rows    [][]string `json:"rows"`
		Count   int        `json:"count"`
		Error   string     `json:"error,omitempty"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		if len(content) > maxToolResultChars {
			return content[:maxToolResultChars] + "\n...(已截断)"
		}
		return content
	}

	if result.Error != "" {
		return content
	}

	originalCount := len(result.Rows)
	truncated := false
	if len(result.Rows) > maxToolResultRows {
		result.Rows = result.Rows[:maxToolResultRows]
		truncated = true
	}

	b, err := json.Marshal(result)
	if err != nil {
		return content
	}

	output := string(b)
	if truncated {
		output += fmt.Sprintf("\n(结果已截断，仅显示前 %d 行，共 %d 行)", maxToolResultRows, originalCount)
	}

	if len(output) > maxToolResultChars {
		output = output[:maxToolResultChars] + "..."
	}

	return output
}

// CompactMessages compacts a message list to fit within maxTokens.
// Preserves: system prompt, memory context, recent turns.
// Compacts: old turns summarized, large tool results truncated.
//
// Parameters:
//   - systemPrompt: the schema/system prompt (always preserved in full)
//   - memory: session memory for persistent context
//   - history: previous user/assistant messages from DB
//   - newUserMsg: the current user message
//   - maxTokens: token budget (0 uses DefaultMaxTokens)
func CompactMessages(systemPrompt string, memory *SessionMemory, history []*schema.Message, newUserMsg string, maxTokens int) []*schema.Message {
	if maxTokens <= 0 {
		maxTokens = DefaultMaxTokens
	}

	var result []*schema.Message

	// Always start with system prompt (schema — never compacted)
	result = append(result, &schema.Message{Role: schema.System, Content: systemPrompt})

	// Add memory context if available
	if memory != nil {
		if memContent := memory.BuildContextMessage(); memContent != "" {
			result = append(result, &schema.Message{Role: schema.System, Content: memContent})
		}
	}

	// Add history
	result = append(result, history...)

	// Add current user message
	result = append(result, &schema.Message{Role: schema.User, Content: newUserMsg})

	// Step 1: compact tool results (always safe, reduces token bloat)
	for _, msg := range result {
		if msg.Role == schema.Tool {
			msg.Content = CompactToolResult(msg.Content)
		}
	}

	// Step 2: if within budget, return as-is
	if estimateTokens(result) <= maxTokens {
		return result
	}

	// Step 3: summarize oldest turns while keeping recent ones intact
	systemCount := 1
	if memory != nil && memory.BuildContextMessage() != "" {
		systemCount = 2
	}

	splitIdx := findRecentSplit(result, systemCount)
	if splitIdx <= systemCount {
		return result // nothing to compact
	}

	summary := summarizeMessages(result[systemCount:splitIdx])
	if summary == "" {
		return result
	}

	compacted := make([]*schema.Message, 0, systemCount+1+len(result)-splitIdx)
	compacted = append(compacted, result[:systemCount]...)
	compacted = append(compacted, &schema.Message{
		Role:    schema.System,
		Content: fmt.Sprintf("[历史对话摘要 — 以下为更早对话的压缩总结]\n%s", summary),
	})
	compacted = append(compacted, result[splitIdx:]...)

	return compacted
}

// findRecentSplit finds the index where to split: keep system messages and
// the last recentTurnsKeep user/assistant turns intact.
func findRecentSplit(messages []*schema.Message, systemCount int) int {
	turns := 0
	for i := len(messages) - 1; i >= systemCount; i-- {
		if messages[i].Role == schema.User {
			turns++
			if turns >= recentTurnsKeep {
				return i
			}
		}
	}
	// Keep at least the last user message
	for i := len(messages) - 1; i >= systemCount; i-- {
		if messages[i].Role == schema.User {
			return i
		}
	}
	return systemCount
}

// summarizeMessages creates a rule-based summary of older messages.
func summarizeMessages(messages []*schema.Message) string {
	var parts []string
	var lastUserContent string

	for _, msg := range messages {
		switch msg.Role {
		case schema.User:
			lastUserContent = msg.Content
		case schema.Assistant:
			if lastUserContent != "" {
				parts = append(parts, fmt.Sprintf("Q: %s", truncateStr(lastUserContent, 80)))
				lastUserContent = ""
			}
			if msg.Content != "" {
				parts = append(parts, fmt.Sprintf("A: %s", truncateStr(msg.Content, 120)))
			}
			for _, tc := range msg.ToolCalls {
				parts = append(parts, fmt.Sprintf("[调用工具: %s]", tc.Function.Name))
			}
		case schema.Tool:
			// Skip raw tool results in summary
		}
	}

	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n")
}
