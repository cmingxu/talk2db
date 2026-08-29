package models

import "time"

type Datasource struct {
	ID   int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Name string `gorm:"not null;uniqueIndex" json:"name"`
	// Slug is the human-readable URL segment for the datasource chat page
	// (e.g. /chat/sakila-movies). Unique; auto-derived from Name when empty.
	Slug         string `gorm:"column:slug;uniqueIndex" json:"slug"`
	Engine       string `gorm:"not null" json:"engine"`
	Host         string `gorm:"not null" json:"host"`
	Port         int    `gorm:"not null" json:"port"`
	Username     string `gorm:"not null" json:"username"`
	Password     string `gorm:"not null" json:"-"`
	DatabaseName string `gorm:"not null" json:"databaseName"`
	// ChatTitle is the editable title shown on the datasource's chat landing
	// page. Empty means "use the datasource name".
	ChatTitle string `gorm:"column:chat_title" json:"chatTitle"`
	// ChatDesc is an optional description shown below the title on the
	// datasource's chat landing page.
	ChatDesc  string    `gorm:"column:chat_desc" json:"chatDesc"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (Datasource) TableName() string { return "datasources" }
