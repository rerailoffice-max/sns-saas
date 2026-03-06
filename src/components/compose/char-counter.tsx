/**
 * 文字数カウンター
 */

interface CharCounterProps {
  current: number;
  max: number;
}

export function CharCounter({ current, max }: CharCounterProps) {
  const remaining = max - current;
  const percentage = (current / max) * 100;

  return (
    <div className="flex items-center gap-2">
      {/* SVG円形プログレス */}
      <svg className="h-5 w-5" viewBox="0 0 20 20">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/30"
        />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${Math.PI * 16}`}
          strokeDashoffset={`${Math.PI * 16 * (1 - Math.min(percentage, 100) / 100)}`}
          strokeLinecap="round"
          className={
            remaining < 0
              ? "text-destructive"
              : remaining < 50
              ? "text-yellow-500"
              : "text-primary"
          }
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span
        className={`text-xs tabular-nums ${
          remaining < 0
            ? "text-destructive font-medium"
            : remaining < 50
            ? "text-yellow-500"
            : "text-muted-foreground"
        }`}
      >
        {remaining}
      </span>
    </div>
  );
}
