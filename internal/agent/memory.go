package agent

import (
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
)

// QueryRecord summarizes a SQL query result for memory.
type QueryRecord struct {
	SQL      string   `json:"sql"`
	Columns  []string `json:"columns"`
	RowCount int      `json:"rowCount"`
}

// SessionMemory holds accumulated knowledge for a chat session.
// It persists across compactions so key information is never lost.
type SessionMemory struct {
	SessionID   int64
	KeyFacts    []string      // Important facts learned during conversation
	Queries     []QueryRecord // Recent queries and their result metadata
	LastUpdated time.Time
}

// MemoryStore is a thread-safe in-process store for session memories.
type MemoryStore struct {
	mu       sync.Mutex
	memories map[int64]*SessionMemory
}

var globalMemoryStore = &MemoryStore{
	memories: make(map[int64]*SessionMemory),
}

// GetMemoryStore returns the global in-process memory store.
func GetMemoryStore() *MemoryStore {
	return globalMemoryStore
}

// Get returns the session memory, creating one if it doesn't exist.
func (s *MemoryStore) Get(sessionID int64) *SessionMemory {
	s.mu.Lock()
	defer s.mu.Unlock()
	mem, ok := s.memories[sessionID]
	if !ok {
		mem = &SessionMemory{SessionID: sessionID}
		s.memories[sessionID] = mem
	}
	return mem
}

// AddQuery records a SQL query and its result metadata.
func (s *MemoryStore) AddQuery(sessionID int64, qr QueryRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	mem := s.memories[sessionID]
	if mem == nil {
		mem = &SessionMemory{SessionID: sessionID}
		s.memories[sessionID] = mem
	}
	// Deduplicate by SQL
	for _, q := range mem.Queries {
		if q.SQL == qr.SQL {
			return
		}
	}
	mem.Queries = append(mem.Queries, qr)
	if len(mem.Queries) > 30 {
		mem.Queries = mem.Queries[len(mem.Queries)-30:]
	}
	mem.LastUpdated = time.Now()
}

// AddFact records an important fact, deduplicating by content.
func (s *MemoryStore) AddFact(sessionID int64, fact string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	mem := s.memories[sessionID]
	if mem == nil {
		mem = &SessionMemory{SessionID: sessionID}
		s.memories[sessionID] = mem
	}
	if slices.Contains(mem.KeyFacts, fact) {
		return
	}
	mem.KeyFacts = append(mem.KeyFacts, fact)
	if len(mem.KeyFacts) > 30 {
		mem.KeyFacts = mem.KeyFacts[len(mem.KeyFacts)-30:]
	}
	mem.LastUpdated = time.Now()
}

// Remove removes a session's memory (e.g., when session is deleted).
func (s *MemoryStore) Remove(sessionID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.memories, sessionID)
}

// BuildContextMessage creates a system message summarizing what the agent remembers.
// This is injected after the schema system prompt to provide persistent context.
func (m *SessionMemory) BuildContextMessage() string {
	if len(m.KeyFacts) == 0 && len(m.Queries) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("[会话记忆 — 从之前对话中积累的知识]\n")

	if len(m.KeyFacts) > 0 {
		sb.WriteString("已知事实：\n")
		for _, f := range m.KeyFacts {
			fmt.Fprintf(&sb, "- %s\n", f)
		}
		sb.WriteString("\n")
	}

	if len(m.Queries) > 0 {
		sb.WriteString("历史查询记录：\n")
		start := 0
		if len(m.Queries) > 5 {
			start = len(m.Queries) - 5
		}
		for _, q := range m.Queries[start:] {
			fmt.Fprintf(&sb, "- 查询: %s\n", truncateStr(q.SQL, 120))
			fmt.Fprintf(&sb, "  结果: %d 行, 列: %s\n", q.RowCount, strings.Join(q.Columns, ", "))
		}
	}

	return sb.String()
}

func truncateStr(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
