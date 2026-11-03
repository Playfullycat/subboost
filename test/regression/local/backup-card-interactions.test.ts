import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  stateIndex: 0,
  ref: { current: null as null | { click: ReturnType<typeof vi.fn>; value: string } },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: () => harness.ref,
    useState: (initial: unknown) => {
      const index = harness.stateIndex++;
      const value = Object.prototype.hasOwnProperty.call(harness.overrides, index) ? harness.overrides[index] : initial;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [value, setter];
    },
  };
});

const mocks = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  toast: vi.fn(),
  requestBackupExport: vi.fn(),
  requestBackupImport: vi.fn(),
}));

vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("../../../local/src/components/backup-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../local/src/components/backup-client")>();
  return { ...actual, requestBackupExport: mocks.requestBackupExport, requestBackupImport: mocks.requestBackupImport };
});

import { BackupCard } from "../../../local/src/components/backup-card";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip } from "@subboost/ui/components/ui/choice-group";
import { PasswordField } from "@subboost/ui/components/ui/password-field";

// State order inside BackupCard.
const S = {
  exportPassword: 0,
  exporting: 1,
  exportError: 2,
  selectedFile: 3,
  importPassword: 4,
  mode: 5,
  preview: 6,
  importing: 7,
  importError: 8,
} as const;

type Element = React.ReactElement<Record<string, any>>;

function collect(node: React.ReactNode, out: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out));
  } else if (React.isValidElement(node)) {
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

function render(overrides: Partial<Record<keyof typeof S, unknown>> = {}, props = { disabled: false, onImported: vi.fn() }) {
  harness.stateIndex = 0;
  harness.setters = [];
  harness.overrides = Object.fromEntries(Object.entries(overrides).map(([key, value]) => [S[key as keyof typeof S], value]));
  const tree = BackupCard(props) as Element;
  const elements = collect(tree);
  const setter = (key: keyof typeof S) => harness.setters[S[key]];
  const button = (label: string) => elements.find((el) => el.type === Button && textOf(el.props.children).includes(label))!;
  const passwordFields = elements.filter((el) => el.type === PasswordField);
  const chips = elements.filter((el) => el.type === ChoiceChip);
  const input = elements.find((el) => el.type === "input")!;
  return { tree, elements, text: textOf(tree), setter, button, passwordFields, chips, input, props };
}

const FILE = { name: "backup.json", text: '{"schema":"subboost-backup/v1"}', encrypted: false };
const ENCRYPTED_FILE = { name: "secret.json", text: '{"schema":"subboost-backup-encrypted/v1"}', encrypted: true };
const SUMMARY = {
  mode: "merge",
  subscriptions: { total: 2, created: 1, updated: 1, deleted: 0 },
  templates: { total: 1, created: 1, skipped: 0, deleted: 0 },
  settingsApplied: false,
  backup: { exportedAt: "2026-11-04T00:00:00.000Z", appVersion: "" },
};

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  harness.ref = { current: { click: vi.fn(), value: "backup.json" } };
});

