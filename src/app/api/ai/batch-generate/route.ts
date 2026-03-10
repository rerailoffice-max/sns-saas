/**
 * 一括下書き生成API
 * POST /api/ai/batch-generate
 *
 * テーマリストから複数の下書きを一括生成し、draftsテーブルに保存する。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPostPrompt } from "@/lib/prompt-engine";

const requestSchema = z.object({
  themes: z.array(z.string().min(1).max(200)).min(1).max(15),
  account_id: z.string().uuid(),
  platform: z.enum(["threads", "x"]).optional().default("threads"),
  selected_models: z.array(z.string()).optional(),
  thread_count: z.number().min(3).max(6).optional().default(4),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI機能が設定されていません" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { themes, account_id, platform, selected_models, thread_count } =
    parsed.data;

  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", account_id)
    .eq("profile_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "アカウントが見つかりません" },
      { status: 404 }
    );
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = buildPostPrompt({
      platform,
      selectedModels: selected_models ?? [],
      threadCount: thread_count,
    });

    const drafts: Array<{
      theme: string;
      thread_posts: string[];
    }> = [];

    for (const theme of themes) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: `テーマ: ${theme}\n\nバズりやすいスレッド形式の投稿を生成してください。JSON配列で返してください。`,
            },
          ],
          system: systemPrompt,
        });

        const responseText =
          response.content[0].type === "text" ? response.content[0].text : "";
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        } else {
          const arrayMatch = responseText.match(/\[[\s\S]*\]/);
          if (arrayMatch) jsonStr = arrayMatch[0];
        }

        const threadPosts = JSON.parse(jsonStr) as string[];
        if (Array.isArray(threadPosts) && threadPosts.length > 0) {
          drafts.push({ theme, thread_posts: threadPosts });
        }
      } catch {
        drafts.push({ theme, thread_posts: [] });
      }
    }

    const savedDrafts = [];
    for (const draft of drafts) {
      if (draft.thread_posts.length === 0) continue;

      const { data, error } = await supabase
        .from("drafts")
        .insert({
          profile_id: user.id,
          account_id,
          text: draft.thread_posts[0],
          hashtags: [],
          media_urls: [],
          source: "ai",
          metadata: {
            thread_posts: draft.thread_posts,
            batch_theme: draft.theme,
          },
          status: "draft",
        })
        .select()
        .single();

      if (!error && data) {
        savedDrafts.push({ ...data, thread_posts: draft.thread_posts });
      }
    }

    return NextResponse.json({
      data: {
        generated: drafts.length,
        saved: savedDrafts.length,
        drafts: savedDrafts,
      },
    });
  } catch (err) {
    console.error("一括生成エラー:", err);
    return NextResponse.json(
      { error: "一括生成に失敗しました" },
      { status: 500 }
    );
  }
}
