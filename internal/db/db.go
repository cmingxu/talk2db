package db

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"

	"talk2db/internal/models"
)

type Store struct {
	db     *gorm.DB
	driver string
}

type OpenConfig struct {
	Driver   string
	DSN      string
	DebugSQL bool
}

func Open(ctx context.Context, cfg OpenConfig) (*Store, error) {
	driver := strings.ToLower(strings.TrimSpace(cfg.Driver))
	if driver == "" {
		driver = "sqlite"
	}

	dsn := strings.TrimSpace(cfg.DSN)
	if dsn == "" {
		if driver == "sqlite" {
			dsn = "var/db/app.sqlite"
		} else {
			return nil, errors.New("dsn is required")
		}
	}

	if driver == "sqlite" {
		if err := ensureSQLiteDir(dsn); err != nil {
			return nil, err
		}
	}

	var dialector gorm.Dialector
	switch driver {
	case "sqlite":
		dialector = sqlite.Open(dsn)
	case "postgres", "pgx":
		dialector = postgres.Open(dsn)
	default:
		return nil, errors.New("unsupported db driver")
	}

	gormCfg := &gorm.Config{}
	if cfg.DebugSQL {
		gormCfg.Logger = &debugLogger{}
	}

	gdb, err := gorm.Open(dialector, gormCfg)
	if err != nil {
		return nil, err
	}

	s := &Store{db: gdb, driver: driver}
	if err := s.Migrate(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func (s *Store) Ping(ctx context.Context) error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

func (s *Store) Migrate(ctx context.Context) error {
	if err := s.db.WithContext(ctx).AutoMigrate(
		&models.SystemConfig{},
		&models.User{},
		&models.UserDatasource{},
		&models.Datasource{},
		&models.TableSpace{},
		&models.Session{},
		&models.Message{},
		&models.LLMConfig{},
	); err != nil {
		return err
	}

	if _, err := s.GetSystemConfig(ctx); err != nil {
		return err
	}
	if err := s.CreateDefaultLLMConfig(ctx); err != nil {
		return err
	}
	return nil
}

// ─── SystemConfig ──────────────────────────────────────────

func (s *Store) GetSystemConfig(ctx context.Context) (models.SystemConfig, error) {
	var cfg models.SystemConfig
	err := s.db.WithContext(ctx).First(&cfg, 1).Error
	if err == nil {
		return cfg, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.SystemConfig{}, err
	}

	cfg = models.DefaultSystemConfig()
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoNothing: true,
	}).Create(&cfg).Error; err != nil {
		return models.SystemConfig{}, err
	}

	if err := s.db.WithContext(ctx).First(&cfg, 1).Error; err != nil {
		return models.SystemConfig{}, err
	}
	return cfg, nil
}

type SystemConfigUpdate struct {
	WarnText *string
}

func (s *Store) UpdateSystemConfig(ctx context.Context, u SystemConfigUpdate) (models.SystemConfig, error) {
	cfg, err := s.GetSystemConfig(ctx)
	if err != nil {
		return models.SystemConfig{}, err
	}

	if u.WarnText != nil {
		cfg.WarnText = strings.TrimSpace(*u.WarnText)
	}

	cfg.UpdatedAtUTC = time.Now().UTC()
	if err := s.db.WithContext(ctx).Save(&cfg).Error; err != nil {
		return models.SystemConfig{}, err
	}
	return cfg, nil
}

// ─── User ───────────────────────────────────────────────────

func (s *Store) GetUserByNickname(ctx context.Context, nickname string) (models.User, error) {
	var user models.User
	err := s.db.WithContext(ctx).Where("nickname = ?", nickname).First(&user).Error
	return user, err
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (models.User, error) {
	var user models.User
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&user).Error
	return user, err
}

func (s *Store) CreateUser(ctx context.Context, user models.User) (models.User, error) {
	_, err := s.GetUserByNickname(ctx, user.Nickname)
	if err == nil {
		return models.User{}, errors.New("nickname already exists")
	}

	err = s.db.WithContext(ctx).Create(&user).Error
	return user, err
}

func (s *Store) UpdateUserPassword(ctx context.Context, userID int64, password string) error {
	return s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).Update("password", password).Error
}

func (s *Store) ListUsers(ctx context.Context) ([]models.User, error) {
	var users []models.User
	err := s.db.WithContext(ctx).Find(&users).Error
	return users, err
}

