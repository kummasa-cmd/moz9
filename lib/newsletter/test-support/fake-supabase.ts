import { randomUUID } from "node:crypto";

// Minimal in-memory stand-in for the supabase-js query builder, covering only
// what lib/newsletter/scheduler.ts uses: select / update / upsert / insert
// with eq / neq / in / or("col.is.null,col.neq.x") filters, maybeSingle /
// single, head-only counts ({ count: "exact", head: true }), and awaiting the
// builder directly. Test-only.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeWrite = { table: string; op: "update" | "upsert" | "insert"; values: Row };

function parseOrClause(clause: string): Filter {
  const [col, op, ...rest] = clause.split(".");
  const value = rest.join(".");
  if (op === "is" && value === "null") return (r) => r[col] === null || r[col] === undefined;
  if (op === "eq") return (r) => String(r[col]) === value;
  if (op === "neq") return (r) => String(r[col]) !== value;
  throw new Error(`fake-supabase: unsupported or() clause ${clause}`);
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = [];
  private op: "select" | "update" | "upsert" | "insert" = "select";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private mode: "many" | "maybeSingle" | "single" = "many";
  private countOnly = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.head) this.countOnly = true;
    return this;
  }
  update(values: Row): this {
    this.op = "update";
    this.payload = values;
    return this;
  }
  upsert(rows: Row[], opts: { onConflict: string }): this {
    this.op = "upsert";
    this.payload = rows;
    this.onConflict = opts.onConflict.split(",");
    return this;
  }
  insert(values: Row | Row[]): this {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  or(expr: string): this {
    const clauses = expr.split(",").map(parseOrClause);
    this.filters.push((r) => clauses.some((c) => c(r)));
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }

  private run(): Row[] {
    const rows = this.db.rows(this.table);
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "select") return matches().map((r) => ({ ...r }));

    if (this.op === "update") {
      const hit = matches();
      for (const r of hit) Object.assign(r, this.payload);
      this.db.writes.push({ table: this.table, op: "update", values: { ...(this.payload as Row) } });
      return hit.map((r) => ({ ...r }));
    }

    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
    const out: Row[] = [];
    for (const values of incoming) {
      this.db.writes.push({ table: this.table, op: this.op, values: { ...values } });
      const existing =
        this.op === "upsert" ? rows.find((r) => this.onConflict.every((c) => r[c] === values[c])) : undefined;
      if (existing) {
        Object.assign(existing, values);
        out.push({ ...existing });
      } else {
        const row = { id: randomUUID(), tracking_token: randomUUID(), ...values };
        rows.push(row);
        out.push({ ...row });
      }
    }
    return out;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: { data: unknown; error: null; count?: number };
    try {
      const rows = this.run();
      if (this.countOnly) {
        result = { data: null, error: null, count: rows.length };
      } else {
        const data = this.mode === "many" ? rows : (rows[0] ?? null);
        result = { data, error: null };
      }
    } catch (err) {
      return Promise.reject(err).then(undefined, onrejected);
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  readonly tables: Record<string, Row[]> = {};
  readonly writes: FakeWrite[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables[table] = rows.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}
