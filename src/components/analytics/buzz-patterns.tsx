"use client";

/**
 * バズパターン分析表示コンポーネント
 * バズった投稿の共通点をカード形式で表示
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Hash,
  Clock,
  Image,
  HelpCircle,
  ListOrdered,
  Zap,
} from "lucide-react";
import type { BuzzPattern } from "@/lib/buzz-patterns";

interface BuzzPatternsProps {
  pattern: BuzzPattern;
}

export function BuzzPatterns({ pattern }: BuzzPatternsProps) {
  if (pattern.totalAnalyzed === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        バズパターン分析にはデータが必要です。投稿が増えると分析結果が表示されます。
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 平均文字数 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <FileText className="h-4 w-4 text-blue-500" />
            平均文字数
          </div>
          <p className="text-2xl font-bold">{pattern.avgTextLength}</p>
          <p className="text-xs text-muted-foreground mt-1">
            バズ投稿の平均的な長さ
          </p>
        </CardContent>
      </Card>

      {/* ハッシュタグ数 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Hash className="h-4 w-4 text-green-500" />
            平均ハッシュタグ数
          </div>
          <p className="text-2xl font-bold">{pattern.avgHashtagCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            バズ投稿の平均タグ数
          </p>
        </CardContent>
      </Card>

      {/* 問いかけ率 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <HelpCircle className="h-4 w-4 text-purple-500" />
            問いかけ率
          </div>
          <p className="text-2xl font-bold">{pattern.questionRatio}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            ？を含むバズ投稿の割合
          </p>
        </CardContent>
      </Card>

      {/* 数字含有率 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <ListOrdered className="h-4 w-4 text-orange-500" />
            数字含有率
          </div>
          <p className="text-2xl font-bold">{pattern.numberRatio}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            数字を含むバズ投稿の割合
          </p>
        </CardContent>
      </Card>

      {/* メディア比率 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Image className="h-4 w-4 text-pink-500" />
            メディア付き率
          </div>
          <p className="text-2xl font-bold">{pattern.mediaRatio}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            画像・動画付きの割合
          </p>
        </CardContent>
      </Card>

      {/* 分析数 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            分析対象
          </div>
          <p className="text-2xl font-bold">{pattern.totalAnalyzed}件</p>
          <p className="text-xs text-muted-foreground mt-1">
            上位バズ投稿の分析数
          </p>
        </CardContent>
      </Card>

      {/* フックパターン（ワイド） */}
      {pattern.topHookPatterns.length > 0 && (
        <Card className="sm:col-span-2 lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              よく使われるフックパターン
            </CardTitle>
            <CardDescription>
              バズ投稿で多く見られる冒頭パターン
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pattern.topHookPatterns.map((hook) => (
                <Badge
                  key={hook.pattern}
                  variant="secondary"
                  className="text-sm"
                >
                  {hook.pattern}
                  <span className="ml-1.5 text-xs opacity-60">
                    ×{hook.count}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ベスト投稿時間帯（ワイド） */}
      {pattern.bestTimeSlots.length > 0 && (
        <Card className="sm:col-span-2 lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              バズりやすい時間帯
            </CardTitle>
            <CardDescription>
              バズ投稿が集中している曜日×時間帯
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pattern.bestTimeSlots.map((slot, i) => (
                <Badge
                  key={i}
                  variant={i === 0 ? "default" : "secondary"}
                  className="text-sm"
                >
                  {slot.dayName}曜 {slot.hour}時
                  <span className="ml-1.5 text-xs opacity-60">
                    ×{slot.count}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
