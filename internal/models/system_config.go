package models

import "time"

type SystemConfig struct {
	ID           int64     `gorm:"primaryKey" json:"id"`
	WarnText     string    `gorm:"not null" json:"warnText"`
	UpdatedAtUTC time.Time `json:"updatedAtUTC"`
}

func (SystemConfig) TableName() string {
	return "system_config"
}

func DefaultSystemConfig() SystemConfig {
	return SystemConfig{
		ID:           1,
		WarnText:     "Default warning text",
		UpdatedAtUTC: time.Now().UTC(),
	}
}
