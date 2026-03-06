"use client";

/**
 * ハッシュタグ効果分析チャート
 * ハッシュタグ数別の平均エンゲージメント比較
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface HashtagData {
  /** ハッシュタグ数の範囲ラベル（例: "0個", "1-3個"） */
  range: string;
  /** 投稿数 */
  count: number;
  /** 平均エンゲージメント */
  avgEngagement: number;
}

interface HashtagAnalysisProps {
  data: HashtagData[];
}

export function HashtagAnalysis({ data }: HashtagAnalysisProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        ハッシュタグデータがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={50}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => {
            const label =
              name === "avgEngagement"
                ? "平均エンゲージメント"
                : name === "count"
                  ? "投稿数"
                  : String(name);
            return [
              typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
              label,
            ];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px" }}
          formatter={(value: string) => {
            if (value === "avgEngagement") return "平均エンゲージメント";
            if (value === "count") return "投稿数";
            return value;
          }}
        />
        <Bar
          yAxisId="left"
          dataKey="avgEngagement"
          fill="#f97316"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          yAxisId="right"
          dataKey="count"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
