package skill

import (
	"fmt"
	"sync"
)

// Registry 维护 tool name → skill/tool 的内存映射，线程安全。
type Registry struct {
	mu     sync.RWMutex
	skills []Skill
	byTool map[string]*Tool // tool name → tool
}

// NewRegistry 创建空注册表。
func NewRegistry() *Registry {
	return &Registry{byTool: make(map[string]*Tool)}
}

// Register 注册一组 skill，建立 tool name 索引。
// 如果 tool name 重复，返回错误。
func (r *Registry) Register(skills []Skill) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for i := range skills {
		sk := &skills[i]
		for j := range sk.Tools {
			t := &sk.Tools[j]
			if _, exists := r.byTool[t.Name]; exists {
				return fmt.Errorf("duplicate tool name %q in skill %q", t.Name, sk.Name)
			}
			r.byTool[t.Name] = t
		}
		r.skills = append(r.skills, *sk)
	}
	return nil
}

// GetTool 按名称查找 tool。第二个返回值指示是否找到。
func (r *Registry) GetTool(name string) (*Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.byTool[name]
	return t, ok
}

// AllSkills 返回所有已注册 skill 的切片。
func (r *Registry) AllSkills() []Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Skill, len(r.skills))
	copy(result, r.skills)
	return result
}

// AllToolNames 返回所有已注册 tool 的名称。
func (r *Registry) AllToolNames() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.byTool))
	for name := range r.byTool {
		names = append(names, name)
	}
	return names
}
