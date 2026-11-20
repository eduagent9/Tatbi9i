import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
} from '@capacitor-community/sqlite';
import initialSchema from './migrations/001_initial_schema.sql?raw';
import defaultDepot from './migrations/002_default_depot.sql?raw';
import purchasesSchema from './migrations/003_purchases.sql?raw';
import localOwner from './migrations/004_local_owner.sql?raw';
import expensesSchema from './migrations/005_expenses.sql?raw';

export interface SqliteExecutor {
  execute(statement: string): Promise<unknown>;
  query(statement: string, values?: unknown[]): Promise<{ values?: Array<Record<string, unknown>> }>;
  run(statement: string, values?: unknown[]): Promise<unknown>;
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
}

export interface SqliteConnectionFactory {
  open(name: string): Promise<SqliteExecutor>;
  close(name: string): Promise<void>;
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const APP_DATABASE_NAME = 'tatbiqi';
export const APP_MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial_schema', sql: initialSchema },
  { version: 2, name: 'default_depot', sql: defaultDepot },
  { version: 3, name: 'purchases', sql: purchasesSchema },
  { version: 4, name: 'local_owner_profile', sql: localOwner },
  { version: 5, name: 'expenses', sql: expensesSchema },
];

export async function applyMigrations(
  db: SqliteExecutor,
  migrations: Migration[],
): Promise<number> {
  await db.execute('PRAGMA foreign_keys = ON;');
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);

  const rows = await db.query('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations;');
  let currentVersion = Number(rows.values?.[0]?.version ?? 0);
  const pending = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (migration.version <= currentVersion) continue;
    if (migration.version !== currentVersion + 1) {
      throw new Error(`Migration sequence gap: expected ${currentVersion + 1}, received ${migration.version}`);
    }

    await db.beginTransaction();
    try {
      await db.execute(migration.sql);
      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?);',
        [migration.version, migration.name],
      );
      await db.commitTransaction();
      currentVersion = migration.version;
    } catch (error) {
      try {
        await db.rollbackTransaction();
      } catch {
        // Preserve the original migration error; the connection will be closed by its owner.
      }
      throw error;
    }
  }
  return currentVersion;
}

class CapacitorSqliteFactory implements SqliteConnectionFactory {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);

  async open(name: string): Promise<SqliteExecutor> {
    const connection = await this.sqlite.createConnection(name, false, 'no-encryption', 1, false);
    await connection.open();
    return connection as unknown as SqliteExecutor;
  }

  async close(name: string): Promise<void> {
    const exists = await this.sqlite.isConnection(name, false);
    if (exists.result) await this.sqlite.closeConnection(name, false);
  }
}

let opening: Promise<SqliteExecutor> | null = null;
let active: SqliteExecutor | null = null;

export async function openAppDatabase(
  factory: SqliteConnectionFactory = new CapacitorSqliteFactory(),
): Promise<SqliteExecutor> {
  if (Capacitor.getPlatform() === 'web') {
    throw new Error('قاعدة البيانات متاحة حالياً داخل تطبيق Android فقط؛ معاينة المتصفح لا تحفظ البيانات.');
  }
  if (active) return active;
  if (opening) return opening;

  opening = (async () => {
    const db = await factory.open(APP_DATABASE_NAME);
    try {
      await applyMigrations(db, APP_MIGRATIONS);
      active = db;
      return db;
    } catch (error) {
      await factory.close(APP_DATABASE_NAME).catch(() => undefined);
      throw error;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

export async function closeAppDatabase(
  factory: SqliteConnectionFactory = new CapacitorSqliteFactory(),
): Promise<void> {
  if (!active) return;
  await factory.close(APP_DATABASE_NAME);
  active = null;
}
