"use client";

import * as React from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import {
  type BeforeInstallPromptEvent,
  isInstallPromptSnoozed,
  isStandaloneDisplay,
  readLocalStorage,
  shouldShowIosInstallHint,
  snoozeInstallPrompt,
} from "../lib/install-prompt";

type PromptState = { kind: "native"; event: BeforeInstallPromptEvent } | { kind: "ios" } | null;

/** iOS 提示延迟出现，避免一打开页面就遮挡内容。 */
const IOS_HINT_DELAY_MS = 3000;

/**
 * 「添加到桌面」提示：
 * - Chrome / Edge / 安卓浏览器：拦截 beforeinstallprompt，显示「安装」按钮，点击后弹出系统安装窗口；
 * - iPhone / iPad：没有安装弹窗，提示通过「分享 → 添加到主屏幕」添加；
 * 已从桌面图标打开或 30 天内关闭过时不显示。
 */
export function InstallPrompt() {
  const [prompt, setPrompt] = React.useState<PromptState>(null);

  React.useEffect(() => {
    if (isStandaloneDisplay(window) || isInstallPromptSnoozed(readLocalStorage(window), Date.now())) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt({ kind: "native", event: event as BeforeInstallPromptEvent });
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const timer = shouldShowIosInstallHint(navigator.userAgent, navigator.maxTouchPoints)
      ? setTimeout(() => setPrompt({ kind: "ios" }), IOS_HINT_DELAY_MS)
      : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  if (!prompt) return null;

  const dismiss = () => {
    snoozeInstallPrompt(readLocalStorage(window), Date.now());
    setPrompt(null);
  };

  const install = async (event: BeforeInstallPromptEvent) => {
    setPrompt(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "dismissed") snoozeInstallPrompt(readLocalStorage(window), Date.now());
  };

  return (
    <div
      role="dialog"
      aria-label="添加 SubBoost 到桌面"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] md:inset-x-auto md:bottom-6 md:right-6 md:w-96"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-header p-4 shadow-2xl backdrop-blur-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-sm font-semibold text-fg">添加 SubBoost 到桌面</div>
          {prompt.kind === "native" ? (
            <>
              <p className="text-xs leading-relaxed text-fg-60">像 App 一样从桌面一键打开，独立窗口，没有地址栏。</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void install(prompt.event)}>
                  <Download />
                  安装
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  以后再说
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-fg-60">
              点击浏览器的「分享」按钮 <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="分享" />
              ，然后选择「添加到主屏幕」 <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" aria-label="添加到主屏幕" />。
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={dismiss}
          className="-m-1 rounded-lg p-1 text-fg-60 transition-colors hover:bg-ink/5 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
