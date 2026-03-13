"use client";

/**
 * フォロワー推移チャート
 * Rechartsを使用したフォロワー数の折れ線グラフ
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

interface FollowersChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
}

function fillDateGaps(data: Array<{ date: string; count: number }>): Array<{ date: string; count: number }> {
  if (data.length <= 1) return data;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const result: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1) {
      const curr = new Date(sorted[i].date);
      const next = new Date(sorted[i + 1].date);
      const diffDays = Math.round((next.getTime() - curr.getTime()) / (86400000));
      if (diffDays > 1) {
        for (let d = 1; d < diffDays; d++) {
          const fill = new Date(curr);
          fill.setDate(fill.getDate() + d);
          const m = fill.getMonth() + 1;
          const day = fill.getDate();
          result.push({ date: `${m}/${day}`, count: sorted[i].count });
        }
      }
    }
  }
  return result;
}

export function FollowersChart({ data }: FollowersChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        フォロワーデータがありません。同期すると表示されます。
      </div>
    );
  }

  const filledData = fillDateGaps(data);
  const showDots = filledData.length <= 14;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={filledData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          interval={filledData.length > 14 ? Math.floor(filledData.length / 7) : 0}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={50}
          domain={["dataMin - 5", "dataMax + 5"]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(label) => `${label}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [typeof value === "number" ? value.toLocaleString() : String(value ?? ""), "フォロワー"]}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={showDots ? { r: 3, fill: "hsl(var(--primary))" } : false}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
