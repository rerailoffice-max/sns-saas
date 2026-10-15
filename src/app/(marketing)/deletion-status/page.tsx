/**
 * データ削除の状況ページ
 * Threadsのデータ削除コールバック（/api/threads/delete-data）が返すURL。
 * 削除は受け取った時点で行うため、確認コードとあわせて完了を伝える
 */
import Link from "next/link";

const CONTACT_EMAIL = "info@re-rail.co.jp";

export default async function DeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const confirmationCode = code && /^[a-f0-9]{1,64}$/i.test(code) ? code : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">
        データ削除の状況 <span className="text-xl font-normal text-muted-foreground">/ Data deletion status</span>
      </h1>

      <div className="mt-8 space-y-4 text-sm leading-relaxed">
        {confirmationCode && (
          <p className="rounded-lg border p-4">
            確認コード / Confirmation code: <code className="font-mono">{confirmationCode}</code>
            <br />
            状態 / Status: 削除済み / Completed
          </p>
        )}

        <p>
          Threadsから届いたデータ削除のリクエストは、受け取った時点で処理しています。SNS Managerに保存していた、そのThreadsアカウントの連携情報（アクセストークン）と、下書き・予約投稿・インサイトを削除しました。
        </p>
        <p>
          We process data deletion requests from Threads as soon as we receive them. The connection (access token) of that Threads account and its drafts, scheduled posts and insights stored in SNS Manager have been deleted.
        </p>
        <p>
          ご不明な点は <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a> までご連絡ください。
          / If you have any questions, contact us at the same address.
        </p>
        <p>
          <Link href="/privacy#data-deletion" className="text-primary hover:underline">
            プライバシーポリシー（データの削除）/ Privacy Policy (Data deletion)
          </Link>
        </p>
      </div>
    </div>
  );
}
