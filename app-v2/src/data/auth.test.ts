import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from './auth';

describe('offline PIN authentication', () => {
  it('accepts only 4 to 8 numeric digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('stores a salted PBKDF2 hash and verifies the correct PIN', async () => {
    const credentials = await hashPin('4826');
    expect(credentials.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(credentials.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPin('4826', credentials.salt, credentials.hash)).toBe(true);
    expect(await verifyPin('4827', credentials.salt, credentials.hash)).toBe(false);
  });

  it('uses a different random salt for each credential', async () => {
    const first = await hashPin('4826');
    const second = await hashPin('4826');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('rejects weak PINs instead of hashing them', async () => {
    await expect(hashPin('123')).rejects.toThrow('4 حتى 8');
  });
});
