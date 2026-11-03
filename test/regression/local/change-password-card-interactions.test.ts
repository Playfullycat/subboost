import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  stateIndex: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.stateIndex++;
      const value = Object.prototype.hasOwnProperty.call(harness.overrides, index) ? harness.overrides[index] : initial;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [value, setter];
    },
  };
});

const toast = vi.hoisted(() => vi.fn());
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast }));

import { ChangePasswordCard } from "../../../local/src/components/change-password-card";
import { Button } from "@subboost/ui/components/ui/button";
import { PasswordField } from "@subboost/ui/components/ui/password-field";

const S = { currentPassword: 0, newPassword: 1, newPasswordConfirm: 2, saving: 3, error: 4 } as const;
type Element = React.ReactElement<Record<string, any>>;

function collect(node: React.ReactNode, out: Element[] = []): Element[] {
  if (Array.isArray(node)) node.forEach((child) => collect(child, out));
  else if (React.isValidElement(node)) {
    out.push(node as Element);
    collect((node.props as { children?: React.ReactNode }).children, out);
  }
  return out;
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

function render(overrides: Partial<Record<keyof typeof S, unknown>> = {}, disabled = false) {
  harness.stateIndex = 0;
  harness.setters = [];
  harness.overrides = Object.fromEntries(Object.entries(overrides).map(([key, value]) => [S[key as keyof typeof S], value]));
  const tree = ChangePasswordCard({ disabled }) as Element;
  const elements = collect(tree);
  return {
    text: textOf(tree),
    fields: elements.filter((el) => el.type === PasswordField),
    button: elements.find((el) => el.type === Button)!,
    form: elements.find((el) => el.type === "form")!,
    setter: (key: keyof typeof S) => harness.setters[S[key]],
  };
}

const FILLED = { currentPassword: "current-password-1", newPassword: "brand-new-password", newPasswordConfirm: "brand-new-password" };

async function submit(view: ReturnType<typeof render>) {
  const event = { preventDefault: vi.fn() };
  view.form.props.onSubmit(event);
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  return event;
}

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ChangePasswordCard", () => {
  it("renders three password fields and binds their values", () => {
    const view = render(FILLED, true);
    expect(view.text).toContain("修改密码");
    expect(view.fields.map((field) => field.props.value)).toEqual([
      FILLED.currentPassword,
      FILLED.newPassword,
      FILLED.newPasswordConfirm,
    ]);
    expect(view.button.props.disabled).toBe(true);

    view.fields[0].props.onChange({ target: { value: "a" } });
    view.fields[1].props.onChange({ target: { value: "b" } });
    view.fields[2].props.onChange({ target: { value: "c" } });
    expect(view.setter("currentPassword")).toHaveBeenCalledWith("a");
    expect(view.setter("newPassword")).toHaveBeenCalledWith("b");
    expect(view.setter("newPasswordConfirm")).toHaveBeenCalledWith("c");
  });

  it("validates locally before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render({ ...FILLED, newPasswordConfirm: "different-password" });
    const event = await submit(view);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(view.setter("error")).toHaveBeenCalledWith("两次输入的密码不一致，请重新确认");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changes the password and clears the form", async () => {
    const fetchMock = vi.fn(async () => response(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(FILLED);
    await submit(view);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", expect.objectContaining({ method: "POST", body: JSON.stringify(FILLED) }));
    expect(view.setter("saving").mock.calls).toEqual([[true], [false]]);
    expect(view.setter("currentPassword")).toHaveBeenCalledWith("");
    expect(view.setter("newPassword")).toHaveBeenCalledWith("");
    expect(view.setter("newPasswordConfirm")).toHaveBeenCalledWith("");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "密码已修改", variant: "success" }));
  });

  it.each([
    [response(403, { error: "当前密码不正确" }), "当前密码不正确"],
    [response(429, { error: "Too many" }), "尝试次数过多，请 15 分钟后再试"],
    [response(500), "修改失败，请重试"],
  ])("shows API failures %#", async (apiResponse, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => apiResponse));
    const view = render(FILLED);
    await submit(view);
    expect(view.setter("error")).toHaveBeenLastCalledWith(message);
    expect(toast).not.toHaveBeenCalled();
  });

  it("shows network failures and renders the error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject("offline")));
    const view = render(FILLED);
    await submit(view);
    expect(view.setter("error")).toHaveBeenLastCalledWith("修改失败，请重试");
    expect(render({ error: "当前密码不正确", saving: true }).text).toContain("当前密码不正确");
  });
});
