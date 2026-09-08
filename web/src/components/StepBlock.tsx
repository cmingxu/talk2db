import ToolCallBlock from './ToolCallBlock';
import ToolResultBlock from './ToolResultBlock';
import EChartsBlock from './EChartsBlock';

export interface StepResult {
  type?: string;
  config?: Record<string, unknown>;
  columns?: string[];
  rows?: string[][];
  count?: number;
  error?: string;
  filename?: string;
  /** Generic (non-table/chart) result content, rendered as a JSON block. */
  raw?: Record<string, unknown>;
}

/** A persisted/legacy tool-result entry (superset of StepResult). */
export interface ToolResultEntry extends StepResult {
  tool?: string;
  /** Legacy fallback: a wrapped JSON payload string (e.g. {result: "..."}). */
  result?: string | Record<string, unknown>;
}

export interface StreamStep {
  tool: string;
  arguments: string;
  status: 'executing' | 'done' | 'error';
  result?: StepResult;
}

/** Assigns a 1-based index to each execute_sql step (in order). */
export function indexSqlSteps(steps: StreamStep[]): (StreamStep & { index?: number })[] {
  let n = 0;
  return steps.map(s => (s.tool === 'execute_sql' ? { ...s, index: ++n } : s));
}

/**
 * Normalizes a raw tool_result SSE payload into a canonical StepResult.
 * Handles all backend shapes:
 *   - {tool, type, columns, rows, count, error, filename}  (SQL success)
 *   - {tool, type, config, ...}                            (skill success)
 *   - {tool, error}                                        (tool Go error)
 *   - {tool, result: "{...}"}                              (SQL/skill failure)
 */
export function normalizeToolResult(raw: any): StepResult {
  const r: StepResult = {
    type: raw?.type,
    config: raw?.config,
    columns: raw?.columns,
    rows: raw?.rows,
    count: raw?.count,
    filename: raw?.filename,
  };

  let error = typeof raw?.error === 'string' ? raw.error : '';
  let parsed: any = null;

  const wrapped = raw?.result;
  if (!error && wrapped != null) {
    parsed = wrapped;
    if (typeof wrapped === 'string') {
      try {
        parsed = JSON.parse(wrapped);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.error === 'string') error = parsed.error;
      if (!r.columns && Array.isArray(parsed.columns)) r.columns = parsed.columns;
      if (!r.rows && Array.isArray(parsed.rows)) r.rows = parsed.rows;
      if (r.count == null && parsed.count != null) r.count = parsed.count;
      if (!r.filename && typeof parsed.filename === 'string') r.filename = parsed.filename;
      if (!r.type && typeof parsed.type === 'string') r.type = parsed.type;
      if (!r.config && parsed.config != null) r.config = parsed.config;
    }
  }

  r.error = error || undefined;

  // For anything that isn't a known error/chart/table result, keep the raw
  // content so it can still be displayed (e.g. text/plain or numeric results).
  const structured = !!r.error || (r.type === 'echart' && !!r.config) || !!(r.columns && r.columns.length > 0);
  if (!structured) {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      r.raw = parsed as Record<string, unknown>;
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const { tool: _tool, result: _result, ...rest } = raw as Record<string, unknown>;
      r.raw = rest;
    }
  }

  return r;
}

/** Renders a StepResult as an error box, chart, or result table. */
export function ToolResultView({ result }: { result?: StepResult }) {
  if (!result) return null;
  if (result.error) {
    return <ToolResultBlock error={result.error} />;
  }
  if (result.type === 'echart' && result.config) {
    return <EChartsBlock config={result.config} />;
  }
  if (result.columns && result.columns.length > 0) {
    // Single-cell result (e.g. SELECT COUNT(*)) → show as a prominent number.
    if (result.columns.length === 1 && result.rows && result.rows.length === 1) {
      return (
        <div className="flex items-baseline gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-2xl font-bold">{result.rows[0][0] ?? 'NULL'}</span>
          <span className="text-xs text-muted-foreground">{result.columns[0]}</span>
        </div>
      );
    }
    return (
      <ToolResultBlock
        columns={result.columns}
        rows={result.rows}
        count={result.count}
        error={result.error}
        filename={result.filename}
      />
    );
  }
  if (result.raw && Object.keys(result.raw).length > 0) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/80">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      </div>
    );
  }
  return null;
}

interface StepBlockProps {
  step: StreamStep & { index?: number };
  onExecuteSql?: (sql: string) => void;
}

/** One tool-call block immediately followed by its result/error block. */
export default function StepBlock({ step, onExecuteSql }: StepBlockProps) {
  return (
    <div className="space-y-2">
      <ToolCallBlock
        tool={step.tool}
        arguments={step.arguments}
        status={step.status}
        index={step.index}
        onExecuteSql={step.tool === 'execute_sql' ? onExecuteSql : undefined}
      />
      <ToolResultView result={step.result} />
    </div>
  );
}
