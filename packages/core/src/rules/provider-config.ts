export const RULE_PROVIDER_CONFIG = {
  // jsDelivr 镜像在国内可直连；github.com 直连在国内经常超时，导致规则集下载失败、分流整体失效。
  baseUrl: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo",
  github: {
    owner: "MetaCubeX",
    repo: "meta-rules-dat",
    ref: "meta",
  },
  treePath: "geo",
  directories: {
    geosite: "geosite",
    geoip: "geoip",
  },
  cacheTtlMs: 24 * 60 * 60 * 1000,
  categories: {
    ads: { name: "广告拦截", emoji: "🛑" },
    ai: { name: "AI 服务", emoji: "🤖" },
    common: { name: "常用服务", emoji: "🌐" },
    media: { name: "流媒体", emoji: "🎬" },
    social: { name: "社交通讯", emoji: "💬" },
    game: { name: "游戏平台", emoji: "🎮" },
    tech: { name: "技术服务", emoji: "🛠️" },
    finance: { name: "金融服务", emoji: "💰" },
    geo: { name: "地理位置", emoji: "🗺️" },
    edu: { name: "教育学术", emoji: "🎓" },
    shopping: { name: "购物电商", emoji: "🛍️" },
    news: { name: "新闻资讯", emoji: "📰" },
    cn: { name: "中国服务", emoji: "🇨🇳" },
    privacy: { name: "隐私安全", emoji: "🔒" },
    other: { name: "其他", emoji: "✨" },
  },
} as const;

export const DEFAULT_RULE_PROVIDER_BASE_URL = RULE_PROVIDER_CONFIG.baseUrl;

/** 2.12 之前的默认规则集地址；已保存配置中的这些值视为"未自定义"，迁移到新默认地址。 */
const LEGACY_RULE_PROVIDER_BASE_URLS = new Set(["https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo"]);

/** 识别 MetaCubeX 规则集完整 URL 时可用的前缀（新默认地址 + 旧默认地址）。 */
export const KNOWN_RULE_PROVIDER_BASE_URLS = [DEFAULT_RULE_PROVIDER_BASE_URL, ...LEGACY_RULE_PROVIDER_BASE_URLS];

export function migrateLegacyRuleProviderBaseUrl(url: string): string;
export function migrateLegacyRuleProviderBaseUrl(url: string | undefined): string | undefined;
export function migrateLegacyRuleProviderBaseUrl(url: string | undefined): string | undefined {
  if (typeof url !== "string") return url;
  return LEGACY_RULE_PROVIDER_BASE_URLS.has(url.trim().replace(/\/+$/, "")) ? DEFAULT_RULE_PROVIDER_BASE_URL : url;
}
export const RULE_CATEGORIES = RULE_PROVIDER_CONFIG.categories;
export type RuleCategory = keyof typeof RULE_CATEGORIES;
