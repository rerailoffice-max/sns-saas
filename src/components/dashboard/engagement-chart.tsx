"use client";

/**
 * エンゲージメントチャート
 * いいね・リプライ・リポストの棒グラフ
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

interface EngagementChartProps {
  data: Array<{
    date: string;
    likes: number;
    replies: number;
    reposts: number;
  }>;
}

export function EngagementChart({ data }: EngagementChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        エンゲージメントデータがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px" }}
        />
        <Bar dataKey="likes" name="いいね" fill="#f97316" radius={[2, 2, 0, 0]} />
        <Bar dataKey="replies" name="リプライ" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        <Bar dataKey="reposts" name="リポスト" fill="#10b981" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