func (s *Store) CreateDefaultUser(ctx context.Context) error {
	user, err := s.GetUserByNickname(ctx, "admin")
	if err == nil {
		if user.Role != models.RoleAdmin {
			s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", user.ID).Update("role", models.RoleAdmin)
		}
		return nil
	}

	_, err = s.CreateUser(ctx, models.User{
		Nickname: "admin",
		Password: "admin",
		Role:     models.RoleAdmin,
	})
	return err
}

func (s *Store) DeleteUser(ctx context.Context, id int64) error {
	var count int64
	s.db.WithContext(ctx).Model(&models.User{}).Count(&count)
	if count <= 1 {
		return errors.New("cannot delete last user")
	}
	return s.db.WithContext(ctx).Delete(&models.User{}, id).Error
}

func (s *Store) SetUserDatasources(ctx context.Context, userID int64, dsIDs []int64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.UserDatasource{}, "user_id = ?", userID).Error; err != nil {
			return err
		}
		for _, dsID := range dsIDs {
			if err := tx.Create(&models.UserDatasource{UserID: userID, DatasourceID: dsID}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) GetUserDatasourceIDs(ctx context.Context, userID int64) ([]int64, error) {
	var list []models.UserDatasource
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&list).Error; err != nil {
		return nil, err
	}
	ids := make([]int64, len(list))
	for i, ud := range list {
		ids[i] = ud.DatasourceID
	}
	return ids, nil
}

func (s *Store) ListDatasourcesForUser(ctx context.Context, userID int64, role string) ([]models.Datasource, error) {
	if role == models.RoleAdmin {
		return s.ListDatasources(ctx)
	}
	ids, err := s.GetUserDatasourceIDs(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	var list []models.Datasource
	err = s.db.WithContext(ctx).Where("id IN ?", ids).Order("name asc").Find(&list).Error
	return list, err
}

// ─── Datasource ─────────────────────────────────────────────

func (s *Store) CreateDatasource(ctx context.Context, ds models.Datasource) (models.Datasource, error) {
	err := s.db.WithContext(ctx).Create(&ds).Error
	return ds, err
}

func (s *Store) GetDatasource(ctx context.Context, id int64) (models.Datasource, error) {
	var ds models.Datasource
	err := s.db.WithContext(ctx).First(&ds, id).Error
	return ds, err
}

func (s *Store) ListDatasources(ctx context.Context) ([]models.Datasource, error) {
	var list []models.Datasource
	err := s.db.WithContext(ctx).Order("name asc").Find(&list).Error
	return list, err
}

func (s *Store) UpdateDatasource(ctx context.Context, ds models.Datasource) error {
	ds.UpdatedAt = time.Now()
	return s.db.WithContext(ctx).Model(&models.Datasource{}).Where("id = ?", ds.ID).Updates(map[string]interface{}{
		"name": ds.Name, "engine": ds.Engine, "host": ds.Host,
		"port": ds.Port, "username": ds.Username, "password": ds.Password,
		"database_name": ds.DatabaseName, "updated_at": ds.UpdatedAt,
	}).Error
}

func (s *Store) DeleteDatasource(ctx context.Context, id int64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.TableSpace{}, "datasource_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.Session{}, "datasource_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.Datasource{}, id).Error; err != nil {
			return err
		}
		return nil
	})
}

// ─── TableSpace ─────────────────────────────────────────────

func (s *Store) AddTableSpaces(ctx context.Context, datasourceID int64, tables []string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, t := range tables {
			ts := models.TableSpace{
				DatasourceID: datasourceID,
				TableName:    strings.TrimSpace(t),
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ts).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) ListTableSpaces(ctx context.Context, datasourceID int64) ([]models.TableSpace, error) {
	var list []models.TableSpace
	err := s.db.WithContext(ctx).Where("datasource_id = ?", datasourceID).Order("table_name asc").Find(&list).Error
	return list, err
}

func (s *Store) DeleteTableSpace(ctx context.Context, id int64) error {
	return s.db.WithContext(ctx).Delete(&models.TableSpace{}, id).Error
}

// ─── Session ────────────────────────────────────────────────

func (s *Store) CreateSession(ctx context.Context, session models.Session) (models.Session, error) {
	err := s.db.WithContext(ctx).Create(&session).Error
	return session, err
}

func (s *Store) GetSession(ctx context.Context, id int64) (models.Session, error) {
	var session models.Session
	err := s.db.WithContext(ctx).First(&session, id).Error
	return session, err
}

func (s *Store) ListSessionsByUser(ctx context.Context, userID int64, datasourceID *int64) ([]models.Session, error) {
	var list []models.Session
	q := s.db.WithContext(ctx).Where("user_id = ?", userID)
	if datasourceID != nil {
		q = q.Where("datasource_id = ?", *datasourceID)
	}
	err := q.Order("updated_at desc").Find(&list).Error
	return list, err
}

func (s *Store) ListRecentSessions(ctx context.Context, userID int64, limit int) ([]models.Session, error) {
	var list []models.Session
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("updated_at desc").Limit(limit).Find(&list).Error
	return list, err
}

func (s *Store) UpdateSession(ctx context.Context, session models.Session) error {
	session.UpdatedAt = time.Now()
	return s.db.WithContext(ctx).Model(&models.Session{}).Where("id = ?", session.ID).Updates(map[string]interface{}{
		"name": session.Name, "updated_at": session.UpdatedAt,
	}).Error
}

func (s *Store) DeleteSession(ctx context.Context, id int64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.Message{}, "session_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.Session{}, id).Error; err != nil {
			return err
		}
		return nil
	})
}

