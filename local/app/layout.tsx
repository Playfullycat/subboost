import type { Metadata } from "next";
import "@subboost/ui/styles/globals.css";
import { Footer } from "@subboost/ui/components/layout/footer";
import { MobileNav } from "@subboost/ui/components/layout/mobile-nav";
import { ScrollLockStabilizer } from "@subboost/ui/components/layout/scroll-lock-stabilizer";
import { ConfirmDialogHost } from "@subboost/ui/components/ui/confirm-dialog";
import { Toaster } from "@subboost/ui/components/ui/toaster";
import { THEME_INIT_SCRIPT } from "@subboost/ui/theme/theme-init-script";
import { InstallPrompt } from "@local/components/install-prompt";
import { LocalHeader } from "@local/components/local-header";
import { resolveAppVersionInfo } from "@subboost/server-core/app-version";
import {
  SUBBOOST_APPLE_ICON_PATH,
  SUBBOOST_FAVICON_PATH,
  SUBBOOST_ICON_PATH,
  SUBBOOST_KEYWORDS,
  SUBBOOST_PRODUCT_DESCRIPTION,
  SUBBOOST_PRODUCT_TITLE,
  SUBBOOST_SITE_NAME,
  SUBBOOST_THEME_COLOR,
} from "@subboost/ui/brand";

export const metadata: Metadata = {
  title: {
    default: SUBBOOST_PRODUCT_TITLE,
    template: `%s | ${SUBBOOST_SITE_NAME}`,
  },
  description: SUBBOOST_PRODUCT_DESCRIPTION,
  keywords: SUBBOOST_KEYWORDS,
  authors: [{ name: SUBBOOST_SITE_NAME }],
  creator: SUBBOOST_SITE_NAME,
  publisher: SUBBOOST_SITE_NAME,
  icons: {
    icon: SUBBOOST_ICON_PATH,
    shortcut: SUBBOOST_FAVICON_PATH,
    apple: SUBBOOST_APPLE_ICON_PATH,
  },
  // iOS「添加到主屏幕」后以独立窗口打开，并显示为 SubBoost。
  appleWebApp: {
    capable: true,
    title: SUBBOOST_SITE_NAME,
    statusBarStyle: "black",
  },
};

export const viewport = {
  themeColor: SUBBOOST_THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { buildVersion } = resolveAppVersionInfo({ env: process.env, cwd: process.cwd() });

  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ScrollLockStabilizer />
        <div className="min-h-screen bg-gradient-radial flex flex-col">
          <LocalHeader />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <Footer mode="local" buildVersion={buildVersion} />
          <MobileNav mode="local" />
        </div>
        <InstallPrompt />
        <Toaster />
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
