import { describe, expect, it } from 'vitest';
import { parseSqliteBackupPayload, parseTatbiqiBackup, withOverwrite } from './backup-format';

const payload = { database: 'tatbiqi', version: 9, encrypted: false, tables: [] };

describe('Tatbiqi backup format', () => {
  it('accepts a valid wrapped SQLite backup', () => {
    const text = JSON.stringify({
      format: 'tatbiqi-sqlite-backup',
      formatVersion: 1,
      appDatabase: 'tatbiqi',
      exportedAt: '2026-11-20T00:00:00.000Z',
      payload,
    });
    expect(parseTatbiqiBackup(text, 'tatbiqi')).toEqual(payload);
  });

  it('accepts the SQLite plugin string payload form', () => {
    expect(parseSqliteBackupPayload(JSON.stringify(payload), 'tatbiqi')).toEqual(payload);
  });

  it('rejects a backup belonging to another database', () => {
    expect(() => parseTatbiqiBackup(JSON.stringify({
      format: 'tatbiqi-sqlite-backup', formatVersion: 1, appDatabase: 'other', payload,
    }), 'tatbiqi')).toThrow('ماشي ديال قاعدة بيانات تطبيقي');
  });

  it('rejects malformed or unsupported backup files', () => {
    expect(() => parseTatbiqiBackup('{bad json', 'tatbiqi')).toThrow('JSON صالح');
    expect(() => parseTatbiqiBackup(JSON.stringify({ format: 'unknown', formatVersion: 1, appDatabase: 'tatbiqi', payload }), 'tatbiqi')).toThrow('غير مدعومة');
  });

  it('rejects invalid SQLite payloads and database versions', () => {
    expect(() => parseSqliteBackupPayload({ database: 'wrong', version: 9 }, 'tatbiqi')).toThrow('ماشي نسخة احتياطية');
    expect(() => parseSqliteBackupPayload({ database: 'tatbiqi', version: 0 }, 'tatbiqi')).toThrow('الإصدار');
    expect(() => parseSqliteBackupPayload([], 'tatbiqi')).toThrow('بنية قاعدة بيانات');
  });

  it('marks a validated import to replace the current database explicitly', () => {
    expect(withOverwrite(payload)).toEqual({ ...payload, overwrite: true });
  });
});
