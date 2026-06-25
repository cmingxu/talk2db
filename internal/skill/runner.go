package skill

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"talk2db/internal/logger"
)

const defaultTimeout = 30 * time.Second

// RunInput 是传递给 skill 脚本的 stdin JSON 结构。
type RunInput struct {
	SkillDir string         `json:"skill_dir"`
	Args     map[string]any `json:"args"`
}

// RunOutput 是 skill 脚本 stdout 返回的 JSON 结构。
type RunOutput struct {
	Success bool           `json:"success"`
	Result  map[string]any `json:"result,omitempty"`
	Error   string         `json:"error,omitempty"`
}

// Runner 通过子进程执行 skill 工具脚本。
type Runner struct {
	SkillsDir string // skills 根目录
}

// NewRunner 创建 Runner。
func NewRunner(skillsDir string) *Runner {
	return &Runner{SkillsDir: skillsDir}
}

// Run 执行指定 tool 的脚本。args 是 LLM 传入的参数。
// 返回脚本 stdout 中 result 字段的内容。
func (r *Runner) Run(ctx context.Context, tool *Tool, args map[string]any) (map[string]any, error) {
	scriptPath := filepath.Join(tool.SkillDir, tool.Run)

	// 解析运行时命令
	runtime := tool.Runtime
	if runtime == "" {
		runtime = "python3"
	}

	// 构建输入
	input := RunInput{
		SkillDir: tool.SkillDir,
		Args:     args,
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal input: %w", err)
	}

	logger.Info("skill_run", "executing skill tool", map[string]any{
		"tool":    tool.Name,
		"runtime": runtime,
		"script":  scriptPath,
		"args":    args,
	})

	// 设置超时
	timeout := time.Duration(tool.Timeout) * time.Second
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, runtime, scriptPath)
	cmd.Dir = tool.SkillDir
	cmd.Stdin = bytes.NewReader(inputJSON)

	// 环境变量白名单
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"HOME=" + os.Getenv("HOME"),
		"LANG=" + os.Getenv("LANG"),
		"SKILL_DIR=" + tool.SkillDir,
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err = cmd.Run()
	elapsed := time.Since(start)

	if err != nil {
		// 区分超时和其他错误
		if ctx.Err() == context.DeadlineExceeded {
			logger.Error("skill_run", "tool timed out", map[string]any{
				"tool":    tool.Name,
				"timeout": timeout.Seconds(),
			})
			return map[string]any{"error": fmt.Sprintf("工具执行超时（%d 秒）", tool.Timeout)}, nil
		}
		logger.Error("skill_run", "tool execution failed", map[string]any{
			"tool":   tool.Name,
			"stderr": stderr.String(),
			"error":  err.Error(),
		})
		return map[string]any{"error": fmt.Sprintf("工具执行失败: %s", stderr.String())}, nil
	}

	logger.Info("skill_run", "tool completed", map[string]any{
		"tool":    tool.Name,
		"elapsed": elapsed.String(),
	})

	// 解析输出
	var output RunOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		logger.Error("skill_run", "failed to parse tool output", map[string]any{
			"tool":   tool.Name,
			"stdout": stdout.String(),
			"error":  err.Error(),
		})
		return nil, fmt.Errorf("parse tool output: %w", err)
	}

	if !output.Success {
		return map[string]any{"error": output.Error}, nil
	}

	if output.Result == nil {
		output.Result = map[string]any{"message": "工具执行成功"}
	}

	return output.Result, nil
}
