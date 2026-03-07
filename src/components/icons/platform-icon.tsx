/**
 * プラットフォーム別アイコンコンポーネント
 * 各SNSプラットフォームのアイコンを統一されたインターフェースで提供
 */
import { Instagram, Twitter } from "lucide-react";
import { ThreadsIcon } from "./threads-icon";

interface PlatformIconProps {
  platform: string;
  className?: string;
  size?: number;
}

export function PlatformIcon({ platform, className, size = 20 }: PlatformIconProps) {
  switch (platform) {
    case "threads":
      return <ThreadsIcon size={size} className={className} />;
    case "instagram":
      return <Instagram size={size} className={className} />;
    case "x":
      return <Twitter size={size} className={className} />;
    default:
      return <span className={className}>{platform}</span>;
  }
}
