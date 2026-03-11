/**
 * Threads API アダプター
 * Threads API v1.0 に対応した SNSAdapter の実装
 *
 * 参照: https://developers.facebook.com/docs/threads
 */

import type {
  SNSAdapter,
  OAuthTokens,
  SNSProfile,
  PublicProfile,
  PostContent,
  PostResult,
  PostInsights,
  PaginationOptions,
  ThreadList,
} from "./types";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const THREADS_OAUTH_BASE = "https://graph.threads.net/oauth";

export class ThreadsAdapter implements SNSAdapter {
  readonly platform = "threads" as const;

  /**
   * OAuth認証コードからアクセストークンを取得
   */
  async authenticate(code: string): Promise<OAuthTokens> {
    // 短期トークンを取得
    const shortLivedRes = await fetch(`${THREADS_OAUTH_BASE}/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID!,
        client_secret: process.env.THREADS_APP_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: process.env.THREADS_REDIRECT_URI!,
        code,
      }),
    });

    if (!shortLivedRes.ok) {
      const error = await shortLivedRes.json();
      throw new Error(
        `Threads OAuth error: ${error.error_message || JSON.stringify(error)}`
      );
    }

    const shortLivedData = await shortLivedRes.json();

    // 長期トークンに交換
    const longLivedRes = await fetch(
      `${THREADS_API_BASE}/access_token?` +
        new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: process.env.THREADS_APP_SECRET!,
          access_token: shortLivedData.access_token,
        }),
      { method: "GET" }
    );

    if (!longLivedRes.ok) {
      throw new Error("長期トークンの取得に失敗しました");
    }

    const longLivedData = await longLivedRes.json();

    return {
      access_token: longLivedData.access_token,
      expires_in: longLivedData.expires_in,
      token_type: "bearer",
      user_id: shortLivedData.user_id,
    };
  }

  /**
   * 長期トークンをリフレッシュ
   */
  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const res = await fetch(
      `${THREADS_API_BASE}/refresh_access_token?` +
        new URLSearchParams({
          grant_type: "th_refresh_token",
          access_token: currentToken,
        }),
      { method: "GET" }
    );

    if (!res.ok) {
      throw new Error("トークンのリフレッシュに失敗しました");
    }

    const data = await res.json();

    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: "bearer",
      user_id: "", // リフレッシュ時にはuser_idは返されない
    };
  }

  /**
   * 認証ユーザーのプロフィールを取得
   */
  async getProfile(accessToken: string): Promise<SNSProfile> {
    const res = await fetch(
      `${THREADS_API_BASE}/me?` +
        new URLSearchParams({
          fields:
            "id,username,name,threads_profile_picture_url,threads_biography",
          access_token: accessToken,
        })
    );

    if (!res.ok) {
      throw new Error("プロフィールの取得に失敗しました");
    }

    const data = await res.json();

    // フォロワー数を別途取得
    const followerCount = await this.getFollowerCount(accessToken);

    return {
      platform: "threads",
      platform_user_id: data.id,
      username: data.username,
      display_name: data.name || data.username,
      avatar_url: data.threads_profile_picture_url || null,
      bio: data.threads_biography || null,
      follower_count: followerCount,
      following_count: 0, // Threads APIでは取得不可
      is_verified: false, // Threads APIでは取得不可
    };
  }

  /**
   * 投稿を作成（2段階: コンテナ作成 → 公開）
   */
  async createPost(
    accessToken: string,
    content: PostContent
  ): Promise<PostResult> {
    // Step 1: メディアコンテナを作成
    const containerParams: Record<string, string> = {
      text: content.text,
      media_type: "TEXT",
      access_token: accessToken,
    };

    if (content.media_urls && content.media_urls.length === 1) {
      const url = content.media_urls[0];
      const isVideo =
        content.media_type === "video" ||
        /\.(mp4|mov|webm)(\?|$)/i.test(url) ||
        url.includes("/video");

      if (isVideo) {
        containerParams.media_type = "VIDEO";
        containerParams.video_url = url;
      } else {
        containerParams.media_type = "IMAGE";
        containerParams.image_url = url;
      }
    } else if (content.media_urls && content.media_urls.length > 1) {
      containerParams.media_type = "CAROUSEL";
      // TODO: カルーセル用の個別コンテナ作成ロジック
    }

    if (content.reply_to) {
      containerParams.reply_to_id = content.reply_to;
    }

    const containerRes = await fetch(
      `${THREADS_API_BASE}/me/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(containerParams),
      }
    );

    if (!containerRes.ok) {
      const error = await containerRes.json();
      throw new Error(
        `投稿コンテナの作成に失敗: ${error.error?.message || JSON.stringify(error)}`
      );
    }

    const containerData = await containerRes.json();

    // Step 2: コンテナがFINISHEDになるまでポーリング
    // 動画は処理に時間がかかるため、最大2分待機
    const containerId = containerData.id;
    const isVideoPost = containerParams.media_type === "VIDEO";
    const maxAttempts = isVideoPost ? 40 : 15;
    const pollInterval = isVideoPost ? 3000 : 2000;

