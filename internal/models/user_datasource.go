package models

import "time"

type UserDatasource struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID       int64     `gorm:"not null;uniqueIndex:idx_user_ds" json:"userId"`
	DatasourceID int64     `gorm:"not null;uniqueIndex:idx_user_ds" json:"datasourceId"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (UserDatasource) TableName() string { return "user_datasources" }
