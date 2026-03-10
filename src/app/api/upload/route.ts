/**
 * メディアアップロードAPI
 * POST /api/upload
 *
 * FormDataでファイルを受け取り、Supabase Storageにアップロードして公開URLを返す
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB

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
      {
        error: `対応していないファイル形式です（対応: JPEG, PNG, GIF, WebP, MP4）`,
      },
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

  const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
  const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  let uploadResult = await supabase.storage
    .from("post-media")
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadResult.error?.message?.includes("not found") || uploadResult.error?.message?.includes("Bucket")) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.storage.createBucket("post-media", {
      public: true,
      fileSizeLimit: 26214400,
      allowedMimeTypes: [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/quicktime",
      ],
    });
    uploadResult = await supabase.storage
      .from("post-media")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });
  }

  if (uploadResult.error) {
    console.error("アップロードエラー:", uploadResult.error);
    return NextResponse.json(
      { error: `アップロードに失敗しました: ${uploadResult.error.message}` },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("post-media").getPublicUrl(fileName);

  return NextResponse.json({
    url: publicUrl,
    type: isVideo ? "video" : "image",
    name: file.name,
  });
}
