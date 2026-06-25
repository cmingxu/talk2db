package skill

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"

	"talk2db/internal/logger"
)

// skillTool 将 skill Tool 包装为 Eino InvokableTool。
// 手动实现 BaseTool + InvokableTool 接口，使 LLM 感知到 YAML 中定义的
// 扁平参数名（如 chart_type, title），而非嵌套在 "args" 下。
type skillTool struct {
	skillTool *Tool            // skill 定义（指针指向 Registry 中的 Tool，零拷贝）
	runner    *Runner
	info      *schema.ToolInfo // 在构造时预构建，避免 Info() 中的竞态
}

// NewEinoTool 将一个 skill Tool 包装为 Eino InvokableTool。
// ToolInfo 在构造时预先构建（无竞态），Info() 直接返回缓存值。
func NewEinoTool(runner *Runner, st *Tool) tool.InvokableTool {
	info := &schema.ToolInfo{
		Name: st.Name,
		Desc: st.Description,
	}

	if len(st.Parameters) > 0 {
		params := make(map[string]*schema.ParameterInfo, len(st.Parameters))
		for name, def := range st.Parameters {
			pi := &schema.ParameterInfo{
				Type:     schema.DataType(def.Type),
				Desc:     def.Description,
				Required: def.Required,
			}
			if len(def.Enum) > 0 {
				pi.Enum = def.Enum
			}
			params[name] = pi
		}
		info.ParamsOneOf = schema.NewParamsOneOfByParams(params)
	}

	return &skillTool{
		skillTool: st,
		runner:    runner,
		info:      info,
	}
}

// Info 返回 tool 的预构建元数据（线程安全，纯读操作）。
func (t *skillTool) Info(ctx context.Context) (*schema.ToolInfo, error) {
	return t.info, nil
}

// InvokableRun 执行 skill 脚本。
// argumentsInJSON 是 LLM 传入的扁平 JSON（如 {"chart_type":"bar","title":"销售"}），
// 直接传给 runner.Run 的 args。
func (t *skillTool) InvokableRun(ctx context.Context, argumentsInJSON string, opts ...tool.Option) (string, error) {
	var args map[string]any
	if err := json.Unmarshal([]byte(argumentsInJSON), &args); err != nil {
		return "", fmt.Errorf("unmarshal tool arguments: %w", err)
	}
	if args == nil {
		args = make(map[string]any)
	}

	logger.Info("skill_tool_call", "invoking skill tool", map[string]any{
		"tool": t.skillTool.Name,
		"args": args,
	})

	result, err := t.runner.Run(ctx, t.skillTool, args)
	if err != nil {
		logger.Error("skill_tool_call", "runner failed", map[string]any{
			"tool":  t.skillTool.Name,
			"error": err.Error(),
		})
		// runner.Run 返回 Go error 时，序列化为 JSON 返回给 LLM
		errJSON, _ := json.Marshal(map[string]any{"success": false, "error": err.Error()})
		return string(errJSON), nil
	}

	out, _ := json.Marshal(result)
	return string(out), nil
}

// MustMarshalJSON 将 v 序列化为 JSON 字符串，用于 tool result 的 content。
func MustMarshalJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return `{"error":"marshal failed"}`
	}
	return string(b)
}