describe("BackupCard", () => {
  it("renders the idle state", () => {
    const view = render();
    expect(view.text).toContain("备份与恢复");
    expect(view.text).toContain("未选择文件");
    expect(view.text).toContain("合并：token 相同的订阅用备份更新");
    expect(view.button("导出备份").props.disabled).toBe(false);
    expect(view.button("检查备份").props.disabled).toBe(true);
    expect(view.button("确认导入").props.disabled).toBe(true);
    expect(view.passwordFields).toHaveLength(1);
  });

  it("blocks short export passwords and shows errors", () => {
    const view = render({ exportPassword: "short", exportError: "导出出错", importError: "导入出错", exporting: true });
    expect(view.passwordFields[0].props.error).toBe("至少 8 位");
    expect(view.button("导出备份").props.disabled).toBe(true);
    expect(view.text).toContain("导出出错");
    expect(view.text).toContain("导入出错");

    view.passwordFields[0].props.onChange({ target: { value: "long-enough" } });
    expect(view.setter("exportPassword")).toHaveBeenCalledWith("long-enough");
  });

  it("downloads an export and reports the password reminder", async () => {
    const blob = new Blob(["{}"]);
    mocks.requestBackupExport.mockResolvedValue({ blob, fileName: "a.json" });
    const link = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:1"), revokeObjectURL: vi.fn() });

    const withPassword = render({ exportPassword: "long-enough" });
    withPassword.button("导出备份").props.onClick();
    await flush();
    expect(mocks.requestBackupExport).toHaveBeenCalledWith("long-enough");
    expect(link).toMatchObject({ href: "blob:1", download: "a.json" });
    expect(link.click).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "导入时需要输入同一个密码。" }));
    expect(withPassword.setter("exporting").mock.calls).toEqual([[true], [false]]);

    const plain = render();
    plain.button("导出备份").props.onClick();
    await flush();
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: undefined }));
  });

  it("shows export failures", async () => {
    mocks.requestBackupExport.mockRejectedValue(new Error("服务器错误"));
    const view = render();
    view.button("导出备份").props.onClick();
    await flush();
    expect(view.setter("exportError")).toHaveBeenLastCalledWith("服务器错误");
  });

  it("reads the selected file and opens the picker", async () => {
    const view = render();
    view.button("选择备份文件").props.onClick();
    expect(harness.ref.current?.click).toHaveBeenCalled();

    view.input.props.onChange({ target: { files: [{ name: "secret.json", text: async () => ENCRYPTED_FILE.text }] } });
    await flush();
    expect(view.setter("selectedFile")).toHaveBeenLastCalledWith(ENCRYPTED_FILE);
    expect(view.setter("preview")).toHaveBeenCalledWith(null);

    view.input.props.onChange({ target: { files: [] } });
    await flush();
    expect(view.setter("selectedFile")).toHaveBeenLastCalledWith(null);
  });

  it("asks for the password of encrypted backups", () => {
    const locked = render({ selectedFile: ENCRYPTED_FILE });
    expect(locked.text).toContain("secret.json");
    expect(locked.passwordFields).toHaveLength(2);
    expect(locked.button("检查备份").props.disabled).toBe(true);

    locked.passwordFields[1].props.onChange({ target: { value: "backup-password" } });
    expect(locked.setter("importPassword")).toHaveBeenCalledWith("backup-password");
    expect(locked.setter("preview")).toHaveBeenCalledWith(null);

    expect(render({ selectedFile: ENCRYPTED_FILE, importPassword: "x" }).button("检查备份").props.disabled).toBe(false);
  });

  it("switches import modes", () => {
    const view = render({ mode: "replace" });
    expect(view.text).toContain("覆盖：先清空现有订阅和模板");
    expect(view.button("确认导入").props.variant).toBe("destructive");
    view.chips[0].props.onClick();
    expect(view.setter("mode")).toHaveBeenCalledWith("merge");
    view.chips[1].props.onClick();
    expect(view.setter("mode")).toHaveBeenCalledWith("replace");
    expect(view.setter("preview")).toHaveBeenCalledWith(null);
  });

  it("previews a backup and passes the password only for encrypted files", async () => {
    mocks.requestBackupImport.mockResolvedValue(SUMMARY);

    const plain = render({ selectedFile: FILE });
    plain.button("检查备份").props.onClick();
    await flush();
    expect(mocks.requestBackupImport).toHaveBeenLastCalledWith({ file: FILE.text, mode: "merge", dryRun: true });
    expect(plain.setter("preview")).toHaveBeenLastCalledWith(SUMMARY);
    expect(plain.setter("importing").mock.calls).toEqual([[true], [false]]);

    const encrypted = render({ selectedFile: ENCRYPTED_FILE, importPassword: "backup-password", mode: "replace" });
    encrypted.button("检查备份").props.onClick();
    await flush();
    expect(mocks.requestBackupImport).toHaveBeenLastCalledWith({
      file: ENCRYPTED_FILE.text,
      mode: "replace",
      dryRun: true,
      password: "backup-password",
    });

    const empty = render();
    empty.button("检查备份").props.onClick();
    await flush();
    expect(mocks.requestBackupImport).toHaveBeenCalledTimes(2);
  });

  it("shows preview failures", async () => {
    mocks.requestBackupImport.mockRejectedValue(new Error("备份密码错误"));
    const view = render({ selectedFile: FILE });
    view.button("检查备份").props.onClick();
    await flush();
    expect(view.setter("importError")).toHaveBeenLastCalledWith("备份密码错误");
  });

  it("renders the preview summary", () => {
    const view = render({ selectedFile: FILE, preview: SUMMARY });
    expect(view.text).toContain("订阅：新增 1 个，更新 1 个（token 相同）");
    expect(view.text).not.toContain("版本");
    expect(render({ selectedFile: FILE, preview: { ...SUMMARY, backup: { ...SUMMARY.backup, appVersion: "2.12.0" } } }).text).toContain(
      "版本 2.12.0"
    );
    expect(view.button("确认导入").props.disabled).toBe(false);
  });

  it("imports after confirmation and resets the form", async () => {
    mocks.requestBackupImport.mockResolvedValue(SUMMARY);
    mocks.confirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const view = render({ selectedFile: FILE, preview: SUMMARY, mode: "replace" });

    view.button("确认导入").props.onClick();
    await flush();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", confirmText: "确认导入" }));
    expect(mocks.requestBackupImport).not.toHaveBeenCalled();

    view.button("确认导入").props.onClick();
    await flush();
    expect(mocks.requestBackupImport).toHaveBeenCalledWith({ file: FILE.text, mode: "replace", dryRun: false });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "备份已导入" }));
    expect(view.setter("selectedFile")).toHaveBeenCalledWith(null);
    expect(view.setter("importPassword")).toHaveBeenCalledWith("");
    expect(harness.ref.current?.value).toBe("");
    expect(view.props.onImported).toHaveBeenCalled();
  });

  it("skips the import without a preview and reports import failures", async () => {
    render({ selectedFile: FILE }).button("确认导入").props.onClick();
    await flush();
    expect(mocks.confirmDialog).not.toHaveBeenCalled();

    harness.ref = { current: null };
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.requestBackupImport.mockRejectedValue("bad");
    const view = render({ selectedFile: FILE, preview: SUMMARY });
    view.button("确认导入").props.onClick();
    await flush();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
    expect(view.setter("importError")).toHaveBeenLastCalledWith("导入失败，请重试");
  });

  it("clears the picker after an import even without a mounted input", async () => {
    harness.ref = { current: null };
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.requestBackupImport.mockResolvedValue(SUMMARY);
    const view = render({ selectedFile: FILE, preview: SUMMARY });
    view.button("确认导入").props.onClick();
    await flush();
    expect(view.props.onImported).toHaveBeenCalled();
    view.button("选择备份文件").props.onClick();
  });
});
