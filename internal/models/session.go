package models

import "time"

type Session struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name         string    `gorm:"not null" json:"name"`
	DatasourceID int64     `gorm:"not null;index" json:"datasourceId"`
	UserID       int64     `gorm:"not null;index" json:"userId"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (Session) TableName() string { return "sessions" }
