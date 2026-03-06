"use client";

/**
 * 投稿頻度の推移チャート
 * 週単位での投稿数を折れ線グラフで表示
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface FrequencyData {
  /** 週ラベル（例: "3/1週"） */
  week: string;
  /** 投稿数 */
  count: number;
}

interface PostingFrequencyChartProps {
  data: FrequencyData[];
}

export function PostingFrequencyChart({ data }: PostingFrequencyChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        投稿頻度データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={40}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [
            typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
            "投稿数",
          ]}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
