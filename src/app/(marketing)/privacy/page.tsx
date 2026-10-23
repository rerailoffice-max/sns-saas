/**
 * プライバシーポリシーページ
 * Metaのアプリレビューでも読まれるため、日本語のあとに英語版を載せる
 */
import Link from "next/link";

const CONTACT_EMAIL = "info@re-rail.co.jp";
const COMPANY_URL = "https://re-rail.co.jp/company/";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">
        プライバシーポリシー <span className="text-xl font-normal text-muted-foreground">/ Privacy Policy</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        制定日: 2026年10月15日 / Effective date: October 15, 2026 ・{" "}
        <a href="#english" className="text-primary hover:underline">English version below</a>
      </p>

      <div className="mt-8 prose prose-neutral dark:prose-invert">
        <p>
          株式会社Re-rail（以下「当社」）は、SNS管理ツール「SNS Manager」（以下「本サービス」）で取り扱う個人情報を、次のとおり取り扱います。
        </p>

        <h2>1. 取得する情報</h2>
        <ol>
          <li>アカウントの情報: メールアドレス、パスワード（ログインの仕組みで管理し、当社は平文で保持しません）、表示名</li>
          <li>
            連携したSNSアカウントの情報: Threads・Instagram・X などで本サービスと連携したアカウントのID、ユーザー名、表示名、プロフィール画像、アクセストークン（暗号化して保存します）
          </li>
          <li>
            投稿と反応の情報: 本サービスで作成した下書き・予約投稿、連携したアカウントの投稿の本文と、閲覧・いいね・返信・再投稿などの数、フォロワー数の推移
          </li>
          <li>
            公開情報の調査:
            <ul>
              <li>リサーチ画面で検索した公開投稿と公開プロフィールの情報は、画面に表示するだけで保存しません</li>
              <li>モデリング機能でユーザーが登録した公開アカウントについては、その公開投稿と分析の結果を保存します</li>
            </ul>
          </li>
          <li>お支払いの情報: 有料プランの決済は Stripe が処理します。カード番号は当社では保持しません</li>
          <li>利用の記録: アクセスとエラーの記録</li>
        </ol>

        <h2>2. 利用の目的</h2>
        <ul>
          <li>投稿の作成・予約・公開、反応の分析など、本サービスの機能を提供するため</li>
          <li>本サービスの改善と、不正な利用の防止のため</li>
          <li>お問い合わせに回答するため</li>
        </ul>

        <h2>3. 外部サービスの利用</h2>
        <p>本サービスは、機能を提供するために次の外部サービスを使います。</p>
        <ul>
          <li>Supabase（データベース・ログイン）</li>
          <li>Vercel（サーバー）</li>
          <li>Anthropic・Google（AIによる下書き・分析の作成。指示の内容と、必要な投稿の本文を送ります）</li>
          <li>Stripe（決済）</li>
          <li>Meta（Threads・Instagram）・X（各SNSのAPIを通じた投稿と情報の取得）</li>
          <li>ユーザーが設定した通知先（Discord など）</li>
        </ul>

        <h2>4. 第三者への提供</h2>
        <p>
          法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。Metaのプラットフォームから取得したデータを販売したり、広告の目的で第三者に渡したりしません。
        </p>

        <h2>5. 保存の期間</h2>
        <ul>
          <li>連携したSNSアカウントの情報と、投稿・反応の情報は、6章の方法で削除されるまで保存します</li>
          <li>リサーチ画面の結果は保存しません</li>
        </ul>

        <h2 id="data-deletion">6. データの削除</h2>
        <p>次のいずれかの方法で削除できます。</p>
        <ol>
          <li>
            Threadsの設定の「ウェブサイトのアクセス許可」で本サービスを削除し、データの削除をリクエストする。リクエストを受け取ると、そのThreadsアカウントの連携情報と、下書き・予約投稿・インサイトを自動で削除します。削除の状況は
            <Link href="/deletion-status">データ削除の状況のページ</Link>で確認できます
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> にメールで依頼する
          </li>
        </ol>

        <h2>7. 安全のための措置</h2>
        <p>
          アクセストークンは AES-256-GCM で暗号化して保存し、データベースはユーザーごとに読み書きできる範囲を分けています。
        </p>

        <h2>8. 開示・訂正・利用停止などの請求</h2>
        <p>
          ご本人からの請求には、個人情報の保護に関する法律に従って対応します。
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> までご連絡ください。
        </p>

        <h2>9. 改定</h2>
        <p>内容を変えるときは、このページでお知らせします。</p>

        <h2>10. 事業者・お問い合わせ</h2>
        <p>
          株式会社Re-rail（所在地・代表者は<a href={COMPANY_URL}>会社概要</a>をご覧ください）
          <br />
          メール: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <hr />

        <h2 id="english">Privacy Policy (English)</h2>
        <p>
          Re-rail Inc. (&quot;we&quot;) operates SNS Manager (&quot;the Service&quot;), a social media management tool. This policy explains how we handle personal information in the Service.
        </p>

        <h3>1. Information we collect</h3>
        <ol>
          <li>Account information: email address, password (managed by our authentication provider; we never store it in plain text) and display name.</li>
          <li>
            Connected social media accounts: the ID, username, display name, profile picture and access token (stored encrypted) of the Threads, Instagram or X accounts you connect.
          </li>
          <li>
            Posts and engagement: drafts and scheduled posts you create in the Service, the text of posts on your connected accounts, their views, likes, replies and reposts, and your follower count history.
          </li>
          <li>
            Research on public information:
            <ul>
              <li>Public posts and public profiles you search on the Research page are only displayed and are not stored.</li>
              <li>For public accounts you add to the Modeling feature, we store their public posts and our analysis of them.</li>
            </ul>
          </li>
          <li>Payment information: payments for paid plans are processed by Stripe. We do not store card numbers.</li>
          <li>Usage records: access and error logs.</li>
        </ol>

        <h3>2. How we use information</h3>
        <ul>
          <li>To provide the Service, such as creating, scheduling and publishing posts and analyzing engagement.</li>
          <li>To improve the Service and prevent misuse.</li>
          <li>To answer your inquiries.</li>
        </ul>

        <h3>3. Service providers</h3>
        <p>
          We use Supabase (database and login), Vercel (hosting), Anthropic and Google (AI drafting and analysis; we send your instructions and the necessary post text), Stripe (payments), Meta (Threads and Instagram) and X (publishing and data retrieval through their APIs), and notification destinations you set up (such as Discord).
        </p>

        <h3>4. Sharing</h3>
        <p>
          We do not provide personal information to third parties without your consent, except as required by law. We do not sell data obtained from Meta&apos;s platforms or share it with third parties for advertising.
        </p>

        <h3>5. Retention</h3>
        <p>
          We keep information about your connected accounts, posts and engagement until it is deleted by one of the methods in section 6. Research page results are not stored.
        </p>

        <h3 id="data-deletion-en">6. Data deletion</h3>
        <ol>
          <li>
            In Threads settings, open &quot;Website permissions&quot;, remove the Service and request data deletion. When we receive the request, we automatically delete the connection and the drafts, scheduled posts and insights of that Threads account. You can check the status on the{" "}
            <Link href="/deletion-status">data deletion status page</Link>.
          </li>
          <li>
            Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ol>

        <h3>7. Security</h3>
        <p>
          Access tokens are encrypted with AES-256-GCM, and database access is separated per user.
        </p>

        <h3>8. Your rights</h3>
        <p>
          We respond to requests for disclosure, correction or suspension of use in accordance with Japan&apos;s Act on the Protection of Personal Information. Contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h3>9. Changes</h3>
        <p>We will announce changes to this policy on this page.</p>

        <h3>10. Contact</h3>
        <p>
          Re-rail Inc. (address and representative: see our <a href={COMPANY_URL}>company page</a>)
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
