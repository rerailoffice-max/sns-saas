/**
 * OAuthトークン暗号化ユーティリティ
 * AES-256-GCM による暗号化/復号化
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * 暗号化キーを取得
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY 環境変数が設定されていません");
  }
  return Buffer.from(key, "hex");
}

/**
 * テキストを暗号化
 * @returns "iv:encrypted:tag" 形式の暗号化文字列
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * 暗号化テキストを復号化
 * @param ciphertext "iv:encrypted:tag" 形式の暗号化文字列
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted, tagHex] = ciphertext.split(":");

  if (!ivHex || !encrypted || !tagHex) {
    throw new Error("無効な暗号化フォーマットです");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
