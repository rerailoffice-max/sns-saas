"use client";

/**
 * カテゴリ別チャート
 * ai_category 別のエンゲージメント比較を棒グラフ＋円グラフで表示
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  type PieLabelRenderProps,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** カテゴリ別集計データ型 */
export interface CategoryData {
  /** カテゴリ名 */
  category: string;
  /** 投稿数 */
  count: number;
  /** エンゲージメント合計（いいね+リプライ+リポスト） */
  totalEngagement: number;
  /** 平均エンゲージメント */
  avgEngagement: number;
}

interface CategoryChartProps {
  data: CategoryData[];
}

/** チャートカラーパレット */
const COLORS = [
  "#f97316", // オレンジ
  "#3b82f6", // ブルー
  "#10b981", // グリーン
  "#8b5cf6", // パープル
  "#ec4899", // ピンク
  "#eab308", // イエロー
  "#06b6d4", // シアン
  "#f43f5e", // ローズ
];

export function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        カテゴリデータがありません
      </div>
    );
  }

  return (
    <Tabs defaultValue="bar" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="bar">棒グラフ</TabsTrigger>
        <TabsTrigger value="pie">円グラフ</TabsTrigger>
      </TabsList>

      <TabsContent value="bar">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
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
                dataKey="avgEngagement"
                fill="#f97316"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>

      <TabsContent value="pie">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="totalEngagement"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(props: PieLabelRenderProps) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const category = String((props as any).category ?? "");
                  const percent = Number(props.percent ?? 0);
                  return `${category} (${(percent * 100).toFixed(0)}%)`;
                }}
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
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
                  "合計エンゲージメント",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>
    </Tabs>
  );
}
