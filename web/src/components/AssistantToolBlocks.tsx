import { Fragment, type ReactNode } from 'react';
import ToolCallBlock from './ToolCallBlock';
import { normalizeToolResult, ToolResultView, type ToolResultEntry } from './StepBlock';

interface Props {
  sql?: string;
  toolResults?: string;
  onExecuteSql?: (sql: string) => void;
}

/**
 * Renders an assistant turn's persisted tool calls and their results in
 * execution order: each execute_sql box is immediately followed by its own
 * result (table/chart) or error box. Used when reloading history from the DB,
 * where steps are stored as two parallel fields (sql + toolResults).
 */
export default function AssistantToolBlocks({ sql, toolResults, onExecuteSql }: Props) {
  const sqls = (sql ?? '').split(';\n').map(q => q.trim()).filter(Boolean);

  let results: ToolResultEntry[] = [];
  if (toolResults) {
    try {
      const parsed = JSON.parse(toolResults);
      if (Array.isArray(parsed)) results = parsed;
    } catch {
      results = [];
    }
  }

  const blocks: ReactNode[] = [];
  let sqlIdx = 0;
  let key = 0;

  for (const tr of results) {
    const result = normalizeToolResult(tr);

    if (tr.tool === 'execute_sql') {
      const q = sqls[sqlIdx];
      if (q) {
        blocks.push(
          <ToolCallBlock
            key={key++}
            tool="execute_sql"
            arguments={JSON.stringify({ query: q })}
            status={result.error ? 'error' : 'done'}
            index={sqlIdx + 1}
            onExecuteSql={onExecuteSql}
          />,
        );
        sqlIdx++;
      }
    } else if (tr.tool) {
      blocks.push(<ToolCallBlock key={key++} tool={tr.tool} arguments="" status="done" />);
    }

    const view = <ToolResultView result={result} />;
    if (
      result.error ||
      result.columns?.length ||
      (result.type === 'echart' && result.config) ||
      (result.raw && Object.keys(result.raw).length > 0)
    ) {
      blocks.push(<Fragment key={key++}>{view}</Fragment>);
    }
  }

  // Defensive: render any execute_sql queries that had no matching result entry.
  for (; sqlIdx < sqls.length; sqlIdx++) {
    blocks.push(
      <ToolCallBlock
        key={key++}
        tool="execute_sql"
        arguments={JSON.stringify({ query: sqls[sqlIdx] })}
        status="done"
        index={sqlIdx + 1}
        onExecuteSql={onExecuteSql}
      />,
    );
  }

  return <>{blocks}</>;
}