// ─── Message ────────────────────────────────────────────────

func (s *Store) AddMessage(ctx context.Context, msg models.Message) (models.Message, error) {
	err := s.db.WithContext(ctx).Create(&msg).Error
	return msg, err
}

func (s *Store) ListMessages(ctx context.Context, sessionID int64, limit int) ([]models.Message, error) {
	var list []models.Message
	q := s.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("id asc")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&list).Error
	return list, err
}

func (s *Store) GetLastUserMessage(ctx context.Context, sessionID int64) (models.Message, error) {
	var msg models.Message
	err := s.db.WithContext(ctx).Where("session_id = ? AND role = ?", sessionID, "user").Order("id desc").Limit(1).First(&msg).Error
	return msg, err
}

// ─── LLMConfig ──────────────────────────────────────────────

func (s *Store) GetLLMConfig(ctx context.Context) (models.LLMConfig, error) {
	var cfg models.LLMConfig
	err := s.db.WithContext(ctx).First(&cfg, 1).Error
	if err == nil {
		return cfg, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.LLMConfig{}, err
	}

	cfg = models.DefaultLLMConfig()
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoNothing: true,
	}).Create(&cfg).Error; err != nil {
		return models.LLMConfig{}, err
	}

	if err := s.db.WithContext(ctx).First(&cfg, 1).Error; err != nil {
		return models.LLMConfig{}, err
	}
	return cfg, nil
}

func (s *Store) UpdateLLMConfig(ctx context.Context, cfg models.LLMConfig) error {
	cfg.UpdatedAt = time.Now()
	return s.db.WithContext(ctx).Model(&models.LLMConfig{}).Where("id = ?", cfg.ID).Updates(map[string]interface{}{
		"provider": cfg.Provider, "base_url": cfg.BaseURL, "api_key": cfg.APIKey,
		"model_name": cfg.ModelName, "updated_at": cfg.UpdatedAt,
	}).Error
}

func (s *Store) CreateDefaultLLMConfig(ctx context.Context) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&models.LLMConfig{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	cfg := models.DefaultLLMConfig()
	return s.db.WithContext(ctx).Create(&cfg).Error
}

// ─── helpers ────────────────────────────────────────────────

func ensureSQLiteDir(dsn string) error {
	path := strings.TrimSpace(dsn)
	if strings.HasPrefix(path, "file:") {
		path = strings.TrimPrefix(path, "file:")
	}
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	path = strings.TrimSpace(path)
	if path == "" || path == ":memory:" {
		return nil
	}

	dir := filepath.Dir(path)
	if dir == "." || dir == "/" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return nil
}

// ─── debug logger ──────────────────────────────────────────────

type debugLogger struct{}

func (l *debugLogger) LogMode(level logger.LogLevel) logger.Interface { return l }

func (l *debugLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	fmt.Printf("[DB:INFO] %s %v\n", msg, data)
}

func (l *debugLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	fmt.Printf("[DB:WARN] %s %v\n", msg, data)
}

func (l *debugLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	fmt.Printf("[DB:ERROR] %s %v\n", msg, data)
}

var maskRe = regexp.MustCompile(`(api_key|password)\s*=\s*'[^']*'`)

func maskSQL(sql string) string {
	return maskRe.ReplaceAllString(sql, `${1}='***'`)
}

func (l *debugLogger) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	elapsed := time.Since(begin)
	sql, rows := fc()
	sql = maskSQL(sql)
	if err != nil {
		fmt.Printf("[DB:SQL] %s | err=%v | %v\n", sql, err, elapsed)
		return
	}
	if rows == -1 {
		fmt.Printf("[DB:SQL] %s | %v\n", sql, elapsed)
	} else {
		fmt.Printf("[DB:SQL] %s | rows=%d | %v\n", sql, rows, elapsed)
	}
}
