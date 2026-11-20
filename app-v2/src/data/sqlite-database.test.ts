import { describe, expect, it, vi } from 'vitest';
import { applyMigrations, type SqliteExecutor, type Migration } from './sqlite-database';

function fakeDb(options: { failSql?: string } = {}) {
  let version = 0;
  let transaction = false;
  const calls: string[] = [];
  const db: SqliteExecutor = {
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (options.failSql && sql === options.failSql) throw new Error('migration failed');
    }),
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('COALESCE(MAX(version)')) return { values: [{ version }] };
      return { values: [] };
    }),
    run: vi.fn(async (_sql: string, values?: unknown[]) => { version = Number(values?.[0] ?? version); }),
    beginTransaction: vi.fn(async () => { transaction = true; }),
    commitTransaction: vi.fn(async () => { transaction = false; }),
    rollbackTransaction: vi.fn(async () => { transaction = false; }),
  };
  return { db, calls, get transaction() { return transaction; }, get version() { return version; } };
}

describe('SQLite migration runner', () => {
  it('applies ordered migrations and records each version', async () => {
    const fake = fakeDb();
    const migrations: Migration[] = [
      { version: 2, name: 'second', sql: 'CREATE TABLE second(id INTEGER);' },
      { version: 1, name: 'first', sql: 'CREATE TABLE first(id INTEGER);' },
    ];
    await expect(applyMigrations(fake.db, migrations)).resolves.toBe(2);
    expect(fake.version).toBe(2);
    expect(fake.db.beginTransaction).toHaveBeenCalledTimes(2);
    expect(fake.db.commitTransaction).toHaveBeenCalledTimes(2);
    expect(fake.transaction).toBe(false);
  });

  it('does not reapply an already recorded migration', async () => {
    const fake = fakeDb();
    await applyMigrations(fake.db, [{ version: 1, name: 'one', sql: 'SELECT 1;' }]);
    const beginCalls = vi.mocked(fake.db.beginTransaction).mock.calls.length;
    await applyMigrations(fake.db, [{ version: 1, name: 'one', sql: 'SELECT 1;' }]);
    expect(vi.mocked(fake.db.beginTransaction)).toHaveBeenCalledTimes(beginCalls);
  });

  it('rejects gaps in migration versions', async () => {
    const fake = fakeDb();
    await expect(applyMigrations(fake.db, [{ version: 2, name: 'two', sql: 'SELECT 2;' }]))
      .rejects.toThrow('Migration sequence gap');
    expect(fake.db.beginTransaction).not.toHaveBeenCalled();
  });

  it('rolls back a failed migration and preserves the original error', async () => {
    const sql = 'CREATE TABLE broken(id INTEGER);';
    const fake = fakeDb({ failSql: sql });
    await expect(applyMigrations(fake.db, [{ version: 1, name: 'broken', sql }]))
      .rejects.toThrow('migration failed');
    expect(fake.db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(fake.db.commitTransaction).not.toHaveBeenCalled();
    expect(fake.transaction).toBe(false);
  });
});
