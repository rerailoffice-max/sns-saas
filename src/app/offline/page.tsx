"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="text-6xl">📡</div>
        <h1 className="text-2xl font-bold">オフラインです</h1>
        <p className="text-muted-foreground">
          インターネット接続を確認してください。
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}
