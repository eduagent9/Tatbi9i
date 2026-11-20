const PBKDF2_ITERATIONS = 210_000;
const PIN_PATTERN = /^\\d{4,8}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('بيانات PIN المخزنة غير صالحة.');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], part => Number.parseInt(part, 16));
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  if (!isValidPin(pin)) throw new Error('رمز PIN خاصو يكون من 4 حتى 8 أرقام.');
  if (!globalThis.crypto?.subtle) throw new Error('التشفير الآمن غير متاح على هاد الجهاز.');
  const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return { salt: toHex(saltBytes), hash: toHex(new Uint8Array(bits)) };
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  if (!isValidPin(pin) || !salt || !expectedHash || !globalThis.crypto?.subtle) return false;
  try {
    const saltBytes = fromHex(salt);
    const expected = fromHex(expectedHash);
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      key,
      256,
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}
