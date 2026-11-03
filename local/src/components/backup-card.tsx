"use client";

import * as React from "react";
import { DatabaseBackup, Download, FileUp, Loader2 } from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { toast } from "@subboost/ui/components/ui/toaster";
import {
  BACKUP_PASSWORD_MIN_LENGTH,
  describeImportSummary,
  errorMessage,
  formatBackupDate,
  isEncryptedBackup,
  requestBackupExport,
  requestBackupImport,
  type BackupImportMode,
  type BackupImportSummary,
} from "./backup-client";

type SelectedFile = { name: string; text: string; encrypted: boolean };

const MODE_HINTS: Record<BackupImportMode, string> = {
  merge: "合并：token 相同的订阅用备份更新，其余新增；同名模板跳过；不改动订阅源安全设置。",
  replace: "覆盖：先清空现有订阅和模板，再导入备份，结果与备份完全一致。",
};

const CONFIRM_TEXT: Record<BackupImportMode, { title: string; description: string; variant: "warning" | "destructive" }> = {
  merge: {
    title: "合并导入备份？",
    description: "token 相同的订阅会被备份中的版本覆盖，其余数据保持不变。",
    variant: "warning",
  },
  replace: {
    title: "覆盖导入备份？",
    description: "现有的订阅和模板会被全部删除并替换为备份内容，此操作不可撤销。建议先导出一份当前数据。",
    variant: "destructive",
  },
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function BackupCard({ disabled, onImported }: { disabled: boolean; onImported: () => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [exportPassword, setExportPassword] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<SelectedFile | null>(null);
  const [importPassword, setImportPassword] = React.useState("");
  const [mode, setMode] = React.useState<BackupImportMode>("merge");
  const [preview, setPreview] = React.useState<BackupImportSummary | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);

  const exportPasswordInvalid = exportPassword.length > 0 && exportPassword.length < BACKUP_PASSWORD_MIN_LENGTH;
  const needsPassword = Boolean(selectedFile?.encrypted) && !importPassword;
  const importBusy = disabled || importing;

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, fileName } = await requestBackupExport(exportPassword);
      downloadBlob(blob, fileName);
      toast({ title: "备份已导出", description: exportPassword ? "导入时需要输入同一个密码。" : undefined, variant: "success" });
    } catch (error) {
      setExportError(errorMessage(error, "导出失败，请重试"));
    } finally {
      setExporting(false);
    }
  };

  const resetPreview = () => {
    setPreview(null);
    setImportError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    resetPreview();
    const file = event.target.files?.[0];
    const text = file ? await file.text() : null;
    setSelectedFile(file && text !== null ? { name: file.name, text, encrypted: isEncryptedBackup(text) } : null);
  };

  const submitImport = (file: SelectedFile, dryRun: boolean) =>
    requestBackupImport({ file: file.text, mode, dryRun, ...(file.encrypted ? { password: importPassword } : {}) });

  const handlePreview = async () => {
    if (!selectedFile) return;
    setImporting(true);
    resetPreview();
    try {
      setPreview(await submitImport(selectedFile, true));
    } catch (error) {
      setImportError(errorMessage(error, "检查失败，请重试"));
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !preview) return;
    if (!(await confirmDialog({ ...CONFIRM_TEXT[mode], confirmText: "确认导入" }))) return;

    setImporting(true);
    setImportError(null);
    try {
      const summary = await submitImport(selectedFile, false);
      toast({
        title: "备份已导入",
        description: `订阅新增 ${summary.subscriptions.created} 个、更新 ${summary.subscriptions.updated} 个，模板新增 ${summary.templates.created} 个`,
        variant: "success",
      });
      setSelectedFile(null);
      setImportPassword("");
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImported();
    } catch (error) {
      setImportError(errorMessage(error, "导入失败，请重试"));
    } finally {
      setImporting(false);
    }
  };

  const selectMode = (next: BackupImportMode) => {
    setMode(next);
    setPreview(null);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-lg bg-amber-500/20 p-2 text-amber-300">
          <DatabaseBackup className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">备份与恢复</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <div>
            <p className="font-medium">导出备份</p>
            <p className="mt-1 text-xs text-fg-50">
              包含全部订阅（含机场订阅链接和订阅 token）、模板和订阅源安全设置，可导入任意 SubBoost 实例。
            </p>
          </div>
          <PasswordField
            label="备份密码（可选）"
            description={`设置后备份文件会被加密，至少 ${BACKUP_PASSWORD_MIN_LENGTH} 位；不设置则导出明文，请妥善保管。`}
            value={exportPassword}
            onChange={(event) => setExportPassword(event.target.value)}
            error={exportPasswordInvalid ? `至少 ${BACKUP_PASSWORD_MIN_LENGTH} 位` : undefined}
            autoComplete="new-password"
            disabled={disabled || exporting}
          />
          <Button className="gap-2" onClick={() => void handleExport()} disabled={disabled || exporting || exportPasswordInvalid}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            导出备份
          </Button>
          {exportError && <p className="text-xs text-red-300">{exportError}</p>}
        </section>

        <section className="space-y-3">
          <div>
            <p className="font-medium">导入备份</p>
            <p className="mt-1 text-xs text-fg-50">先检查备份内容，确认无误后再导入；导入失败不会修改任何数据。</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={importBusy}>
              <FileUp className="h-4 w-4" />
              选择备份文件
            </Button>
            <span className="min-w-0 truncate text-sm text-fg-60">{selectedFile?.name ?? "未选择文件"}</span>
          </div>
          {selectedFile?.encrypted && (
            <PasswordField
              label="备份密码"
              description="这个备份文件已加密，请输入导出时设置的密码。"
              value={importPassword}
              onChange={(event) => {
                setImportPassword(event.target.value);
                setPreview(null);
              }}
              autoComplete="off"
              disabled={importBusy}
              required
            />
          )}
          <ChoiceGroup label="导入模式">
            <ChoiceChip label="合并" selected={mode === "merge"} disabled={importBusy} onClick={() => selectMode("merge")} />
            <ChoiceChip label="覆盖" selected={mode === "replace"} disabled={importBusy} onClick={() => selectMode("replace")} />
          </ChoiceGroup>
          <p className="text-xs text-fg-50">{MODE_HINTS[mode]}</p>

          {preview && (
            <div className="space-y-1 rounded-md border border-ink/10 bg-ink/5 px-3 py-2 text-xs text-fg-70">
              <p className="text-fg-50">
                备份时间 {formatBackupDate(preview.backup.exportedAt)}
                {preview.backup.appVersion && ` · 版本 ${preview.backup.appVersion}`}
              </p>
              {describeImportSummary(preview).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void handlePreview()}
              disabled={importBusy || !selectedFile || needsPassword}
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              检查备份
            </Button>
            <Button
              variant={mode === "replace" ? "destructive" : "default"}
              className="gap-2"
              onClick={() => void handleImport()}
              disabled={importBusy || !preview}
            >
              确认导入
            </Button>
          </div>
          {importError && <p className="text-xs text-red-300">{importError}</p>}
        </section>
      </CardContent>
    </Card>
  );
}
