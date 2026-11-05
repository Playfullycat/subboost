import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: undefined as void | (() => void),
  setState: vi.fn(),
  stateValue: null as unknown,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      mocks.cleanup = effect();
    },
    useState: (initial: unknown) => [mocks.stateValue ?? initial, mocks.setState],
  };
});

import { InstallPrompt } from "./install-prompt";
import { INSTALL_PROMPT_STORAGE_KEY } from "../lib/install-prompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type Listener = (event: Event) => void;

function stubBrowser(options: { userAgent?: string; standalone?: boolean; storage?: Record<string, string> } = {}) {
  const listeners = new Map<string, Listener>();
  const data = new Map(Object.entries(options.storage ?? {}));
  const localStorage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
  const win = {
    addEventListener: vi.fn((type: string, listener: Listener) => void listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => void listeners.delete(type)),
    matchMedia: (query: string) => ({ matches: options.standalone === true && query === "(display-mode: standalone)" }),
    navigator: {},
    localStorage,
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { userAgent: options.userAgent ?? DESKTOP_CHROME, maxTouchPoints: 0 });
  return { listeners, localStorage, win };
}

function installEvent(outcome: "accepted" | "dismissed") {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  };
}

type Element = React.ReactElement<{ children?: React.ReactNode; onClick?: () => void; "aria-label"?: string }>;

function findButtons(node: React.ReactNode, found: Element[] = []): Element[] {
  if (Array.isArray(node)) node.forEach((child) => findButtons(child, found));
  else if (React.isValidElement(node)) {
    const element = node as Element;
    if (typeof element.props.onClick === "function") found.push(element);
    findButtons(element.props.children, found);
  }
  return found;
}

function clickButton(label: string | RegExp) {
  const tree = InstallPrompt();
  const button = findButtons(tree).find((element) => {
    const text = renderToStaticMarkup(element);
    return typeof label === "string" ? element.props["aria-label"] === label || text.includes(label) : label.test(text);
  });
  if (!button) throw new Error(`button ${label} not found`);
  button.props.onClick?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanup = undefined;
  mocks.stateValue = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallPrompt", () => {
  it("renders nothing until the browser offers an install", () => {
    stubBrowser();
    expect(renderToStaticMarkup(React.createElement(InstallPrompt))).toBe("");
  });

  it("captures beforeinstallprompt and cleans up its listeners", () => {
    const { listeners, win } = stubBrowser();
    renderToStaticMarkup(React.createElement(InstallPrompt));
    const event = installEvent("accepted");
    listeners.get("beforeinstallprompt")?.(event as unknown as Event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(mocks.setState).toHaveBeenCalledWith({ kind: "native", event });

    listeners.get("appinstalled")?.(new Event("appinstalled"));
    expect(mocks.setState).toHaveBeenLastCalledWith(null);

    (mocks.cleanup as () => void)();
    expect(win.removeEventListener).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith("appinstalled", expect.any(Function));
  });

  it("stays hidden when already installed or recently dismissed", () => {
    const installed = stubBrowser({ standalone: true });
    renderToStaticMarkup(React.createElement(InstallPrompt));
    expect(installed.win.addEventListener).not.toHaveBeenCalled();

    const snoozed = stubBrowser({ storage: { [INSTALL_PROMPT_STORAGE_KEY]: String(Date.now()) } });
    renderToStaticMarkup(React.createElement(InstallPrompt));
    expect(snoozed.win.addEventListener).not.toHaveBeenCalled();
  });

  it("shows the native install card and opens the browser dialog", async () => {
    stubBrowser();
    const event = installEvent("accepted");
    mocks.stateValue = { kind: "native", event };
    const html = renderToStaticMarkup(React.createElement(InstallPrompt));
    expect(html).toContain("添加 SubBoost 到桌面");
    expect(html).toContain("安装");

    clickButton("安装");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.setState).toHaveBeenCalledWith(null);
    expect(event.prompt).toHaveBeenCalled();
  });

  it("snoozes when the user declines the browser dialog or closes the card", async () => {
    const { localStorage } = stubBrowser();
    mocks.stateValue = { kind: "native", event: installEvent("dismissed") };
    clickButton("安装");
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    expect(localStorage.setItem).toHaveBeenCalledWith(INSTALL_PROMPT_STORAGE_KEY, expect.any(String));

    localStorage.setItem.mockClear();
    clickButton("以后再说");
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    clickButton("关闭");
    expect(localStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it("shows share-sheet instructions on iPhone after a short delay", () => {
    vi.useFakeTimers();
    stubBrowser({ userAgent: IPHONE_SAFARI });
    renderToStaticMarkup(React.createElement(InstallPrompt));
    expect(mocks.setState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(mocks.setState).toHaveBeenCalledWith({ kind: "ios" });

    mocks.stateValue = { kind: "ios" };
    const html = renderToStaticMarkup(React.createElement(InstallPrompt));
    expect(html).toContain("添加到主屏幕");
    expect(html).not.toContain("以后再说");

    // iOS 卡片只有关闭按钮。
    expect(findButtons(InstallPrompt()).map((button) => button.props["aria-label"])).toEqual(["关闭"]);
  });
});
