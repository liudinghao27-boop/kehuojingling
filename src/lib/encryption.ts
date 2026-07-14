import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function resolveKey(envVarName = 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY'): Buffer {
  const raw = process.env[envVarName];
  const isDev = process.env.NODE_ENV !== 'production';

  if (!raw) {
    if (isDev) {
      console.warn(
        `[encryption] ${envVarName} is not set, using development placeholder. DO NOT use this in production.`
      );
      return Buffer.from('development-key-32bytes-for-devx');
    }
    throw new Error(`${envVarName} is required in production`);
  }

  // 32 字节明文密钥
  if (Buffer.byteLength(raw, 'utf8') === KEY_LENGTH) {
    return Buffer.from(raw, 'utf8');
  }

  // 尝试 base64 解码
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === KEY_LENGTH) {
      return decoded;
    }
  } catch {
    // ignore and try hex
  }

  // 尝试 hex 解码
  if (raw.length === KEY_LENGTH * 2) {
    try {
      const decoded = Buffer.from(raw, 'hex');
      if (decoded.length === KEY_LENGTH) {
        return decoded;
      }
    } catch {
      // ignore
    }
  }

  if (isDev) {
    console.warn(
      `[encryption] ${envVarName} is not 32 bytes, using development placeholder. DO NOT use this in production.`
    );
    return Buffer.from('development-key-32bytes-for-devx');
  }

  throw new Error(
    `${envVarName} must be ${KEY_LENGTH} bytes (base64 or hex encoded)`
  );
}

const keyCache: Record<string, Buffer> = {};

function getEncryptionKey(envVarName = 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY'): Buffer {
  if (!keyCache[envVarName]) {
    keyCache[envVarName] = resolveKey(envVarName);
  }
  return keyCache[envVarName];
}

export function encrypt(text: string): string {
  return encryptWithKey(text, 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY');
}

export function decrypt(encrypted: string): string {
  return decryptWithKey(encrypted, 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY');
}

export function encryptWithKey(text: string, envVarName: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(envVarName), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptWithKey(encrypted: string, envVarName: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted format');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(envVarName), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// AI API Key 专用加密：优先使用 AI_API_KEY_ENCRYPTION_KEY，未设置则回退到 PLATFORM_CREDENTIALS_ENCRYPTION_KEY
const AI_KEY_ENV_VAR = 'AI_API_KEY_ENCRYPTION_KEY';

export function encryptAiApiKey(key: string): string {
  try {
    return encryptWithKey(key, AI_KEY_ENV_VAR);
  } catch {
    return encryptWithKey(key, 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY');
  }
}

export function decryptAiApiKey(encrypted: string): string {
  try {
    return decryptWithKey(encrypted, AI_KEY_ENV_VAR);
  } catch {
    return decryptWithKey(encrypted, 'PLATFORM_CREDENTIALS_ENCRYPTION_KEY');
  }
}

// 兼容历史明文存储：能解密则返回明文，解密失败视为明文直接返回
export function tryDecryptAiApiKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decryptAiApiKey(value);
  } catch {
    return value;
  }
}
