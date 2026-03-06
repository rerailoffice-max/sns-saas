"use client";

/**
 * 期間フィルターボタン
 * 7日 / 30日 / 90日 の切り替え
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const periods = [
  { label: "7日", value: "7" },
  { label: "30日", value: "30" },
  { label: "90日", value: "90" },
];

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPeriod = searchParams.get("period") ?? "30";

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex gap-1">
      {periods.map((p) => (
        <Button
          key={p.value}
          variant={currentPeriod === p.value ? "default" : "outline"}
          size="sm"
          onClick={() => handlePeriodChange(p.value)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
