package skill

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Skill 表示一个从 YAML 清单加载的 skill。
type Skill struct {
	Name        string `yaml:"name"`
	DisplayName string `yaml:"display_name"`
	Description string `yaml:"description"`
	Version     string `yaml:"version"`
	Author      string `yaml:"author"`
	Prompt      string `yaml:"prompt"`
	Tools       []Tool `yaml:"tools"`
	Dir         string `yaml:"-"` // skill 目录的绝对路径
}

// Tool 表示 skill 声明的一个工具。
type Tool struct {
	Name        string              `yaml:"name"`
	Description string              `yaml:"description"`
	Parameters  map[string]ParamDef `yaml:"parameters"`
	Run         string              `yaml:"run"`     // 脚本相对路径（相对于 skill 目录）
	Runtime     string              `yaml:"runtime"` // python3 / node
	Timeout     int                 `yaml:"timeout"` // 超时秒数，0 使用默认值
	SkillDir    string              `yaml:"-"`       // 所属 skill 目录
}

// ParamDef 描述一个工具参数的 JSON Schema 片段。
type ParamDef struct {
	Type        string   `yaml:"type"`
	Description string   `yaml:"description"`
	Enum        []string `yaml:"enum,omitempty"`
	Required    bool     `yaml:"required,omitempty"`
}

// Loader 从 skills 目录加载所有 skill。
type Loader struct{}

// LoadAll 扫描 skillsDir 目录，读取每个子目录下的 skill.yaml，返回解析后的 skills。
// 跳过没有 skill.yaml 的子目录。
func (l *Loader) LoadAll(skillsDir string) ([]Skill, error) {
	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // 没有 skills 目录不是错误，返回空列表
		}
		return nil, fmt.Errorf("read skills dir %s: %w", skillsDir, err)
	}

	var skills []Skill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillDir := filepath.Join(skillsDir, entry.Name())
		yamlPath := filepath.Join(skillDir, "skill.yaml")
		data, err := os.ReadFile(yamlPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue // 没有 skill.yaml 的目录跳过
			}
			return nil, fmt.Errorf("read %s: %w", yamlPath, err)
		}

		var skill Skill
		if err := yaml.Unmarshal(data, &skill); err != nil {
			return nil, fmt.Errorf("parse %s: %w", yamlPath, err)
		}

		// 填充运行时字段
		absDir, err := filepath.Abs(skillDir)
		if err != nil {
			return nil, fmt.Errorf("resolve %s: %w", skillDir, err)
		}
		skill.Dir = absDir
		for i := range skill.Tools {
			skill.Tools[i].SkillDir = absDir
			if skill.Tools[i].Timeout <= 0 {
				skill.Tools[i].Timeout = 30
			}
		}

		skills = append(skills, skill)
	}
	return skills, nil
}
