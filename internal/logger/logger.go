package logger

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	mu  sync.Mutex
	out io.Writer = os.Stdout
)

type Entry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Phase     string `json:"phase,omitempty"`
	Message   string `json:"message,omitempty"`
	Data      any    `json:"data,omitempty"`
}

func Init(path string) error {
	if path == "" {
		path = os.Getenv("LOG_FILE")
	}
	if path == "" {
		path = filepath.Join("var", "log", "talk2db.log")
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("logger: create dir %s: %w", dir, err)
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("logger: open %s: %w", path, err)
	}

	mu.Lock()
	if closer, ok := out.(io.Closer); ok {
		closer.Close()
	}
	out = f
	mu.Unlock()
	return nil
}

func writeEntry(level, phase, message string, data any) {
	entry := Entry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Phase:     phase,
		Message:   message,
		Data:      data,
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return
	}
	b = append(b, '\n')

	mu.Lock()
	out.Write(b)
	mu.Unlock()
}

func Info(phase, message string, data any) {
	writeEntry("info", phase, message, data)
}

func Error(phase, message string, data any) {
	writeEntry("error", phase, message, data)
}

func Debug(phase, message string, data any) {
	writeEntry("debug", phase, message, data)
}
