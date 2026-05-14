package agent

import (
	"context"
	"fmt"
	"strings"

	"talk2db/internal/datasource"
	"talk2db/internal/models"
)

func BuildSystemPrompt(ctx context.Context, registry *datasource.Registry, ds models.Datasource, tableSpaces []models.TableSpace) string {
	if len(tableSpaces) == 0 {
		return "你是一个 SQL 助手，请始终使用中文与用户交流。当前数据库尚未配置表空间，请告知用户需要先配置表空间后才能进行查询。"
	}

	var sb strings.Builder
	sb.WriteString("你是一个将自然语言转换为 SQL 的助手，请始终使用中文与用户交流。\n\n")
	sb.WriteString(fmt.Sprintf("数据库类型为 %s，数据库名为 '%s'。\n\n", ds.Engine, ds.DatabaseName))
	sb.WriteString("你可以访问以下表：\n\n")

	for _, ts := range tableSpaces {
		cols, err := registry.DescribeTable(ctx, ds.ID, ds.DatabaseName, ts.TableName)
		if err != nil {
			sb.WriteString(fmt.Sprintf("## %s\n  (无法获取表结构: %v)\n\n", ts.TableName, err))
			continue
		}
		sb.WriteString(fmt.Sprintf("## %s\n", ts.TableName))
		sb.WriteString("列信息：\n")
		for _, col := range cols {
			pk := ""
			if col.IsPK {
				pk = " PRIMARY KEY"
			}
			nullable := ""
			if col.Nullable {
				nullable = " NULL"
			} else {
				nullable = " NOT NULL"
			}
			sb.WriteString(fmt.Sprintf("  - %s (%s%s%s)\n", col.Name, col.Type, nullable, pk))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("使用 execute_sql 工具在数据库上执行 SELECT 查询。\n")
	sb.WriteString("规则：\n")
	sb.WriteString("- 只能生成 SELECT 语句，禁止 INSERT、UPDATE、DELETE、DROP 或 DDL 操作。\n")
	sb.WriteString("- 在执行查询前，始终先向用户解释你的分析思路。\n")
	sb.WriteString("- 如果用户的问题存在歧义，先向用户澄清再写 SQL。\n")
	sb.WriteString("- 以清晰易读的格式展示查询结果。\n")
	sb.WriteString("- 使用该数据库引擎对应的 SQL 方言。\n")

	return sb.String()
}
