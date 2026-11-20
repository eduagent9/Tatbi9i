export type SqliteBackupPayload = Record<string, unknown> & {
  database: string;
  version: number;
};

export function parseSqliteBackupPayload(value: unknown, expectedDatabase: string): SqliteBackupPayload {
  let payload = value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      throw new Error('محتوى قاعدة البيانات داخل النسخة غير صالح.');
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('النسخة الاحتياطية ما فيهاش بنية قاعدة بيانات صحيحة.');
  }
  const candidate = payload as Record<string, unknown>;
  if (candidate.database !== expectedDatabase) {
    throw new Error('هاد الملف ماشي نسخة احتياطية ديال تطبيق تطبيقي.');
  }
  if (!Number.isSafeInteger(candidate.version) || Number(candidate.version) < 1) {
    throw new Error('إصدار قاعدة البيانات داخل النسخة غير صالح.');
  }
  return candidate as SqliteBackupPayload;
}

export function parseTatbiqiBackup(text: string, expectedDatabase: string): SqliteBackupPayload {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text) as unknown;
  } catch {
    throw new Error('ملف النسخة الاحتياطية ماشي JSON صالح.');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('صيغة ملف النسخة الاحتياطية غير معروفة.');
  }
  const candidate = envelope as Record<string, unknown>;
  if (candidate.format !== 'tatbiqi-sqlite-backup' || candidate.formatVersion !== 1) {
    throw new Error('صيغة النسخة الاحتياطية غير مدعومة.');
  }
  if (candidate.appDatabase !== expectedDatabase) {
    throw new Error('النسخة الاحتياطية ماشي ديال قاعدة بيانات تطبيقي.');
  }
  return parseSqliteBackupPayload(candidate.payload, expectedDatabase);
}

export function withOverwrite(payload: SqliteBackupPayload): SqliteBackupPayload {
  return { ...payload, overwrite: true };
}
