/**
 * Supabase データベース型定義
 * 全13テーブルの型を定義
 */

// ============================================================
// 共通型
// ============================================================

export type Platform = "threads" | "instagram" | "x";
export type DraftSource = "manual" | "openclaw" | "ai";
export type DraftStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";
export type ScheduledPostStatus =
  | "pending"
  | "processing"
  | "published"
  | "failed";
export type SubscriptionPlan = "free" | "starter" | "professional";
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing";
export type ModelAccountStatus = "active" | "paused" | "deleted";
export type MediaType = "text" | "image" | "carousel" | "video";
export type EngagementSource = "extension" | "manual";

// ============================================================
// テーブル型
// ============================================================

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email_notifications: boolean;
  custom_writing_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  profile_id: string;
  platform: Platform;
  platform_user_id: string;
  username: string | null;
  display_name: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: string | null;
  writing_profile: WritingProfile | null;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  id: string;
  profile_id: string;
  account_id: string;
  source: DraftSource;
  text: string;
  hashtags: string[] | null;
  media_urls: string[] | null;
  metadata: Record<string, unknown> | null;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPost {
  id: string;
  draft_id: string;
  account_id: string;
  scheduled_at: string;
  status: ScheduledPostStatus;
  retry_count: number;
  last_error: string | null;
  post_url: string | null;
  platform_post_id: string | null;
  published_at: string | null;
  created_at: string;
}

export interface PostInsight {
  id: string;
  account_id: string;
  platform_post_id: string;
  post_text: string | null;
  post_url: string | null;
  media_type: string | null;
  media_url: string | null;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  impressions: number | null;
  text_length: number | null;
  hashtag_count: number | null;
  ai_category: string | null;
  posted_at: string | null;
  fetched_at: string;
  created_at: string;
}

export interface DeadLetter {
  id: string;
  scheduled_post_id: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface FollowerSnapshot {
  id: string;
  account_id: string;
  follower_count: number;
  following_count: number | null;
  recorded_at: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  profile_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  profile_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ModelAccount {
  id: string;
  profile_id: string;
  platform: Platform;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  status: ModelAccountStatus;
  analysis_result: AnalysisResult | null;
  last_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelPost {
  id: string;
  model_account_id: string;
  platform_post_id: string;
  text: string | null;
  hashtags: string[] | null;
  media_type: MediaType | null;
  posted_at: string | null;
  ai_category: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  engagement_source: EngagementSource | null;
  engagement_updated_at: string | null;
  created_at: string;
}

// ============================================================
// JSONB型（analysis_result）
// ============================================================

export interface AnalysisResult {
  writing_style: {
    tone: string;
    avg_length: number;
    emoji_usage: string;
    hook_patterns: string[];
  };
  content_themes: Array<{
    theme: string;
    frequency: number;
  }>;
  hashtag_strategy: {
    avg_count: number;
    top_hashtags: string[];
    usage_pattern: string;
  };
  posting_frequency: {
    avg_per_week: number;
    peak_days: string[];
    peak_hours: number[];
  };
  engagement_patterns: {
    avg_likes: number;
    avg_replies: number;
    avg_reposts: number;
    top_post_features: string[];
    best_performing_format: string;
    common_traits?: string[];
    optimal_length?: number;
  };
  summary: string;
  modeling_tips: string[];
}

/** 自分のライティングプロファイル（social_accounts.writing_profile） */
export interface WritingProfile {
  writing_style: {
    tone: string;
    avg_length: number;
    emoji_usage: string;
    hook_patterns: string[];
  };
  content_themes: Array<{
    theme: string;
    frequency: number;
  }>;
  hashtag_strategy: {
    avg_count: number;
    top_hashtags: string[];
    usage_pattern: string;
  };
  posting_frequency: {
    avg_per_week: number;
    peak_days: string[];
    peak_hours: number[];
  };
  summary: string;
  analyzed_at: string;
}

// ============================================================
// Insert / Update 型
// ============================================================

export type ProfileInsert = Omit<Profile, "id" | "created_at" | "updated_at">;
export type ProfileUpdate = Partial<
  Pick<Profile, "display_name" | "avatar_url" | "email_notifications">
>;

export type SocialAccountInsert = Omit<
  SocialAccount,
  "id" | "created_at" | "updated_at"
>;
export type SocialAccountUpdate = Partial<
  Pick<
    SocialAccount,
    | "username"
    | "display_name"
    | "access_token_enc"
    | "refresh_token_enc"
    | "token_expires_at"
    | "is_active"
    | "last_synced_at"
    | "sync_status"
    | "writing_profile"
  >
>;

export type DraftInsert = Omit<Draft, "id" | "created_at" | "updated_at">;
export type DraftUpdate = Partial<
  Pick<Draft, "text" | "hashtags" | "media_urls" | "metadata" | "status">
>;

export type ScheduledPostInsert = Omit<
  ScheduledPost,
  "id" | "created_at" | "retry_count"
>;

export type ModelAccountInsert = Omit<
  ModelAccount,
  "id" | "created_at" | "updated_at"
>;
export type ModelAccountUpdate = Partial<
  Pick<ModelAccount, "display_name" | "avatar_url" | "is_verified" | "status" | "analysis_result" | "last_analyzed_at">
>;
