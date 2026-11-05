export const SUBBOOST_SITE_NAME = "SubBoost";

export const SUBBOOST_PRODUCT_TITLE = "SubBoost - Clash 订阅转换与管理服务";

export const SUBBOOST_PRODUCT_DESCRIPTION =
  "Clash 订阅转换、生成与管理工具，支持链式代理、智能分流、多协议和多订阅聚合。";

export const SUBBOOST_FOOTER_DESCRIPTION =
  "Clash 订阅转换、生成和管理工具，让配置更简单";

export const SUBBOOST_THEME_COLOR = "#1e1b4b";

export const SUBBOOST_ICON_PATH = "/icon.png";

export const SUBBOOST_FAVICON_PATH = "/favicon.ico";

/** iOS「添加到主屏幕」使用的图标（180x180，不透明背景）。 */
export const SUBBOOST_APPLE_ICON_PATH = "/icons/apple-touch-icon.png";

/** PWA 安装图标：浏览器要求 192 和 512 两种尺寸，maskable 图标留出安全区供系统裁剪。 */
export const SUBBOOST_MANIFEST_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export const SUBBOOST_KEYWORDS = [
  "Clash",
  "订阅转换",
  "订阅生成",
  "订阅管理",
  "链式代理",
  "智能分流",
  "订阅聚合",
  "代理配置",
  "SubBoost",
  "Clash 配置",
  "多订阅管理",
];

export const SUBBOOST_MANIFEST_CATEGORIES = ["utilities", "productivity"];

export type SubBoostManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  orientation: "any";
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: "any" | "maskable";
  }>;
  categories: string[];
  lang: string;
};

export function createSubBoostManifest(): SubBoostManifest {
  return {
    id: "/",
    name: SUBBOOST_PRODUCT_TITLE,
    short_name: SUBBOOST_SITE_NAME,
    description: SUBBOOST_PRODUCT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f0d1a",
    theme_color: SUBBOOST_THEME_COLOR,
    orientation: "any",
    icons: SUBBOOST_MANIFEST_ICONS.map((icon) => ({ ...icon })),
    categories: [...SUBBOOST_MANIFEST_CATEGORIES],
    lang: "zh-CN",
  };
}
