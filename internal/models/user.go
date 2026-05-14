package models

const (
	RoleAdmin  = "admin"
	RoleNormal = "normal"
)

type User struct {
	ID       int64  `json:"id"`
	Nickname string `json:"nickname"`
	Password string `json:"-"`
	Role     string `gorm:"not null;default:normal" json:"role"`
}
