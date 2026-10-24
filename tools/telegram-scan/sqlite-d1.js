const READS = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i;
const PLAIN_READ = /^\s*(SELECT|WITH)\b/i;

/**
 * A D1 binding over an open node:sqlite database: same
 * prepare/bind/first/all/run/batch surface, batches run as one transaction.
 * `onWrite(sql, params)` gets every statement that is not a plain read once
 * it has committed, in order, so the same writes can be replayed elsewhere.
 */
export function wrapSqlite(sqlite, { onWrite } = {}) {
  function execute(sql, params) {
    const stmt = sqlite.prepare(sql);
    if (READS.test(sql)) {
      const results = stmt.all(...params).map((row) => ({ ...row }));
      return { success: true, results, meta: { changes: PLAIN_READ.test(sql) ? 0 : results.length } };
    }
    const info = stmt.run(...params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  function record(statements) {
    if (!onWrite) return;
    for (const { sql, params } of statements) if (!PLAIN_READ.test(sql)) onWrite(sql, params);
  }

  function single(sql, params) {
    const out = execute(sql, params);
    record([{ sql, params }]);
    return out;
  }

  function statement(sql, params = []) {
    return {
      sql,
      params,
      bind: (...values) => statement(sql, values),
      async first(column) {
        const row = single(sql, params).results[0] ?? null;
        return column && row ? row[column] : row;
      },
      async all() {
        return single(sql, params);
      },
      async run() {
        return single(sql, params);
      },
    };
  }

  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = statements.map((s) => execute(s.sql, s.params));
        sqlite.exec("COMMIT");
        record(statements);
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
