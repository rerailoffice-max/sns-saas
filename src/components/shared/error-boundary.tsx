"use client";

/**
 * エラーバウンダリコンポーネント
 * ページ単位のエラーハンドリング
 */
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold">エラーが発生しました</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          {error.message || "予期しないエラーが発生しました。もう一度お試しください。"}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        再試行
      </Button>
    </div>
  );
}
