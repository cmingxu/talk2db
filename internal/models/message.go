package models

import "time"

type Message struct {
	ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	SessionID   int64     `gorm:"not null;index" json:"sessionId"`
	Role        string    `gorm:"not null" json:"role"`
	Content     string    `gorm:"type:text" json:"content,omitempty"`
	SQL         string    `gorm:"type:text" json:"sql,omitempty"`
	ToolResults string    `gorm:"type:text" json:"toolResults,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (Message) TableName() string { return "messages" }
