"use client";

/**
 * 文字数 vs エンゲージメント散布図
 * 投稿の文字数とエンゲージメントの関係を可視化
 */
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";

export interface ScatterData {
  /** 文字数 */
  textLength: number;
  /** エンゲージメント合計 */
  engagement: number;
  /** 投稿テキスト（ツールチップ用） */
  text: string;
}

interface TextLengthScatterProps {
  data: ScatterData[];
}

export function TextLengthScatter({ data }: TextLengthScatterProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        散布図データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="textLength"
          type="number"
          name="文字数"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          label={{
            value: "文字数",
            position: "insideBottomRight",
            offset: -5,
            fontSize: 11,
          }}
        />
        <YAxis
          dataKey="engagement"
          type="number"
          name="エンゲージメント"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={50}
          label={{
            value: "エンゲージメント",
            angle: -90,
            position: "insideLeft",
            fontSize: 11,
          }}
        />
        <ZAxis range={[40, 200]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const item = payload[0]?.payload as ScatterData | undefined;
            if (!item) return null;
            return (
              <div
                className="rounded-lg border bg-background p-2 text-xs shadow-md"
                style={{ maxWidth: 250 }}
              >
                <p className="font-medium mb-1 line-clamp-2">{item.text}</p>
                <p className="text-muted-foreground">
                  文字数: {item.textLength} / エンゲージメント: {item.engagement}
                </p>
              </div>
            );
          }}
        />
        <Scatter
          data={data}
          fill="#3b82f6"
          fillOpacity={0.6}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
