"use server";

/**
 * 認証関連 Server Actions
 * ログイン・サインアップ・パスワードリセット
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface AuthState {
  error?: string;
  success?: string;
}

/** メールアドレス＋パスワードでログイン */
export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return { error: "メールアドレスまたはパスワードが正しくありません" };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "メールアドレスの確認が完了していません。確認メールをご確認ください" };
    }
    return { error: "ログインに失敗しました。もう一度お試しください" };
  }

  // ログイン成功 → redirectパラメータがあればそこへ、なければダッシュボードへ
  const redirectTo = formData.get("redirect") as string;
  redirect(redirectTo || "/dashboard");
}

/** 新規アカウント作成 */
export async function signup(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  if (password.length < 8) {
    return { error: "パスワードは8文字以上で入力してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name || "",
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/callback`,
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "このメールアドレスは既に登録されています" };
    }
    return { error: "アカウントの作成に失敗しました。もう一度お試しください" };
  }

  return { success: "確認メールを送信しました。メールのリンクをクリックして登録を完了してください" };
}

/** パスワードリセットメール送信 */
export async function resetPassword(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "メールアドレスを入力してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/callback?next=/settings`,
  });

  if (error) {
    return { error: "リセットメールの送信に失敗しました" };
  }

  return { success: "パスワードリセット用のメールを送信しました。メールをご確認ください" };
}
