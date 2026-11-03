"use client";

import * as React from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { toast } from "@subboost/ui/components/ui/toaster";
import { getLocalAdminPasswordChangeError, LOCAL_ADMIN_PASSWORD_MIN_LENGTH } from "../lib/admin-credentials";

async function requestPasswordChange(body: { currentPassword: string; newPassword: string; newPasswordConfirm: string }) {
  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return;
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (response.status === 429) throw new Error("尝试次数过多，请 15 分钟后再试");
  throw new Error(typeof payload?.error === "string" && payload.error ? payload.error : "修改失败，请重试");
}

export function ChangePasswordCard({ disabled }: { disabled: boolean }) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = { currentPassword, newPassword, newPasswordConfirm };
    const validationError = getLocalAdminPasswordChangeError(input);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await requestPasswordChange(input);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      toast({ title: "密码已修改", description: "其他设备上的登录已失效，需要用新密码重新登录。", variant: "success" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const fieldDisabled = disabled || saving;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-lg bg-violet-500/20 p-2 text-violet-300">
          <KeyRound className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">修改密码</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <PasswordField
            label="当前密码"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            disabled={fieldDisabled}
            required
          />
          <PasswordField
            label="新密码"
            description={`至少 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            disabled={fieldDisabled}
            required
          />
          <PasswordField
            label="确认新密码"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            autoComplete="new-password"
            disabled={fieldDisabled}
            required
          />
          <p className="text-xs text-fg-50">修改后，其他设备上的登录会全部失效，当前设备保持登录。</p>
          <Button type="submit" className="gap-2" disabled={fieldDisabled}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            修改密码
          </Button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
