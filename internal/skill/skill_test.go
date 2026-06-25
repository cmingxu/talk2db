package skill

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoader_LoadAll_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	loader := &Loader{}
	skills, err := loader.LoadAll(dir)
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills, got %d", len(skills))
	}
}

func TestLoader_LoadAll_NonExistentDir(t *testing.T) {
	loader := &Loader{}
	skills, err := loader.LoadAll("/nonexistent/path/12345")
	if err != nil {
		t.Fatalf("LoadAll should not error on nonexistent dir: %v", err)
	}
	if skills != nil {
		t.Errorf("expected nil skills, got %v", skills)
	}
}

func TestLoader_LoadAll_ValidSkill(t *testing.T) {
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "test_skill")
	toolsDir := filepath.Join(skillDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}

	yamlContent := `
name: test
display_name: 测试技能
description: 一个测试 skill
version: "1.0"
prompt: "你是一个测试助手"
tools:
  - name: test_tool
    description: 一个测试工具
    parameters:
      input:
        type: string
        description: 输入
    run: tools/test.py
    runtime: python3
    timeout: 10
`
	if err := os.WriteFile(filepath.Join(skillDir, "skill.yaml"), []byte(yamlContent), 0644); err != nil {
		t.Fatal(err)
	}

	loader := &Loader{}
	skills, err := loader.LoadAll(dir)
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(skills))
	}

	s := skills[0]
	if s.Name != "test" {
		t.Errorf("name = %q, want %q", s.Name, "test")
	}
	if s.DisplayName != "测试技能" {
		t.Errorf("display_name = %q", s.DisplayName)
	}
	if len(s.Tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(s.Tools))
	}
	if s.Tools[0].Name != "test_tool" {
		t.Errorf("tool name = %q", s.Tools[0].Name)
	}
	if s.Tools[0].Timeout != 10 {
		t.Errorf("timeout = %d, want 10", s.Tools[0].Timeout)
	}
	if s.Tools[0].Runtime != "python3" {
		t.Errorf("runtime = %q", s.Tools[0].Runtime)
	}
}

func TestLoader_LoadAll_DefaultTimeout(t *testing.T) {
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "no_timeout")
	toolsDir := filepath.Join(skillDir, "tools")
	os.MkdirAll(toolsDir, 0755)

	yamlContent := `
name: no_timeout
display_name: 测试
description: test
version: "1.0"
tools:
  - name: t1
    description: d
    parameters: {}
    run: tools/t.py
    runtime: python3
`
	os.WriteFile(filepath.Join(skillDir, "skill.yaml"), []byte(yamlContent), 0644)

	loader := &Loader{}
	skills, _ := loader.LoadAll(dir)
	if len(skills) != 1 || len(skills[0].Tools) != 1 {
		t.Fatal("expected 1 skill with 1 tool")
	}
	if skills[0].Tools[0].Timeout != 30 {
		t.Errorf("default timeout = %d, want 30", skills[0].Tools[0].Timeout)
	}
}

func TestRegistry_RegisterAndLookup(t *testing.T) {
	reg := NewRegistry()
	skills := []Skill{
		{
			Name:        "s1",
			DisplayName: "Skill 1",
			Tools: []Tool{
				{Name: "tool_a", Description: "Tool A", SkillDir: "/tmp/s1"},
				{Name: "tool_b", Description: "Tool B", SkillDir: "/tmp/s1"},
			},
		},
	}

	if err := reg.Register(skills); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	toolA, ok := reg.GetTool("tool_a")
	if !ok {
		t.Fatal("tool_a not found")
	}
	if toolA.Name != "tool_a" {
		t.Errorf("got %q", toolA.Name)
	}

	_, ok = reg.GetTool("nonexistent")
	if ok {
		t.Error("nonexistent should not be found")
	}

	all := reg.AllSkills()
	if len(all) != 1 {
		t.Errorf("AllSkills len = %d, want 1", len(all))
	}
}

func TestRegistry_DuplicateTool(t *testing.T) {
	reg := NewRegistry()
	skills := []Skill{
		{
			Name: "s1",
			Tools: []Tool{
				{Name: "dup", Description: "first", SkillDir: "/tmp/s1"},
			},
		},
		{
			Name: "s2",
			Tools: []Tool{
				{Name: "dup", Description: "second", SkillDir: "/tmp/s2"},
			},
		},
	}

	if err := reg.Register(skills); err == nil {
		t.Error("expected error for duplicate tool name")
	}
}
