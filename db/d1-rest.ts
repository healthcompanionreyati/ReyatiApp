type D1RestResult = {
  success: boolean;
  results: Record<string, unknown>[];
  meta?: Record<string, unknown>;
  error?: string;
};

type D1StatementPayload = { sql: string; params: unknown[] };

class D1RestPreparedStatement {
  constructor(
    private readonly database: D1RestDatabase,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new D1RestPreparedStatement(this.database, this.sql, params);
  }

  async all() {
    return this.database.execute({ sql: this.sql, params: this.params });
  }

  async run() {
    return this.database.execute({ sql: this.sql, params: this.params });
  }

  async raw() {
    const result = await this.all();
    return result.results.map((row) => Object.values(row));
  }

  async first(column?: string) {
    const row = (await this.all()).results[0];
    return column ? row?.[column] ?? null : row ?? null;
  }
}

export class D1RestDatabase {
  private readonly endpoint: string;

  constructor(accountId: string, databaseId: string, private readonly apiToken: string) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  }

  prepare(sql: string) {
    return new D1RestPreparedStatement(this, sql);
  }

  async batch(statements: D1RestPreparedStatement[]) {
    return this.request(statements.map((statement) => ({ sql: statement.sql, params: statement.params })));
  }

  async exec(sql: string) {
    const result = await this.execute({ sql, params: [] });
    return { count: Number(result.meta?.changes ?? 0), duration: Number(result.meta?.duration ?? 0) };
  }

  async execute(statement: D1StatementPayload) {
    const results = await this.request(statement);
    return results[0];
  }

  private async request(payload: D1StatementPayload | D1StatementPayload[]) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { success?: boolean; result?: D1RestResult[]; errors?: { message?: string }[] } | null;
    if (!response.ok || !body?.success || !Array.isArray(body.result)) {
      const message = body?.errors?.map((item) => item.message).filter(Boolean).join("; ") || `Cloudflare D1 request failed with ${response.status}`;
      throw new Error(message);
    }
    const failed = body.result.find((result) => !result.success);
    if (failed) throw new Error(failed.error || "Cloudflare D1 query failed");
    return body.result;
  }
}
