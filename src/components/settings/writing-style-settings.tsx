"use client";

/**
 * ライティングスタイル設定コンポーネント
 * カスタムライティング指示の編集・保存
 */
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface WritingStyleSettingsProps {
  initialInstructions: string;
  hasWritingProfile: boolean;
  accountId: string | null;
}

export function WritingStyleSettings({
  initialInstructions,
  hasWritingProfile,
  accountId,
}: WritingStyleSettingsProps) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  /** カスタム指示を保存 */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/profile/writing-instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_writing_instructions: instructions }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "保存に失敗しました");
      }
      toast.success("ライティング指示を保存しました");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "保存に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  /** 自分の投稿から自動分析して指示文を生成 */
  const handleAutoGenerate = async () => {
    if (!accountId) {
      toast.error("接続済みのSNSアカウントが必要です");
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/analyze-style`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "分析に失敗しました");
      }
      const { data } = await res.json();

      // 分析結果から指示文を自動生成
      const generated = [
        data.writing_style?.tone ? `文体: ${data.writing_style.tone}` : "",
        data.writing_style?.emoji_usage
          ? `絵文字: ${data.writing_style.emoji_usage}`
          : "",
        data.writing_style?.hook_patterns?.length > 0
          ? `フックパターン: ${data.writing_style.hook_patterns.join("、")}`
          : "",
        data.hashtag_strategy?.usage_pattern
          ? `ハッシュタグ: ${data.hashtag_strategy.usage_pattern}`
          : "",
        data.summary ? `特徴: ${data.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setInstructions(generated);
      toast.success("分析結果から指示文を生成しました");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "分析に失敗しました"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">✍️ ライティングスタイル設定</CardTitle>
        <CardDescription>
          AI投稿生成時に適用されるカスタム指示を設定します。
          文体・トーン・表現の好みなどを自由に記述してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={`例:\n・です・ます調で書く\n・絵文字は1-2個まで\n・質問形式の冒頭で読者を引き込む\n・具体的な数字を入れる\n・ハッシュタグは3個以内`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="min-h-[160px]"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
          </Button>

          <Button
            variant="outline"
            onClick={handleAutoGenerate}
            disabled={isAnalyzing || !accountId}
          >
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {isAnalyzing ? "分析中..." : "投稿から自動生成"}
          </Button>
        </div>

        {!accountId && (
          <p className="text-xs text-muted-foreground">
            ※ 自動生成には接続済みのSNSアカウントが必要です
          </p>
        )}
      </CardContent>
    </Card>
  );
}
