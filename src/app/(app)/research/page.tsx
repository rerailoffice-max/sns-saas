/**
 * リサーチ画面
 * Threadsの公開投稿の検索（threads_keyword_search）と、
 * 同じ分野の公開アカウントの調査（threads_profile_discovery・競合分析）
 */
import { Search } from "lucide-react";
import { ResearchClient } from "@/components/research/research-client";

export default function ResearchPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Search className="h-6 w-6" />
          <h1 className="text-2xl font-bold">
            リサーチ <span className="text-base font-normal text-muted-foreground">/ Research</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Threadsの公開投稿と、同じ分野の公開アカウントを調べます。
          / Search public Threads posts and look up public accounts in your field.
        </p>
      </div>
      <ResearchClient />
    </div>
  );
}
