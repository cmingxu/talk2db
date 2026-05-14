package models

import "time"

type TableSpace struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	DatasourceID int64     `gorm:"not null;uniqueIndex:idx_ds_table" json:"datasourceId"`
	TableName    string    `gorm:"not null;uniqueIndex:idx_ds_table" json:"tableName"`
	CreatedAt    time.Time `json:"createdAt"`
}

// GORM auto-generates table name "table_spaces" from struct name
