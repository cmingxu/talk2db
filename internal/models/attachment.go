package models

import "time"

// Attachment stores a frontend-parsed spreadsheet at session scope. The parsed
// content (headers + rows) is persisted as JSON so later turns in the same
// session can re-extract a question-specific subset from it.
type Attachment struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	SessionID int64     `gorm:"not null;index" json:"sessionId"`
	Filename  string    `gorm:"not null" json:"filename"`
	Headers   string    `gorm:"type:text" json:"headers"` // JSON array of column names
	Rows      string    `gorm:"type:text" json:"rows"`    // JSON array of string rows
	CreatedAt time.Time `json:"createdAt"`
}

func (Attachment) TableName() string { return "attachments" }
