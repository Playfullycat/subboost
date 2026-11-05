import { describe, expect, it, vi } from "vitest";
import {
  INSTALL_PROMPT_SNOOZE_MS,
  INSTALL_PROMPT_STORAGE_KEY,
  isInstallPromptSnoozed,
  isStandaloneDisplay,
  readLocalStorage,
  shouldShowIosInstallHint,
  snoozeInstallPrompt,
} from "./install-prompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
}

describe("isStandaloneDisplay", () => {
  it("detects iOS home screen apps and installed display modes", () => {
    expect(isStandaloneDisplay({ navigator: { standalone: true } })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" }) })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: (query) => ({ matches: query === "(display-mode: minimal-ui)" }) })).toBe(true);
  });

  it("returns false in a normal browser tab", () => {
    expect(isStandaloneDisplay({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandaloneDisplay({})).toBe(false);
  });
});

describe("shouldShowIosInstallHint", () => {
  it("shows the share-sheet hint on iPhone and iPadOS", () => {
    expect(shouldShowIosInstallHint(IPHONE_SAFARI, 5)).toBe(true);
    expect(shouldShowIosInstallHint(IPAD_DESKTOP_UA, 5)).toBe(true);
  });

  it("skips desktop Macs, Android and in-app browsers that cannot add to the home screen", () => {
    expect(shouldShowIosInstallHint(IPAD_DESKTOP_UA, 0)).toBe(false);
    expect(shouldShowIosInstallHint(ANDROID_CHROME, 5)).toBe(false);
    expect(shouldShowIosInstallHint(`${IPHONE_SAFARI} MicroMessenger/8.0.50`, 5)).toBe(false);
    expect(shouldShowIosInstallHint(`${IPHONE_SAFARI} QQ/9.0.0`, 5)).toBe(false);
  });
});

describe("install prompt snooze", () => {
  it("snoozes for 30 days after a dismissal", () => {
    const storage = memoryStorage();
    const now = 1_800_000_000_000;
    expect(isInstallPromptSnoozed(storage, now)).toBe(false);

    snoozeInstallPrompt(storage, now);
    expect(storage.setItem).toHaveBeenCalledWith(INSTALL_PROMPT_STORAGE_KEY, String(now));
    expect(isInstallPromptSnoozed(storage, now + INSTALL_PROMPT_SNOOZE_MS - 1)).toBe(true);
    expect(isInstallPromptSnoozed(storage, now + INSTALL_PROMPT_SNOOZE_MS)).toBe(false);
  });

  it("ignores invalid values and unavailable storage", () => {
    expect(isInstallPromptSnoozed(memoryStorage({ [INSTALL_PROMPT_STORAGE_KEY]: "garbage" }), 1)).toBe(false);
    expect(isInstallPromptSnoozed(null, 1)).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(isInstallPromptSnoozed(throwing, 1)).toBe(false);
    expect(() => snoozeInstallPrompt(throwing, 1)).not.toThrow();
    expect(() => snoozeInstallPrompt(null, 1)).not.toThrow();
  });

  it("reads localStorage defensively", () => {
    const storage = {} as Storage;
    expect(readLocalStorage({ localStorage: storage })).toBe(storage);
    expect(readLocalStorage({})).toBeNull();
    const blocked = Object.defineProperty({}, "localStorage", {
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(readLocalStorage(blocked)).toBeNull();
  });
});
