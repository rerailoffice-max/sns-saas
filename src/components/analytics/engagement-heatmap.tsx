"use client";

/**
 * エンゲージメントヒートマップ
 * 曜日×時間帯（0-23時）のグリッドでエンゲージメント量を色の濃さで表現
 */

/** ヒートマップの各セルデータ */
export interface HeatmapCell {
  /** 曜日インデックス（0=月曜, 6=日曜） */
  dayIndex: number;
  /** 時間帯（0-23） */
  hour: number;
  /** エンゲージメント合計 */
  value: number;
}

interface EngagementHeatmapProps {
  data: HeatmapCell[];
}

/** 曜日ラベル（月〜日） */
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/** 時間帯ラベル（0-23時、表示は偶数のみ） */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * 値を0-1に正規化し、対応する背景色クラスを返す
 * bg-muted（データなし）〜 bg-primary/10〜bg-primary/90
 */
function getIntensityClass(value: number, maxValue: number): string {
  if (value === 0) return "bg-muted";
  if (maxValue === 0) return "bg-muted";

  const ratio = value / maxValue;
  if (ratio <= 0.1) return "bg-primary/10";
  if (ratio <= 0.2) return "bg-primary/20";
  if (ratio <= 0.3) return "bg-primary/30";
  if (ratio <= 0.4) return "bg-primary/40";
  if (ratio <= 0.5) return "bg-primary/50";
  if (ratio <= 0.6) return "bg-primary/60";
  if (ratio <= 0.7) return "bg-primary/70";
  if (ratio <= 0.8) return "bg-primary/80";
  return "bg-primary/90";
}

export function EngagementHeatmap({ data }: EngagementHeatmapProps) {
  // 曜日×時間帯のマップを構築
  const cellMap = new Map<string, number>();
  data.forEach((cell) => {
    const key = `${cell.dayIndex}-${cell.hour}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + cell.value);
  });

  // 最大値を取得（色の濃さの基準）
  const maxValue = Math.max(...Array.from(cellMap.values()), 0);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        ヒートマップデータがありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <div className="min-w-[600px] md:min-w-0">
        {/* 時間帯ヘッダー */}
        <div className="flex items-center gap-0.5 mb-1">
          {/* 曜日列の幅分の空白 */}
          <div className="w-8 shrink-0" />
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="flex-1 text-center text-[10px] text-muted-foreground"
            >
              {hour % 2 === 0 ? `${hour}` : ""}
            </div>
          ))}
        </div>

        {/* 各曜日の行 */}
        {DAY_LABELS.map((dayLabel, dayIndex) => (
          <div key={dayIndex} className="flex items-center gap-0.5 mb-0.5">
            {/* 曜日ラベル */}
            <div className="w-8 shrink-0 text-xs text-muted-foreground text-right pr-1">
              {dayLabel}
            </div>
            {/* 時間帯セル */}
            {HOURS.map((hour) => {
              const key = `${dayIndex}-${hour}`;
              const value = cellMap.get(key) ?? 0;
              const intensityClass = getIntensityClass(value, maxValue);

              return (
                <div
                  key={hour}
                  className={`flex-1 aspect-square rounded-sm ${intensityClass} transition-colors`}
                  title={`${dayLabel}曜 ${hour}時: ${value}`}
                />
              );
            })}
          </div>
        ))}

        {/* 凡例 */}
        <div className="flex items-center justify-end gap-1 mt-3 text-[10px] text-muted-foreground">
          <span>少</span>
          <div className="w-3 h-3 rounded-sm bg-primary/10" />
          <div className="w-3 h-3 rounded-sm bg-primary/30" />
          <div className="w-3 h-3 rounded-sm bg-primary/50" />
          <div className="w-3 h-3 rounded-sm bg-primary/70" />
          <div className="w-3 h-3 rounded-sm bg-primary/90" />
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
