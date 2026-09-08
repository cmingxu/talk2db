package models

import "time"

type Message struct {
	ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	SessionID   int64     `gorm:"not null;index" json:"sessionId"`
	Role        string    `gorm:"not null" json:"role"`
	Content     string    `gorm:"type:text" json:"content,omitempty"`
	SQL         string    `gorm:"type:text" json:"sql,omitempty"`
	ToolResults string    `gorm:"type:text" json:"toolResults,omitempty"`
	// Attachments lists the filenames uploaded with this user message (for
	// display in history only; the parsed content lives in the attachments
	// table keyed by session). Stored as a JSON text column via GORM's
	// serializer so it maps to/from []string transparently.
	Attachments []string  `gorm:"type:text;serializer:json" json:"attachments,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (Message) TableName() string { return "messages" }
