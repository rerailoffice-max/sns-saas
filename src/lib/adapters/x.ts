/**
 * X (旧Twitter) アダプター
 * 投稿データは手動インポート（upload-analysis.js）で取り込む運用。
 * このアダプタは登録・表示に必要な最低限のスタブ実装のみ提供する。
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

export class XAdapter implements SNSAdapter {
  readonly platform = "x" as const;

  async authenticate(_code: string): Promise<OAuthTokens> {
    throw new Error("X の OAuth認証は未実装です。手動インポートを使用してください。");
  }

  async refreshToken(_refreshToken: string): Promise<OAuthTokens> {
    throw new Error("X のトークンリフレッシュは未実装です。");
  }

  async getProfile(_accessToken: string): Promise<SNSProfile> {
    throw new Error("X のプロフィール取得は未実装です。手動インポートを使用してください。");
  }

  async createPost(_accessToken: string, _content: PostContent): Promise<PostResult> {
    throw new Error("X への投稿は未実装です。");
  }

  async deletePost(_accessToken: string, _postId: string): Promise<void> {
    throw new Error("X の投稿削除は未実装です。");
  }

  async getPostInsights(_accessToken: string, _postId: string): Promise<PostInsights> {
    throw new Error("X のインサイト取得は未実装です。手動インポートを使用してください。");
  }

  async getFollowerCount(_accessToken: string): Promise<number> {
    throw new Error("X のフォロワー数取得は未実装です。");
  }

  async getUserThreads(_accessToken: string, _options?: PaginationOptions): Promise<ThreadList> {
    return { data: [] };
  }

  async getPublicProfile(_userId: string, _accessToken: string): Promise<PublicProfile> {
    throw new Error("X の公開プロフィール取得は未実装です。手動インポートを使用してください。");
  }

  async getPublicThreads(
    _userId: string,
    _accessToken: string,
    _options?: PaginationOptions
  ): Promise<ThreadList> {
    return { data: [] };
  }
}
