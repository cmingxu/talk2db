package models

import "time"

type LLMConfig struct {
	ID        int64     `gorm:"primaryKey" json:"id"`
	Provider  string    `gorm:"not null" json:"provider"`
	BaseURL   string    `gorm:"not null" json:"baseUrl"`
	APIKey    string    `gorm:"not null" json:"-"`
	ModelName string    `gorm:"not null" json:"modelName"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (LLMConfig) TableName() string { return "llm_configs" }

func DefaultLLMConfig() LLMConfig {
	return LLMConfig{
		ID:        1,
		Provider:  "deepseek",
		BaseURL:   "https://api.deepseek.com/v1",
		ModelName: "deepseek-chat",
	}
}
