"use client";

/**
 * スタイル比較コンポーネント
 * 自分 vs モデルアカウントのライティングスタイルを並列比較
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AnalysisResult, WritingProfile } from "@/types/database";

interface StyleComparisonProps {
  modelAnalysis: AnalysisResult;
  selfProfile: WritingProfile | null;
  modelUsername: string;
  accountId: string | null;
}

/** 比較行の共通コンポーネント */
function ComparisonRow({
  label,
  selfValue,
  modelValue,
}: {
  label: string;
  selfValue: string;
  modelValue: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 items-center py-3 border-b last:border-0">
      <div className="text-sm font-medium text-center">{selfValue || "-"}</div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded px-2 py-1">
        {label}
      </div>
      <div className="text-sm font-medium text-center">
        {modelValue || "-"}
      </div>
    </div>
  );
}

export function StyleComparison({
  modelAnalysis,
  selfProfile,
  modelUsername,
  accountId,
}: StyleComparisonProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // セルフ分析を実行
  const handleSelfAnalyze = async () => {
    if (!accountId) {
      toast.error("接続済みのアカウントが必要です");
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
      toast.success("スタイル分析が完了しました");
      window.location.reload();
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
        <CardTitle>📊 スタイル比較</CardTitle>
        <CardDescription>
          あなたの投稿スタイルと @{modelUsername} を比較分析
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* セルフ分析がない場合の案内 */}
        {!selfProfile && (
          <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg bg-muted/30">
            <Sparkles className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              比較するには、まず自分の投稿スタイルを分析してください
            </p>
            <Button
              onClick={handleSelfAnalyze}
              disabled={isAnalyzing || !accountId}
              size="sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  自分のスタイルを分析
                </>
              )}
            </Button>
          </div>
        )}

        {/* 比較テーブル */}
        {selfProfile && (
          <>
            {/* ヘッダー */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-center">
                <Badge variant="secondary">あなた</Badge>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                項目
              </div>
              <div className="text-center">
                <Badge>@{modelUsername}</Badge>
              </div>
            </div>

            {/* 文体比較 */}
            {modelAnalysis.writing_style && (
              <div>
                <h4 className="text-sm font-semibold mb-2">✍️ 文体</h4>
                <div className="rounded-lg border p-3">
                  <ComparisonRow
                    label="トーン"
                    selfValue={selfProfile.writing_style.tone}
                    modelValue={modelAnalysis.writing_style.tone}
                  />
                  <ComparisonRow
                    label="平均文字数"
                    selfValue={`${selfProfile.writing_style.avg_length}文字`}
                    modelValue={`${modelAnalysis.writing_style.avg_length}文字`}
                  />
                  <ComparisonRow
                    label="絵文字"
                    selfValue={selfProfile.writing_style.emoji_usage}
                    modelValue={modelAnalysis.writing_style.emoji_usage}
                  />
                </div>
              </div>
            )}

            {/* フックパターン比較 */}
            {modelAnalysis.writing_style && (
              <div>
                <h4 className="text-sm font-semibold mb-2">🎣 フックパターン</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-2">あなた</p>
                    <div className="flex flex-wrap gap-1">
                      {selfProfile.writing_style.hook_patterns.length > 0 ? (
                        selfProfile.writing_style.hook_patterns.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {p}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          データなし
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      @{modelUsername}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(modelAnalysis.writing_style.hook_patterns?.length ?? 0) > 0 ? (
                        modelAnalysis.writing_style.hook_patterns!.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {p}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          データなし
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ハッシュタグ比較 */}
            {modelAnalysis.hashtag_strategy && (
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  # ハッシュタグ戦略
                </h4>
                <div className="rounded-lg border p-3">
                  <ComparisonRow
                    label="平均使用数"
                    selfValue={`${selfProfile.hashtag_strategy.avg_count}個/投稿`}
                    modelValue={`${modelAnalysis.hashtag_strategy.avg_count}個/投稿`}
                  />
                  <ComparisonRow
                    label="使い方"
                    selfValue={selfProfile.hashtag_strategy.usage_pattern}
                    modelValue={modelAnalysis.hashtag_strategy.usage_pattern}
                  />
                </div>
              </div>
            )}

            {/* 投稿頻度比較 */}
            {modelAnalysis.posting_frequency && (
              <div>
                <h4 className="text-sm font-semibold mb-2">📅 投稿頻度</h4>
                <div className="rounded-lg border p-3">
                  <ComparisonRow
                    label="週あたり"
                    selfValue={`${selfProfile.posting_frequency.avg_per_week}回`}
                    modelValue={`${modelAnalysis.posting_frequency.avg_per_week}回`}
                  />
                  <ComparisonRow
                    label="ピーク曜日"
                    selfValue={
                      selfProfile.posting_frequency.peak_days.join(", ") ||
                      "データなし"
                    }
                    modelValue={
                      modelAnalysis.posting_frequency.peak_days?.join(", ") ||
                      "データなし"
                    }
                  />
                </div>
              </div>
            )}

            {/* モデリングのコツ */}
            {modelAnalysis.modeling_tips &&
              modelAnalysis.modeling_tips.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    💡 モデリングのコツ
                  </h4>
                  <div className="space-y-2">
                    {modelAnalysis.modeling_tips.map((tip, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg border p-3"
                      >
                        <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <p className="text-sm">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
