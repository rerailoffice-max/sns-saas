"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, HelpCircle } from "lucide-react";

export function BuzzExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-dashed">
      <CardContent className="p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          <span className="flex items-center gap-2 text-sm">
            <HelpCircle className="h-4 w-4" />
            バズツールとは？ — 指標の見方
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
        {open && (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground px-1">
            <div>
              <p className="font-medium text-foreground mb-1">バズスコアの計算式</p>
              <p className="bg-muted/50 rounded-md px-3 py-2 font-mono text-xs">
                (いいね×1 + リプライ×2 + リポスト×3 + 引用×2.5) ÷ 表示数 × 1000
              </p>
              <p className="mt-1 text-xs">表示数に対するエンゲージメント効率を測定します。リプライやリポストは、いいねより高い重みがつきます。</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">ランク判定（パーセンタイル）</p>
              <div className="grid grid-cols-5 gap-1 text-xs text-center">
                <div className="bg-red-100 text-red-800 rounded p-1"><span className="font-bold">S</span><br />上位5%</div>
                <div className="bg-orange-100 text-orange-800 rounded p-1"><span className="font-bold">A</span><br />上位20%</div>
                <div className="bg-yellow-100 text-yellow-800 rounded p-1"><span className="font-bold">B</span><br />上位50%</div>
                <div className="bg-gray-100 text-gray-800 rounded p-1"><span className="font-bold">C</span><br />50-80%</div>
                <div className="bg-gray-50 text-gray-500 rounded p-1"><span className="font-bold">D</span><br />下位20%</div>
              </div>
              <p className="mt-1 text-xs">あなたの全投稿内での相対評価です。投稿が増えるほど精度が上がります。</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">バズツール vs 分析ページ</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border rounded-md p-2">
                  <p className="font-medium text-foreground">バズツール</p>
                  <p>「バズる投稿の型」を発見する。相対評価で伸びるパターンを特定。</p>
                </div>
                <div className="border rounded-md p-2">
                  <p className="font-medium text-foreground">分析</p>
                  <p>過去投稿の実績を俯瞰する。絶対値での推移とカテゴリ比較。</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
