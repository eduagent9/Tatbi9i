import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { decryptBackupText, encryptBackupText, isEncryptedBackupText } from './backup-crypto';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  }
});

describe('encrypted backup files', () => {
  it('encrypts and decrypts a backup without exposing the plaintext', async () => {
    const source = JSON.stringify({ invoices: [{ total: 12500 }], customers: ['A'] });
    const encrypted = await encryptBackupText(source, 'a-long-backup-password');
    expect(isEncryptedBackupText(encrypted)).toBe(true);
    expect(encrypted).not.toContain('invoices');
    expect(await decryptBackupText(encrypted, 'a-long-backup-password')).toBe(source);
  });

  it('uses a fresh salt and IV for each export', async () => {
    const source = '{"ok":true}';
    const first = await encryptBackupText(source, 'a-long-backup-password');
    const second = await encryptBackupText(source, 'a-long-backup-password');
    expect(first).not.toBe(second);
  });

  it('rejects short passwords and wrong passwords', async () => {
    await expect(encryptBackupText('data', 'short')).rejects.toThrow('12');
    const encrypted = await encryptBackupText('data', 'a-long-backup-password');
    await expect(decryptBackupText(encrypted, 'a-different-backup-password')).rejects.toThrow('غير صحيحة');
  });

  it('rejects unsupported or malformed envelopes', async () => {
    await expect(decryptBackupText('{"format":"other"}', 'a-long-backup-password')).rejects.toThrow('غير مدعومة');
  });
});
