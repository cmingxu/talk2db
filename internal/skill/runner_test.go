package skill

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestRunner_Run_Success(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping on windows")
	}

	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "echo.sh")
	script := `#!/bin/sh
cat
`
	if err := os.WriteFile(scriptPath, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}

	tool := &Tool{
		Name:     "test_echo",
		Run:      "echo.sh",
		Runtime:  "sh",
		Timeout:  5,
		SkillDir: dir,
	}

	runner := NewRunner(dir)
	ctx := context.Background()
	args := map[string]any{"key": "value"}

	result, err := runner.Run(ctx, tool, args)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestRunner_Run_Timeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping on windows")
	}

	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "sleep.sh")
	script := `#!/bin/sh
sleep 10
`
	os.WriteFile(scriptPath, []byte(script), 0755)

	tool := &Tool{
		Name:     "test_sleep",
		Run:      "sleep.sh",
		Runtime:  "sh",
		Timeout:  1, // 1 秒超时
		SkillDir: dir,
	}

	runner := NewRunner(dir)
	ctx := context.Background()
	start := time.Now()
	result, err := runner.Run(ctx, tool, nil)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Run returned unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if errMsg, ok := result["error"]; !ok || errMsg == "" {
		t.Error("expected timeout error in result")
	}
	if elapsed > 3*time.Second {
		t.Errorf("timeout took too long: %v", elapsed)
	}
}

func TestRunner_Run_StderrCapture(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping on windows")
	}

	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "fail.sh")
	script := `#!/bin/sh
echo "some error message" >&2
exit 1
`
	os.WriteFile(scriptPath, []byte(script), 0755)

	tool := &Tool{
		Name:     "test_fail",
		Run:      "fail.sh",
		Runtime:  "sh",
		Timeout:  5,
		SkillDir: dir,
	}

	runner := NewRunner(dir)
	ctx := context.Background()
	result, err := runner.Run(ctx, tool, nil)

	// 脚本失败不应 Go error，而是返回 result 中带 error
	if err != nil {
		t.Fatalf("Run returned unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if errMsg, ok := result["error"]; !ok || errMsg == "" {
		t.Error("expected error message in result")
	}
}
