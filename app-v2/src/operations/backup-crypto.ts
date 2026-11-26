const BACKUP_FORMAT = 'tatbiqi-encrypted-backup';
const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;

type EncryptedBackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_VERSION;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new Error('كلمة سر النسخة خاصها تكون 12 حرف أو أكثر.');
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('التشفير الآمن غير متاح على هذا الجهاز.');
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncryptedBackupText(text: string): boolean {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value?.format === BACKUP_FORMAT;
  } catch {
    return false;
  }
}

export async function encryptBackupText(plaintext: string, password: string): Promise<string> {
  validatePassword(password);
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    throw new Error('التشفير الآمن غير متاح على هذا الجهاز.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptBackupText(text: string, password: string): Promise<string> {
  validatePassword(password);
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(text) as EncryptedBackupEnvelope;
  } catch {
    throw new Error('ملف النسخة المشفرة غير صالح.');
  }
  if (
    !envelope ||
    envelope.format !== BACKUP_FORMAT ||
    envelope.formatVersion !== BACKUP_VERSION ||
    envelope.algorithm !== 'AES-GCM' ||
    envelope.kdf !== 'PBKDF2-SHA-256' ||
    envelope.iterations !== PBKDF2_ITERATIONS ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('صيغة النسخة المشفرة غير مدعومة أو تالفة.');
  }
  try {
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
      throw new Error('invalid encrypted backup lengths');
    }
    const key = await deriveKey(password, salt);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('كلمة السر غير صحيحة أو ملف النسخة تالف.');
  }
}
