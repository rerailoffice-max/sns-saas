/**
 * Facebook Graph API アダプター
 *
 * Facebook Graph API v21.0 を使用。
 * OAuth認証後、ページ投稿とインサイト取得に対応。
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

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export class FacebookAdapter implements SNSAdapter {
  readonly platform = "facebook" as const;

  async authenticate(code: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID ?? "",
      client_secret: process.env.FACEBOOK_APP_SECRET ?? "",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/facebook`,
      code,
    });

    const res = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Facebook OAuth認証に失敗しました");
    }

    const data = await res.json();
    const profileRes = await fetch(
      `${GRAPH_API_BASE}/me?fields=id,name&access_token=${data.access_token}`
    );
    const profile = await profileRes.json();

    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: "bearer",
      user_id: profile.id,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.FACEBOOK_APP_ID ?? "",
      client_secret: process.env.FACEBOOK_APP_SECRET ?? "",
      fb_exchange_token: refreshToken,
    });

    const res = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`
    );

    if (!res.ok) {
      throw new Error("Facebook トークンリフレッシュに失敗しました");
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: "bearer",
      user_id: "",
    };
  }

  async getProfile(accessToken: string): Promise<SNSProfile> {
    const res = await fetch(
      `${GRAPH_API_BASE}/me?fields=id,name,picture.width(200),accounts{name,id,access_token,fan_count}&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error("Facebook プロフィール取得に失敗しました");
    }

    const data = await res.json();
    const page = data.accounts?.data?.[0];

    return {
      platform: "facebook",
      platform_user_id: page?.id ?? data.id,
      username: data.name,
      display_name: page?.name ?? data.name,
      avatar_url: data.picture?.data?.url ?? null,
      bio: null,
      follower_count: page?.fan_count ?? 0,
      following_count: 0,
      is_verified: false,
    };
  }

  async createPost(
    accessToken: string,
    content: PostContent
  ): Promise<PostResult> {
    const pageRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?access_token=${accessToken}`
    );
    const pageData = await pageRes.json();
    const page = pageData.data?.[0];

    if (!page) {
      throw new Error("Facebookページが見つかりません。ページを管理しているアカウントで接続してください。");
    }

    const pageAccessToken = page.access_token;
    const pageId = page.id;

    const postBody: Record<string, string> = { message: content.text };

    if (content.media_urls && content.media_urls.length > 0) {
      postBody.link = content.media_urls[0];
    }

    const res = await fetch(`${GRAPH_API_BASE}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...postBody,
        access_token: pageAccessToken,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Facebook投稿に失敗しました");
    }

    const result = await res.json();
    return {
      platform_post_id: result.id,
      post_url: `https://www.facebook.com/${result.id}`,
      published_at: new Date().toISOString(),
    };
  }

  async deletePost(accessToken: string, postId: string): Promise<void> {
    const res = await fetch(`${GRAPH_API_BASE}/${postId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (!res.ok) {
      throw new Error("Facebook投稿の削除に失敗しました");
    }
  }

  async getPostInsights(
    accessToken: string,
    postId: string
  ): Promise<PostInsights> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${postId}?fields=likes.summary(true),comments.summary(true),shares,created_time&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error("Facebook インサイト取得に失敗しました");
    }

    const data = await res.json();
    return {
      platform_post_id: postId,
      likes: data.likes?.summary?.total_count ?? 0,
      replies: data.comments?.summary?.total_count ?? 0,
      reposts: data.shares?.count ?? 0,
      quotes: 0,
      posted_at: data.created_time ?? new Date().toISOString(),
    };
  }

  async getFollowerCount(accessToken: string): Promise<number> {
    const pageRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=fan_count&access_token=${accessToken}`
    );
    const pageData = await pageRes.json();
    return pageData.data?.[0]?.fan_count ?? 0;
  }

  async getUserThreads(
    _accessToken: string,
    _options?: PaginationOptions
  ): Promise<ThreadList> {
    return { data: [] };
  }

  async getPublicProfile(
    _userId: string,
    _accessToken: string
  ): Promise<PublicProfile> {
    throw new Error("Facebook の公開プロフィール取得は未実装です");
  }

  async getPublicThreads(
    _userId: string,
    _accessToken: string,
    _options?: PaginationOptions
  ): Promise<ThreadList> {
    return { data: [] };
  }
}
