/**
 * メディアアップロードAPI
 * POST /api/upload
 *
 * 署名付きURL方式: ファイルメタデータ(JSON)を受け取り、Supabase Storageへの
 * 署名付きアップロードURLを返す。クライアントがそのURLに直接ファイルをPUTする。
 * Vercelのボディサイズ制限(4.5MB)を回避し、動画(最大25MB)もアップロード可能。
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE = 25 * 1024 * 1024;

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.id === "post-media")) {
    await admin.storage.createBucket("post-media", {
      public: true,
      fileSizeLimit: 26214400,
      allowedMimeTypes: [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/quicktime", "video/webm",
      ],
    });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { fileName?: string; fileType?: string; fileSize?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストが不正です" },
      { status: 400 }
    );
  }

  const { fileName, fileType, fileSize } = body;

  if (!fileName || !fileType || !fileSize) {
    return NextResponse.json(
      { error: "fileName, fileType, fileSize が必要です" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json(
      { error: "対応していないファイル形式です（対応: JPEG, PNG, GIF, WebP, MP4, WebM）" },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(fileType);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

  if (fileSize > maxSize) {
    const limitMB = maxSize / 1024 / 1024;
    return NextResponse.json(
      { error: `ファイルサイズが${limitMB}MBを超えています` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  await ensureBucket(admin);

  const ext = fileName.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: signedData, error: signedError } = await admin.storage
    .from("post-media")
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    console.error("署名付きURL生成エラー:", signedError);
    return NextResponse.json(
      { error: "アップロードURLの生成に失敗しました" },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = admin.storage
    .from("post-media")
    .getPublicUrl(storagePath);

  return NextResponse.json({
    signedUrl: signedData.signedUrl,
    token: signedData.token,
    path: storagePath,
    publicUrl,
    type: isVideo ? "video" : "image",
  });
}