    for (let i = 0; i < maxAttempts; i++) {
      const statusRes = await fetch(
        `${THREADS_API_BASE}/${containerId}?fields=status,error_message&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status === "FINISHED") break;
        if (statusData.status === "ERROR") {
          throw new Error(
            `コンテナ処理エラー: ${statusData.error_message ?? "不明"}`
          );
        }
      }
      if (i === maxAttempts - 1) {
        const timeoutSec = Math.round((maxAttempts * pollInterval) / 1000);
        throw new Error(`コンテナの準備がタイムアウトしました（${timeoutSec}秒）`);
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // Step 3: コンテナを公開
    const publishRes = await fetch(
      `${THREADS_API_BASE}/me/threads_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerData.id,
          access_token: accessToken,
        }),
      }
    );

    if (!publishRes.ok) {
      const error = await publishRes.json();
      throw new Error(
        `投稿の公開に失敗: ${error.error?.message || JSON.stringify(error)}`
      );
    }

    const publishData = await publishRes.json();

    return {
      platform_post_id: publishData.id,
      post_url: `https://www.threads.net/@me/post/${publishData.id}`,
      published_at: new Date().toISOString(),
    };
  }

  /**
   * 投稿を削除
   */
  async deletePost(accessToken: string, postId: string): Promise<void> {
    const res = await fetch(
      `${THREADS_API_BASE}/${postId}?access_token=${accessToken}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      throw new Error("投稿の削除に失敗しました");
    }
  }

  /**
   * 投稿のインサイト（エンゲージメント）を取得
   */
  async getPostInsights(
    accessToken: string,
    postId: string
  ): Promise<PostInsights> {
    const res = await fetch(
      `${THREADS_API_BASE}/${postId}/insights?` +
        new URLSearchParams({
          metric: "likes,replies,reposts,quotes,views",
          access_token: accessToken,
        })
    );

    if (!res.ok) {
      throw new Error("インサイトの取得に失敗しました");
    }

    const data = await res.json();

    // メトリクスデータをパース
    const metrics: Record<string, number> = {};
    for (const item of data.data || []) {
      metrics[item.name] = item.values?.[0]?.value ?? 0;
    }

    return {
      platform_post_id: postId,
      likes: metrics.likes ?? 0,
      replies: metrics.replies ?? 0,
      reposts: metrics.reposts ?? 0,
      quotes: metrics.quotes ?? 0,
      impressions: metrics.views,
      posted_at: new Date().toISOString(), // 別途取得が必要
    };
  }

  /**
   * フォロワー数を取得
   */
  async getFollowerCount(accessToken: string): Promise<number> {
    const res = await fetch(
      `${THREADS_API_BASE}/me/threads_insights?` +
        new URLSearchParams({
          metric: "followers_count",
          access_token: accessToken,
        })
    );

    if (!res.ok) {
      return 0;
    }

    const data = await res.json();
    return data.data?.[0]?.total_value?.value ?? 0;
  }

  /**
   * 認証ユーザーの投稿一覧を取得
   */
  async getUserThreads(
    accessToken: string,
    options?: PaginationOptions
  ): Promise<ThreadList> {
    const params = new URLSearchParams({
      fields: "id,text,media_type,media_url,timestamp,permalink",
      access_token: accessToken,
    });

    if (options?.limit) {
      params.set("limit", String(options.limit));
    }
    if (options?.cursor) {
      params.set("after", options.cursor);
    }

    const res = await fetch(
      `${THREADS_API_BASE}/me/threads?${params}`
    );

    if (!res.ok) {
      throw new Error("投稿一覧の取得に失敗しました");
    }

    return await res.json();
  }

  /**
   * 他ユーザーの公開プロフィールを取得（モデリング用）
   * ※ Advanced Access権限が必要
   */
  async getPublicProfile(userId: string, accessToken: string): Promise<PublicProfile> {
    const res = await fetch(
      `${THREADS_API_BASE}/${userId}?` +
        new URLSearchParams({
          fields: "id,username,name,threads_profile_picture_url",
          access_token: accessToken,
        })
    );

    if (!res.ok) {
      throw new Error("公開プロフィールの取得に失敗しました");
    }

    const data = await res.json();

    return {
      platform: "threads",
      platform_user_id: data.id,
      username: data.username,
      display_name: data.name || data.username,
      avatar_url: data.threads_profile_picture_url || null,
      bio: null, // 公開APIでは取得できない場合がある
      is_verified: false,
    };
  }

  /**
   * 他ユーザーの公開投稿一覧を取得（モデリング用）
   * ※ Advanced Access権限が必要
   */
  async getPublicThreads(
    userId: string,
    accessToken: string,
    options?: PaginationOptions
  ): Promise<ThreadList> {
    const params = new URLSearchParams({
      fields: "id,text,media_type,media_url,timestamp,permalink",
      access_token: accessToken,
    });

    if (options?.limit) {
      params.set("limit", String(options.limit));
    }
    if (options?.cursor) {
      params.set("after", options.cursor);
    }

    const res = await fetch(
      `${THREADS_API_BASE}/${userId}/threads?${params}`
    );

    if (!res.ok) {
      throw new Error("公開投稿一覧の取得に失敗しました");
    }

    return await res.json();
  }
}
