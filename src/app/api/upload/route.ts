/**
 * メディアアップロードAPI
 * POST /api/upload
 *
 * FormDataでファイルを受け取り、Supabase Storageにアップロードして公開URLを返す
 * adminクライアント使用（RLSバイパス）— 認証チェックはサーバー側で行う
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
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "ファイルが必要です" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "対応していないファイル形式です（対応: JPEG, PNG, GIF, WebP, MP4）" },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

  if (file.size > maxSize) {
    const limitMB = maxSize / 1024 / 1024;
    return NextResponse.json(
      { error: `ファイルサイズが${limitMB}MBを超えています` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
  const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.id === "post-media")) {
    await admin.storage.createBucket("post-media", {
      public: true,
      fileSizeLimit: 26214400,
      allowedMimeTypes: [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/quicktime",
      ],
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("post-media")
    .upload(fileName, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("アップロードエラー:", uploadError);
    return NextResponse.json(
      { error: `アップロードに失敗しました: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = admin.storage
    .from("post-media")
    .getPublicUrl(fileName);

  return NextResponse.json({
    url: publicUrl,
    type: isVideo ? "video" : "image",
    name: file.name,
  });
}
