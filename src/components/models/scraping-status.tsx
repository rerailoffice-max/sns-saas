"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Play,
} from "lucide-react";
import { toast } from "sonner";

interface ScrapingJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  posts_found: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ScrapingStatusProps {
  modelId: string;
  postsCount: number;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: "待機中",
    variant: "outline" as const,
    color: "text-yellow-600",
  },
  running: {
    icon: Loader2,
    label: "スクレイピング中",
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  completed: {
    icon: CheckCircle,
    label: "完了",
    variant: "secondary" as const,
    color: "text-green-600",
  },
  failed: {
    icon: AlertCircle,
    label: "失敗",
    variant: "destructive" as const,
    color: "text-red-600",
  },
};

export function ScrapingStatus({ modelId, postsCount }: ScrapingStatusProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/${modelId}/scrape`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.data ?? []);
      }
    } catch {
      // サイレント
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // pending/running のジョブがあれば定期的にポーリング
  const latestJob = jobs[0] ?? null;
  const isActive =
    latestJob?.status === "pending" || latestJob?.status === "running";

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(async () => {
      await fetchJobs();
      // completed になったらページをリフレッシュ
      const res = await fetch(`/api/models/${modelId}/scrape`);
      if (res.ok) {
        const data = await res.json();
        const latest = data.data?.[0];
        if (latest?.status === "completed") {
          router.refresh();
        }
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [isActive, modelId, fetchJobs, router]);

  const startScraping = async () => {
    setIsStarting(true);
    try {
      const res = await fetch(`/api/models/${modelId}/scrape`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "ジョブの作成に失敗しました");
      }
      toast.success("スクレイピングを開始しました");
      await fetchJobs();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "エラーが発生しました"
      );
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中...
      </div>
    );
  }

  // ジョブなし＋投稿なし → スクレイピング実行ボタン
  if (!latestJob && postsCount === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={startScraping}
        disabled={isStarting}
      >
        {isStarting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            開始中...
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            スクレイピングを実行
          </>
        )}
      </Button>
    );
  }

  // ジョブなし＋投稿あり → 再実行ボタンのみ
  if (!latestJob) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={startScraping}
        disabled={isStarting}
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </Button>
    );
  }

  const config = STATUS_CONFIG[latestJob.status];
  const StatusIcon = config.icon;
  const isSpinning = latestJob.status === "running";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={config.variant}>
          <StatusIcon
            className={`mr-1 h-3 w-3 ${isSpinning ? "animate-spin" : ""} ${config.color}`}
          />
          {config.label}
        </Badge>

        {latestJob.status === "completed" && latestJob.posts_found != null && (
          <span className="text-sm text-muted-foreground">
            {latestJob.posts_found}件取得
          </span>
        )}

        {latestJob.started_at && !latestJob.completed_at && (
          <span className="text-xs text-muted-foreground">
            開始: {new Date(latestJob.started_at).toLocaleTimeString("ja-JP")}
          </span>
        )}

        {/* 完了/失敗時は再実行ボタン */}
        {(latestJob.status === "completed" || latestJob.status === "failed") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={startScraping}
            disabled={isStarting}
            className="h-7 px-2"
          >
            {isStarting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {latestJob.status === "failed" && latestJob.error_message && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {latestJob.error_message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
