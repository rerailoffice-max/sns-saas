/**
 * SNS API アダプター関連の型定義
 * プラットフォーム共通のインターフェースと型
 */

import { Platform } from "./database";

// ============================================================
// OAuth関連
// ============================================================

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  user_id: string;
}

// ============================================================
// プロフィール関連
// ============================================================

export interface SNSProfile {
  platform: Platform;
  platform_user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  following_count: number;
  is_verified: boolean;
}

export interface PublicProfile {
  platform: Platform;
  platform_user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
}

// ============================================================
// 投稿関連
// ============================================================

export interface PostContent {
  text: string;
  media_urls?: string[];
  media_type?: "image" | "carousel" | "video";
  reply_to?: string;
}

export interface PostResult {
  platform_post_id: string;
  post_url: string;
  published_at: string;
}

export interface PostInsights {
  platform_post_id: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  impressions?: number;
  posted_at: string;
}

// ============================================================
// ページネーション
// ============================================================

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface ThreadListItem {
  id: string;
  text: string | null;
  media_type: string | null;
  media_url: string | null;
  timestamp: string;
  permalink: string | null;
}

export interface ThreadList {
  data: ThreadListItem[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

// ============================================================
// SNS APIアダプターインターフェース
// ============================================================

export interface SNSAdapter {
  /** プラットフォーム識別子 */
  readonly platform: Platform;

  /** OAuth認証コードからトークンを取得 */
  authenticate(code: string): Promise<OAuthTokens>;

  /** リフレッシュトークンでアクセストークンを更新 */
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /** 認証ユーザーのプロフィールを取得 */
  getProfile(accessToken: string): Promise<SNSProfile>;

  /** 投稿を作成 */
  createPost(
    accessToken: string,
    content: PostContent
  ): Promise<PostResult>;

  /** 投稿を削除 */
  deletePost(accessToken: string, postId: string): Promise<void>;

  /** 投稿のインサイト（エンゲージメント）を取得 */
  getPostInsights(
    accessToken: string,
    postId: string
  ): Promise<PostInsights>;

  /** フォロワー数を取得 */
  getFollowerCount(accessToken: string): Promise<number>;

  /** 認証ユーザーの投稿一覧を取得 */
  getUserThreads(
    accessToken: string,
    options?: PaginationOptions
  ): Promise<ThreadList>;

  /** 他ユーザーの公開プロフィールを取得（モデリング用） */
  getPublicProfile(userId: string, accessToken: string): Promise<PublicProfile>;

  /** 他ユーザーの公開投稿一覧を取得（モデリング用） */
  getPublicThreads(
    userId: string,
    accessToken: string,
    options?: PaginationOptions
  ): Promise<ThreadList>;
}
