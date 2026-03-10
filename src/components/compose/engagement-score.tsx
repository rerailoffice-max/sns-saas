"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Target, ChevronDown, Lightbulb, FlaskConical } from "lucide-react";
import {
  predictEngagement,
  generateABTestSuggestions,
  type PredictionResult,
} from "@/lib/engagement-predictor";

interface EngagementScoreProps {
  text: string;
  threadPosts?: string[];
  hasMedia?: boolean;
  platform?: "threads" | "x";
}

const GRADE_COLORS: Record<string, string> = {
  S: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30",
  A: "text-green-500 bg-green-500/10 border-green-500/30",
  B: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  C: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  D: "text-red-500 bg-red-500/10 border-red-500/30",
};

export function EngagementScore({
  text,
  threadPosts,
  hasMedia = false,
  platform = "threads",
}: EngagementScoreProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [abOpen, setAbOpen] = useState(false);

  const prediction = useMemo(
    () =>
      predictEngagement(text, { platform, threadPosts, hasMedia }),
    [text, platform, threadPosts, hasMedia]
  );

  const abSuggestions = useMemo(
    () => generateABTestSuggestions(text, platform),
    [text, platform]
  );

  if (!text.trim() && (!threadPosts || threadPosts.length === 0)) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4" />
          エンゲージメント予測
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* スコア表示 */}
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center justify-center w-14 h-14 rounded-full border-2 text-lg font-bold ${GRADE_COLORS[prediction.grade]}`}
          >
            {prediction.grade}
          </div>
          <div>
            <p className="text-2xl font-bold">{prediction.score}/100</p>
            <p className="text-xs text-muted-foreground">
              {prediction.score >= 70
                ? "高パフォーマンスが期待できます"
                : prediction.score >= 50
                  ? "平均的な結果が予想されます"
                  : "改善の余地があります"}
            </p>
          </div>
        </div>

        {/* 改善提案 */}
        {prediction.suggestions.length > 0 && (
          <div className="space-y-1.5">
            {prediction.suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs rounded-md bg-muted/50 p-2"
              >
                <Lightbulb className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* 詳細 */}
        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
              スコア内訳
              <ChevronDown
                className={`h-3 w-3 transition-transform ${detailOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              {prediction.factors.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{f.detail}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {f.score}/{f.maxScore}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* A/Bテスト提案 */}
        <Collapsible open={abOpen} onOpenChange={setAbOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
              <span className="flex items-center gap-1">
                <FlaskConical className="h-3 w-3" />
                A/Bテスト提案
              </span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${abOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 pt-2">
              {abSuggestions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs rounded-md border p-2"
                >
                  <FlaskConical className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
