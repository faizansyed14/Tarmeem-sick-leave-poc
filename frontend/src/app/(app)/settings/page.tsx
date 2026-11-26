"use client";

import { Check, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { MFA_OPTIONS, type User } from "@/lib/types";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" description="Your profile and sign in security." />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <div className="flex items-center gap-4 p-5">
            <Avatar name={user.full_name} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{user.full_name}</div>
              <div className="text-[13px] text-muted">{user.email}</div>
            </div>
            <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{user.role === "admin" ? "Administrator" : "User"}</Badge>
          </div>
          <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Last signed in {fmtDateTime(user.last_login_at) || "now"}</div>
        </Card>
        <TwoFactorCard />
        <PasswordCard />
      </div>
    </>
  );
}

function TwoFactorCard() {
  const { user } = useAuth();
  const option = MFA_OPTIONS.find((o) => o.value === user.mfa_method);
  const Icon = user.mfa_method === "authenticator" ? Smartphone : user.mfa_method === "email_otp" ? Mail : ShieldCheck;
  return (
    <Card>
      <CardHeader title="Second sign in step" description="Asked for after your password. Set by your administrator." />
      <div className="flex items-center gap-4 p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{option?.label}</div>
          <div className="text-[13px] text-muted">{option?.description}</div>
        </div>
        {user.mfa_method === "authenticator" && (
          <Badge tone={user.totp_enabled ? "good" : "warn"}>{user.totp_enabled ? "Connected" : "Not connected"}</Badge>
        )}
      </div>
      <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
        To use a different method or connect a new phone, ask an administrator to update your account.
      </div>
    </Card>
  );
}

function PasswordCard() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = [
    ["10 or more characters", next.length >= 10],
    ["Upper and lower case", /[A-Z]/.test(next) && /[a-z]/.test(next)],
    ["A number", /\d/.test(next)],
    ["A symbol", /[^A-Za-z0-9]/.test(next)],
  ] as const;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>("/auth/password", { body: { current_password: current, new_password: next } });
      setUser(r.user);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed", "Other sessions have been signed out.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Password" description="Changing your password signs you out on other devices." />
      <form onSubmit={submit} className="grid gap-5 p-5 sm:grid-cols-2">
        {error && <Alert tone="bad" className="sm:col-span-2">{error}</Alert>}
        <div className="sm:col-span-2 sm:max-w-[calc(50%-10px)]">
          <Field label="Current password">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
        </div>
        <Field label="New password">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" error={confirm && confirm !== next ? "Does not match" : null}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        <ul className="grid grid-cols-2 gap-1.5 text-[12.5px] sm:col-span-2 sm:grid-cols-4">
          {rules.map(([label, ok]) => (
            <li key={label} className={`flex items-center gap-1.5 ${ok ? "text-good" : "text-muted"}`}>
              <Check className={`size-3.5 ${ok ? "" : "opacity-30"}`} /> {label}
            </li>
          ))}
        </ul>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!current || !next || !confirm || rules.some(([, ok]) => !ok)}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
