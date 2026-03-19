/**
 * 外部画像URLをダウンロードして Supabase Storage（post-media バケット）にアップロードする
 *
 * 記事のOG画像やX投稿画像などの外部URLを、自前のストレージに保存することで
 * Threads API に渡す画像URLの安定性を確保する
 */

import { createAdminClient } from "@/lib/supabase/admin";

const TIMEOUT_MS = 20000;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB（Supabase Storage上限）
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface UploadResult {
  originalUrl: string;
  uploadedUrl: string;
  success: boolean;
}

/**
 * 外部画像URLのリストをダウンロードして Supabase Storage にアップロードする
 * 失敗した場合は元のURLをそのまま返す（fallback）
 *
 * @param imageUrls - アップロードする画像URLの配列
 * @param draftId   - 下書きID（ストレージパスのサブフォルダに使用）
 * @returns アップロード後のURL配列（失敗したものは元のURL）
 */
export async function downloadAndUploadImages(
  imageUrls: string[],
  draftId: string
): Promise<string[]> {
  if (imageUrls.length === 0) return [];

  const admin = createAdminClient();
  const results: string[] = [];

  for (const url of imageUrls) {
    const result = await uploadSingleImage(admin, url, draftId);
    results.push(result.uploadedUrl);
  }

  return results;
}

async function uploadSingleImage(
  admin: ReturnType<typeof createAdminClient>,
  url: string,
  draftId: string
): Promise<UploadResult> {
  try {
    // 外部URLから画像をダウンロード
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SNS-SaaS/1.0)",
      },
    });

    if (!res.ok) {
      console.warn(`画像ダウンロード失敗: ${url} (${res.status})`);
      return { originalUrl: url, uploadedUrl: url, success: false };
    }

    // Content-Type チェック
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_TYPES.has(contentType)) {
      console.warn(`対応していない画像タイプ: ${contentType} (${url})`);
      return { originalUrl: url, uploadedUrl: url, success: false };
    }

    // ファイルサイズチェック
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      console.warn(`ファイルサイズ超過: ${buffer.byteLength} bytes (${url})`);
      return { originalUrl: url, uploadedUrl: url, success: false };
    }

    // 拡張子を決定
    const ext = contentTypeToExt(contentType);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `drafts/${draftId}/${filename}`;

    // Supabase Storage にアップロード
    const { error: uploadError } = await admin.storage
      .from("post-media")
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.warn(`Supabase Storageアップロード失敗: ${uploadError.message} (${url})`);
      return { originalUrl: url, uploadedUrl: url, success: false };
    }

    // 公開URLを取得
    const { data: publicUrlData } = admin.storage
      .from("post-media")
      .getPublicUrl(storagePath);

    const uploadedUrl = publicUrlData.publicUrl;
    console.log(`画像アップロード完了: ${url} → ${uploadedUrl}`);

    return { originalUrl: url, uploadedUrl, success: true };
  } catch (err) {
    console.warn(
      `画像処理エラー: ${url}`,
      err instanceof Error ? err.message : err
    );
    return { originalUrl: url, uploadedUrl: url, success: false };
  }
}

/**
 * Buffer（base64デコード済み）を Supabase Storage にアップロードする
 * Gemini画像生成などで得られたバイナリデータ用
 */
export async function uploadBufferImage(
  buffer: Buffer,
  mimeType: string,
  draftId: string
): Promise<string | null> {
  if (!ALLOWED_TYPES.has(mimeType)) {
    console.warn(`対応していない画像タイプ: ${mimeType}`);
    return null;
  }

  if (buffer.byteLength > MAX_FILE_SIZE) {
    console.warn(`ファイルサイズ超過: ${buffer.byteLength} bytes`);
    return null;
  }

  try {
    const admin = createAdminClient();
    const ext = contentTypeToExt(mimeType);
    const filename = `infographic_${Date.now()}.${ext}`;
    const storagePath = `drafts/${draftId}/${filename}`;

    const { error: uploadError } = await admin.storage
      .from("post-media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.warn(`インフォグラフィックアップロード失敗: ${uploadError.message}`);
      return null;
    }

    const { data: publicUrlData } = admin.storage
      .from("post-media")
      .getPublicUrl(storagePath);

    console.log(`インフォグラフィックアップロード完了: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn(
      "インフォグラフィックアップロードエラー:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function contentTypeToExt(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[contentType] ?? "jpg";
}
