package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"talk2db/internal/models"

	_ "github.com/go-sql-driver/mysql"
)

type mysqlDriver struct{}

func (d *mysqlDriver) Open(ds models.Datasource) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True",
		ds.Username, ds.Password, ds.Host, ds.Port, ds.DatabaseName,
	)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	return db, nil
}

func (d *mysqlDriver) ListTables(db *sql.DB, database string) ([]string, error) {
	rows, err := db.QueryContext(context.Background(),
		"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
		database,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tables := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, rows.Err()
}

func (d *mysqlDriver) DescribeTable(db *sql.DB, database, table string) ([]ColumnInfo, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
		 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		 ORDER BY ORDINAL_POSITION`,
		database, table,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []ColumnInfo
	for rows.Next() {
		var name, colType, nullable, key string
		if err := rows.Scan(&name, &colType, &nullable, &key); err != nil {
			return nil, err
		}
		cols = append(cols, ColumnInfo{
			Name:     name,
			Type:     colType,
			Nullable: strings.EqualFold(nullable, "YES"),
			IsPK:     strings.EqualFold(key, "PRI"),
		})
	}
	return cols, rows.Err()
}
