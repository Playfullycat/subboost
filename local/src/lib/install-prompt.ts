/** 「添加到桌面」提示：关闭后多久内不再显示。 */
export const INSTALL_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
export const INSTALL_PROMPT_STORAGE_KEY = "subboost:install-prompt-dismissed-at";

/** Chromium 的 beforeinstallprompt 事件（尚未进入 TS 标准库）。 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type DisplayWindow = {
  matchMedia?: (query: string) => { matches: boolean };
  /** iOS Safari 的 navigator.standalone 不在标准类型中。 */
  navigator?: unknown;
};

/** 已经从桌面图标打开（独立窗口）时不再提示。 */
export function isStandaloneDisplay(win: DisplayWindow): boolean {
  if ((win.navigator as { standalone?: unknown } | undefined)?.standalone === true) return true;
  return ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"].some(
    (query) => win.matchMedia?.(query).matches === true
  );
}

/**
 * iPhone / iPad 没有安装弹窗，只能通过「分享 → 添加到主屏幕」，需要手动提示。
 * iPadOS 默认使用桌面版 UA（Macintosh），用触控点数区分；微信、QQ 等内置浏览器无法添加，不提示。
 */
export function shouldShowIosInstallHint(userAgent: string, maxTouchPoints: number): boolean {
  const isIos = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (!isIos) return false;
  return !/MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient/i.test(userAgent);
}

export function isInstallPromptSnoozed(storage: StorageLike | null, now: number): boolean {
  try {
    const dismissedAt = Number(storage?.getItem(INSTALL_PROMPT_STORAGE_KEY));
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < INSTALL_PROMPT_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeInstallPrompt(storage: StorageLike | null, now: number): void {
  try {
    storage?.setItem(INSTALL_PROMPT_STORAGE_KEY, String(now));
  } catch {
    // 隐私模式等情况下无法写入，忽略即可（下次打开会再次提示）。
  }
}

/** 读取 localStorage；Safari 隐私模式或禁用存储时访问会抛错。 */
export function readLocalStorage(win: { localStorage?: Storage }): StorageLike | null {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}
