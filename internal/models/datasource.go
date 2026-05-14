package models

import "time"

type Datasource struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name         string    `gorm:"not null;uniqueIndex" json:"name"`
	Engine       string    `gorm:"not null" json:"engine"`
	Host         string    `gorm:"not null" json:"host"`
	Port         int       `gorm:"not null" json:"port"`
	Username     string    `gorm:"not null" json:"username"`
	Password     string    `gorm:"not null" json:"-"`
	DatabaseName string    `gorm:"not null" json:"databaseName"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (Datasource) TableName() string { return "datasources" }
