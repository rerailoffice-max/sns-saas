/**
 * OAuthコールバックページ
 * リダイレクト処理中のローディング表示
 */
export default function CallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-muted-foreground">認証処理中...</p>
      </div>
    </div>
  );
}
