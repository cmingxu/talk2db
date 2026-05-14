package agent

import (
	"context"
	"fmt"
	"sync"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/flow/agent/react"
	"github.com/cloudwego/eino/schema"

	"talk2db/internal/datasource"
	"talk2db/internal/db"
	"talk2db/internal/models"
)

type AgentFactory struct {
	store    *db.Store
	registry *datasource.Registry

	mu       sync.Mutex
	agents   map[int64]*react.Agent
}

func NewAgentFactory(store *db.Store, registry *datasource.Registry) *AgentFactory {
	return &AgentFactory{
		store:    store,
		registry: registry,
		agents:   make(map[int64]*react.Agent),
	}
}

func (f *AgentFactory) Invalidate(datasourceID int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.agents, datasourceID)
}

func (f *AgentFactory) InvalidateAll() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.agents = make(map[int64]*react.Agent)
}

func (f *AgentFactory) GetOrCreate(ctx context.Context, ds models.Datasource, tableSpaces []models.TableSpace) (*react.Agent, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if ag, ok := f.agents[ds.ID]; ok {
		systemPrompt := BuildSystemPrompt(ctx, f.registry, ds, tableSpaces)
		return ag, systemPrompt, nil
	}

	llmCfg, err := f.store.GetLLMConfig(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("get llm config: %w", err)
	}
	if llmCfg.APIKey == "" {
		return nil, "", fmt.Errorf("LLM API key is not configured — set it in Settings > LLM Provider")
	}

	// Open target DB connection
	if err := f.registry.Open(ds); err != nil {
		return nil, "", fmt.Errorf("open datasource: %w", err)
	}

	// Build system prompt from table space schema
	systemPrompt := BuildSystemPrompt(ctx, f.registry, ds, tableSpaces)

	// Create ChatModel
	chatModel := NewOpenAIChatModel(llmCfg.BaseURL, llmCfg.APIKey, llmCfg.ModelName)

	// Create SQL execution tool
	sqlTool, err := NewSQLExecuteTool(f.registry, ds.ID)
	if err != nil {
		return nil, "", fmt.Errorf("create sql tool: %w", err)
	}

	// Create ReAct agent (system prompt is prepended in handler)
	agent, err := react.NewAgent(ctx, &react.AgentConfig{
		ToolCallingModel: chatModel,
		ToolsConfig: compose.ToolsNodeConfig{
			Tools: []tool.BaseTool{sqlTool},
		},
		MaxStep: 30,
	})
	if err != nil {
		return nil, "", fmt.Errorf("create agent: %w", err)
	}

	f.agents[ds.ID] = agent
	return agent, systemPrompt, nil
}

func (f *AgentFactory) TestLLMConnection(ctx context.Context) error {
	llmCfg, err := f.store.GetLLMConfig(ctx)
	if err != nil {
		return err
	}
	chatModel := NewOpenAIChatModel(llmCfg.BaseURL, llmCfg.APIKey, llmCfg.ModelName)
	_, err = chatModel.Generate(ctx, []*schema.Message{
		{Role: schema.User, Content: "Say 'ok' and nothing else."},
	})
	return err
}
