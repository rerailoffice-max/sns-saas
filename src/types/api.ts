/**
 * API リクエスト/レスポンスの型定義
 * 内部API + 外部API (v1)
 */

import { DraftSource, DraftStatus, MediaType, SubscriptionPlan } from "./database";

// ============================================================
// 共通レスポンス型
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// ============================================================
// 下書き API
// ============================================================

export interface CreateDraftRequest {
  account_id: string;
  text: string;
  hashtags?: string[];
  media_urls?: string[];
  source?: DraftSource;
  metadata?: Record<string, unknown>;
}

export interface UpdateDraftRequest {
  text?: string;
  hashtags?: string[];
  media_urls?: string[];
  status?: DraftStatus;
}

// ============================================================
// 予約投稿 API
// ============================================================

export interface CreateScheduledPostRequest {
  draft_id: string;
  account_id: string;
  scheduled_at: string; // ISO 8601
}

// ============================================================
// 分析 API
// ============================================================

export interface InsightsQuery {
  account_id: string;
  period: "7d" | "30d" | "90d";
}

export interface TrendsResponse {
  engagement_by_hour: Array<{
    hour: number;
    day: number;
    avg_engagement: number;
  }>;
  engagement_by_text_length: Array<{
    range: string;
    avg_engagement: number;
    count: number;
  }>;
  engagement_by_hashtag_count: Array<{
    count: number;
    avg_engagement: number;
  }>;
  top_categories: Array<{
    category: string;
    count: number;
    avg_engagement: number;
  }>;
}

// ============================================================
// モデルアカウント API
// ============================================================

export interface CreateModelAccountRequest {
  platform: "threads";
  username: string;
}

export interface AnalyzeModelAccountResponse {
  model_account_id: string;
  analysis: {
    writing_style: Record<string, unknown>;
    content_themes: Array<{ theme: string; frequency: number }>;
    hashtag_strategy: Record<string, unknown>;
    posting_frequency: Record<string, unknown>;
    summary: string;
  };
  optimization_suggestions: string[];
}

// ============================================================
// Stripe API
// ============================================================

export interface CreateCheckoutRequest {
  plan: Exclude<SubscriptionPlan, "free">;
  billing_period: "monthly" | "yearly";
}

export interface CheckoutResponse {
  checkout_url: string;
}

// ============================================================
// 外部 API v1（OpenClaw連携）
// ============================================================

export interface ExternalCreateDraftRequest {
  text: string;
  hashtags?: string[];
  media_urls?: string[];
  metadata?: Record<string, unknown>;
  account_id?: string;       // 省略時はデフォルトアカウント
  auto_schedule?: {
    scheduled_at: string;    // ISO 8601
  };
}

export interface ExternalDraftResponse {
  id: string;
  status: DraftStatus;
  text: string;
  created_at: string;
  scheduled_post_id?: string;
}

export interface ExternalStatusResponse {
  draft_id: string;
  draft_status: DraftStatus;
  scheduled_post?: {
    id: string;
    scheduled_at: string;
    status: string;
    post_url?: string;
  };
}

// ============================================================
// Chrome拡張 Sync API
// ============================================================

export interface ExtensionSyncRequest {
  posts: Array<{
    platform_post_id: string;
    username: string;            // モデルアカウントのusername
    text?: string;
    media_type?: MediaType;
    posted_at?: string;
    likes?: number;
    replies?: number;
    reposts?: number;
  }>;
}

export interface ExtensionSyncResponse {
  synced: number;
  skipped: number;
  errors: Array<{
    platform_post_id: string;
    reason: string;
  }>;
}
