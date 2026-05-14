package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	"talk2db/internal/logger"
)

// openAIChatModel implements model.ToolCallingChatModel for any OpenAI-compatible API.
type openAIChatModel struct {
	baseURL   string
	apiKey    string
	modelName string
	client    *http.Client
	tools     []*schema.ToolInfo
}

func NewOpenAIChatModel(baseURL, apiKey, modelName string) model.ToolCallingChatModel {
	return &openAIChatModel{
		baseURL:   strings.TrimSuffix(baseURL, "/"),
		apiKey:    apiKey,
		modelName: modelName,
		client:    &http.Client{},
	}
}

func (m *openAIChatModel) Generate(ctx context.Context, messages []*schema.Message, opts ...model.Option) (*schema.Message, error) {
	body, err := m.buildRequest(messages, false)
	if err != nil {
		return nil, err
	}
	resp, err := m.doRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	return m.parseResponse(resp)
}

func (m *openAIChatModel) Stream(ctx context.Context, messages []*schema.Message, opts ...model.Option) (*schema.StreamReader[*schema.Message], error) {
	body, err := m.buildRequest(messages, true)
	if err != nil {
		return nil, err
	}
	stream, err := m.doStreamRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	return schema.StreamReaderFromArray(stream), nil
}

func (m *openAIChatModel) WithTools(tools []*schema.ToolInfo) (model.ToolCallingChatModel, error) {
	return &openAIChatModel{
		baseURL:   m.baseURL,
		apiKey:    m.apiKey,
		modelName: m.modelName,
		client:    m.client,
		tools:     tools,
	}, nil
}

type chatRequest struct {
	Model    string          `json:"model"`
	Messages []chatMessage   `json:"messages"`
	Tools    []chatTool      `json:"tools,omitempty"`
	Stream   bool            `json:"stream"`
}

type chatMessage struct {
	Role             string         `json:"role"`
	Content          string         `json:"content,omitempty"`
	ReasoningContent string         `json:"reasoning_content,omitempty"`
	ToolCalls        []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string         `json:"tool_call_id,omitempty"`
}

type chatTool struct {
	Type     string       `json:"type"`
	Function functionDef  `json:"function"`
}

type functionDef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters,omitempty"`
}

type chatToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function functionCall `json:"function"`
}

type functionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Role             string         `json:"role"`
			Content          string         `json:"content"`
			ReasoningContent string         `json:"reasoning_content"`
			ToolCalls        []chatToolCall `json:"tool_calls"`
		} `json:"message"`
	} `json:"choices"`
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Role             string         `json:"role"`
			Content          string         `json:"content"`
			ReasoningContent string         `json:"reasoning_content"`
			ToolCalls        []chatToolCall `json:"tool_calls"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
}

func (m *openAIChatModel) buildRequest(messages []*schema.Message, stream bool) ([]byte, error) {
	var msgs []chatMessage
	for _, msg := range messages {
		cm := chatMessage{Role: string(msg.Role), Content: msg.Content, ReasoningContent: msg.ReasoningContent}
		if len(msg.ToolCalls) > 0 {
			cm.ToolCalls = make([]chatToolCall, len(msg.ToolCalls))
			for i, tc := range msg.ToolCalls {
				cm.ToolCalls[i] = chatToolCall{
					ID:   tc.ID,
					Type: "function",
					Function: functionCall{
						Name:      tc.Function.Name,
						Arguments: tc.Function.Arguments,
					},
				}
			}
		}
		if msg.ToolCallID != "" {
			cm.ToolCallID = msg.ToolCallID
		}
		msgs = append(msgs, cm)
	}

	var tools []chatTool
	for _, t := range m.tools {
		var params any
		if t.ParamsOneOf != nil {
			js, err := t.ParamsOneOf.ToJSONSchema()
			if err == nil && js != nil {
				b, err := js.MarshalJSON()
				if err == nil {
					json.Unmarshal(b, &params)
				}
			}
		}
		if params == nil {
			params = map[string]any{"type": "object"}
		}
		tools = append(tools, chatTool{
			Type: "function",
			Function: functionDef{
				Name:        t.Name,
				Description: t.Desc,
				Parameters:  params,
			},
		})
	}

	req := chatRequest{
		Model:    m.modelName,
		Messages: msgs,
		Tools:    tools,
		Stream:   stream,
	}
	if len(tools) == 0 {
		req.Tools = nil
	}
	return json.Marshal(req)
}

func (m *openAIChatModel) doRequest(ctx context.Context, body []byte) ([]byte, error) {
	logger.Info("llm_request", "non-stream request", map[string]any{
		"model": m.modelName,
		"body":  json.RawMessage(body),
	})

	url := m.baseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+m.apiKey)

	resp, err := m.client.Do(req)
	if err != nil {
		logger.Error("llm_request", "request failed", map[string]any{"error": err.Error()})
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error("llm_request", "read body failed", map[string]any{"error": err.Error()})
		return nil, err
	}
	if resp.StatusCode != 200 {
		err := fmt.Errorf("chat API error %d: %s", resp.StatusCode, string(respBody))
		logger.Error("llm_request", "API error", map[string]any{"status": resp.StatusCode, "body": string(respBody)})
		return nil, err
	}
	return respBody, nil
}

func (m *openAIChatModel) parseResponse(body []byte) (*schema.Message, error) {
	var resp chatResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		logger.Error("llm_response", "parse failed", map[string]any{"error": err.Error()})
		return nil, err
	}
	if len(resp.Choices) == 0 {
		err := fmt.Errorf("no choices in response")
		logger.Error("llm_response", "no choices", map[string]any{"error": err.Error()})
		return nil, err
	}
	choice := resp.Choices[0]
	msg := &schema.Message{
		Role:             schema.RoleType(choice.Message.Role),
		Content:          choice.Message.Content,
		ReasoningContent: choice.Message.ReasoningContent,
	}
	for _, tc := range choice.Message.ToolCalls {
		msg.ToolCalls = append(msg.ToolCalls, schema.ToolCall{
			ID:   tc.ID,
			Type: tc.Type,
			Function: schema.FunctionCall{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}
	logger.Info("llm_response", "response received", map[string]any{
		"content":    msg.Content,
		"tool_calls": msg.ToolCalls,
		"raw_body":   json.RawMessage(body),
	})
	return msg, nil
}

func (m *openAIChatModel) doStreamRequest(ctx context.Context, body []byte) ([]*schema.Message, error) {
	logger.Info("llm_request", "stream request", map[string]any{
		"model": m.modelName,
		"body":  json.RawMessage(body),
	})

	url := m.baseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := m.client.Do(req)
	if err != nil {
		logger.Error("llm_stream", "request failed", map[string]any{"error": err.Error()})
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		err := fmt.Errorf("chat API error %d: %s", resp.StatusCode, string(respBody))
		logger.Error("llm_stream", "API error", map[string]any{"status": resp.StatusCode, "body": string(respBody)})
		return nil, err
	}

	var messages []*schema.Message
	scanner := bufio.NewScanner(resp.Body)
	var currentContent strings.Builder
	var currentReasoning strings.Builder
	var currentToolCalls []chatToolCall

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		logger.Debug("llm_stream", "chunk", map[string]any{"chunk": data})
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				currentContent.WriteString(choice.Delta.Content)
			}
			if choice.Delta.ReasoningContent != "" {
				currentReasoning.WriteString(choice.Delta.ReasoningContent)
			}
			for _, tc := range choice.Delta.ToolCalls {
				currentToolCalls = append(currentToolCalls, tc)
			}
			if choice.FinishReason != nil {
				msg := &schema.Message{
					Role:             schema.Assistant,
					Content:          currentContent.String(),
					ReasoningContent: currentReasoning.String(),
				}
				for _, tc := range currentToolCalls {
					msg.ToolCalls = append(msg.ToolCalls, schema.ToolCall{
						ID:   tc.ID,
						Type: tc.Type,
						Function: schema.FunctionCall{
							Name:      tc.Function.Name,
							Arguments: tc.Function.Arguments,
						},
					})
				}
				logger.Info("llm_stream", "stream message complete", map[string]any{
					"content":           msg.Content,
					"reasoning_content": msg.ReasoningContent,
					"tool_calls":        msg.ToolCalls,
				})
				messages = append(messages, msg)
				currentContent.Reset()
				currentReasoning.Reset()
				currentToolCalls = nil
			}
		}
	}
	if err := scanner.Err(); err != nil {
		logger.Error("llm_stream", "stream read error", map[string]any{"error": err.Error()})
	}
	return messages, scanner.Err()
}
