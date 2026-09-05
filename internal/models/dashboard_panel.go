package models

import "time"

// DashboardPanel is one chart/text widget on a datasource's dashboard.
// The set of panels for a datasource together form its single dashboard.
type DashboardPanel struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	DatasourceID int64  `gorm:"not null;index" json:"datasourceId"`
	Name         string `gorm:"not null" json:"name"`
	SQL          string `gorm:"not null" json:"sql"`
	// ChartType: bar | pie | line | text
	ChartType string `gorm:"not null;default:'bar'" json:"chartType"`
	// Theme: color palette name, e.g. default | ocean | forest | sunset | mono
	Theme     string `gorm:"not null;default:'default'" json:"theme"`
	SortOrder int    `gorm:"not null;default:0" json:"sortOrder"`
	// RefreshInterval: auto-refresh seconds for this panel (0 = never).
	RefreshInterval int       `gorm:"column:refresh_interval;not null;default:60" json:"refreshInterval"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (DashboardPanel) TableName() string { return "dashboard_panels" }
