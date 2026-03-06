/**
 * 投稿プレビューコンポーネント
 * Threads風のプレビュー表示
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface PostPreviewProps {
  text: string;
  username: string;
  displayName: string;
}

export function PostPreview({ text, username, displayName }: PostPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">プレビュー</CardTitle>
      </CardHeader>
      <CardContent>
        {text.trim() ? (
          <div className="rounded-lg border p-4 space-y-3">
            {/* ヘッダー */}
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs">
                  {displayName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">@{username}</p>
              </div>
            </div>

            {/* テキスト */}
            <p className="text-sm whitespace-pre-wrap break-words">
              {text}
            </p>

            {/* フッター（ダミー） */}
            <div className="flex items-center gap-6 text-xs text-muted-foreground pt-2 border-t">
              <span>♡ 0</span>
              <span>💬 0</span>
              <span>🔁 0</span>
              <span>たった今</span>
            </div>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            テキストを入力するとプレビューが表示されます
          </div>
        )}
      </CardContent>
    </Card>
  );
}
