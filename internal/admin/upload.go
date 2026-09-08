package admin

import (
	"encoding/json"
	"fmt"
	"strings"

	"talk2db/internal/models"
)

const (
	// maxUploadRows caps the number of data rows accepted from an uploaded
	// spreadsheet. The client enforces the same limit before sending.
	maxUploadRows = 2000

	// maxUploadChars caps the serialized TSV length so a single attachment
	// cannot blow the LLM context/token budget.
	maxUploadChars = 50000

	// maxUploadCell truncates a single spreadsheet cell in the injected text.
	maxUploadCell = 200
)

// UploadedData is the parsed spreadsheet content sent by the client with a
// chat message. The client (SheetJS) parses the file; the server validates
// the limits and persists the content so later turns can re-extract a
// question-specific subset from it.
type UploadedData struct {
	Filename string     `json:"filename"`
	Headers  []string   `json:"headers"`
	Rows     [][]string `json:"rows"`
}

// Validate checks the size limits and returns a user-facing error if exceeded.
func (u *UploadedData) Validate() error {
	if len(u.Rows) > maxUploadRows {
		return fmt.Errorf("Excel 超过 %d 行限制（当前 %d 行）", maxUploadRows, len(u.Rows))
	}
	if len(u.Headers) == 0 {
		return fmt.Errorf("Excel 文件为空")
	}
	if len([]rune(u.TSV())) > maxUploadChars {
		return fmt.Errorf("Excel 内容超过大小限制，请精简列或行")
	}
	return nil
}

// TSV serializes headers + rows into a tab-separated string with sanitized
// cells. Shorter rows are padded so columns stay aligned.
func (u *UploadedData) TSV() string {
	lines := make([]string, 0, len(u.Rows)+1)
	lines = append(lines, u.line(u.Headers))
	for _, row := range u.Rows {
		lines = append(lines, u.line(row))
	}
	return strings.Join(lines, "\n")
}

// Preview returns the header plus the first maxRows data rows, used as a
// fallback when the extraction round fails.
func (u *UploadedData) Preview(maxRows int) string {
	if maxRows <= 0 {
		maxRows = 200
	}
	rows := u.Rows
	if len(rows) > maxRows {
		rows = rows[:maxRows]
	}
	lines := make([]string, 0, len(rows)+1)
	lines = append(lines, u.line(u.Headers))
	for _, row := range rows {
		lines = append(lines, u.line(row))
	}
	s := strings.Join(lines, "\n")
	if len(u.Rows) > maxRows {
		s += fmt.Sprintf("\n...(共 %d 行，仅显示前 %d 行)", len(u.Rows), maxRows)
	}
	return s
}

// ToModel converts the parsed content into a persistable Attachment row.
func (u *UploadedData) ToModel(sessionID int64) models.Attachment {
	headers, _ := json.Marshal(u.Headers)
	rows, _ := json.Marshal(u.Rows)
	return models.Attachment{
		SessionID: sessionID,
		Filename:  u.Filename,
		Headers:   string(headers),
		Rows:      string(rows),
	}
}

// uploadsFromModels reconstructs UploadedData values from persisted rows.
func uploadsFromModels(atts []models.Attachment) []*UploadedData {
	out := make([]*UploadedData, 0, len(atts))
	for _, a := range atts {
		var headers []string
		var rows [][]string
		_ = json.Unmarshal([]byte(a.Headers), &headers)
		_ = json.Unmarshal([]byte(a.Rows), &rows)
		out = append(out, &UploadedData{Filename: a.Filename, Headers: headers, Rows: rows})
	}
	return out
}

// attachmentNames returns the filenames of the newly uploaded attachments,
// stored on the user message for history display.
func attachmentNames(uploads []*UploadedData) []string {
	var names []string
	for _, u := range uploads {
		if u != nil && u.Filename != "" {
			names = append(names, u.Filename)
		}
	}
	return names
}

// buildAttachmentRegistryLine returns a short system-prompt section listing the
// session's available attachments so the agent knows they exist.
func buildAttachmentRegistryLine(uploads []*UploadedData) string {
	var sb strings.Builder
	sb.WriteString("本会话已上传的表格文件：\n")
	for _, u := range uploads {
		fmt.Fprintf(&sb, "- %s（%d 行）\n", u.Filename, len(u.Rows))
	}
	return sb.String()
}

func (u *UploadedData) line(cells []string) string {
	line := sanitizeCells(cells)
	for len(line) < len(u.Headers) {
		line = append(line, "")
	}
	return strings.Join(line, "\t")
}

func sanitizeCells(cells []string) []string {
	out := make([]string, len(cells))
	for i, c := range cells {
		out[i] = sanitizeCell(c)
	}
	return out
}

// sanitizeCell collapses all whitespace (including tabs and newlines) into
// single spaces and truncates overly long cells, keeping text well-formed and
// bounded.
func sanitizeCell(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > maxUploadCell {
		s = string(r[:maxUploadCell])
	}
	return s
}
