/**
 * Meta の signed_request（データ削除・連携解除のコールバック）を検証して中身を取り出す
 *
 * 形式: <base64url(署名)>.<base64url(JSON)>。署名は JSON部分の HMAC-SHA256。
 * 鍵は Threads の app secret（THREADS_APP_SECRET）。META_APP_SECRET が設定されていれば、それでも試す
 *
 * 参照: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import { createHmac, timingSafeEqual } from "crypto";

export interface MetaSignedRequestPayload {
  user_id?: string | number;
  algorithm?: string;
  issued_at?: number;
}

/**
 * 1つの鍵で署名を確かめる。合わなければ null
 */
export function parseSignedRequest(
  signedRequest: string,
  secret: string
): MetaSignedRequestPayload | null {
  const [encodedSignature, encodedPayload] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload) {
    return null;
  }

  const signature = Buffer.from(encodedSignature, "base64url");
  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as MetaSignedRequestPayload;
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * 設定されている鍵で署名を確かめる。どの鍵でも合わなければ null
 */
export function verifyMetaSignedRequest(signedRequest: string): MetaSignedRequestPayload | null {
  const secrets = [process.env.THREADS_APP_SECRET, process.env.META_APP_SECRET]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => !!secret);

  for (const secret of secrets) {
    const payload = parseSignedRequest(signedRequest, secret);
    if (payload) {
      return payload;
    }
  }
  return null;
}

/**
 * リクエスト本文（フォーム形式。念のためJSONも受ける）から signed_request を取り出す
 */
export async function readSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const body = await request.text();

  if (contentType.includes("application/json")) {
    try {
      return (JSON.parse(body) as { signed_request?: string }).signed_request ?? null;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(body).get("signed_request");
}
