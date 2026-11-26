"use client";

import { Check, Copy, Mail, MoreHorizontal, ShieldCheck, ShieldOff, Smartphone, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Table, Td, Th, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { MFA_OPTIONS, type MfaMethod, type Role, type User } from "@/lib/types";
import { AdminOnly } from "../guard";

type Credentials = { user: User; temporary_password: string; reason: "created" | "reset" };

export default function UsersPage() {
  return (
    <AdminOnly>
      <Users />
    </AdminOnly>
  );
}

function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, setData, loading, error } = useResource<{ items: User[] }>("/users");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  const replace = (u: User) => setData((d) => (d ? { items: d.items.map((x) => (x.id === u.id ? u : x)) } : d));

  const action = async (u: User, kind: "activate" | "deactivate" | "reset-password" | "reset-mfa") => {
    try {
      if (kind === "reset-password") {
        const r = await api<{ user: User; temporary_password: string }>(`/users/${u.id}/reset-password`, { body: {} });
        replace(r.user);
        setCreds({ ...r, reason: "reset" });
      } else if (kind === "reset-mfa") {
        const r = await api<{ user: User }>(`/users/${u.id}/reset-mfa`, { method: "POST" });
        replace(r.user);
        toast.success("Authenticator reset", `${u.full_name} will connect the app again at next sign in.`);
      } else {
        const r = await api<{ user: User }>(`/users/${u.id}`, { method: "PATCH", body: { is_active: kind === "activate" } });
        replace(r.user);
        toast.success(kind === "activate" ? "User activated" : "User deactivated", u.full_name);
      }
    } catch (err) {
      toast.error("Action failed", errorMessage(err));
    }
  };

  const admins = data?.items.filter((u) => u.role === "admin").length ?? 0;

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Create accounts for staff, assign roles and manage access. Administrators can import customers and manage users."
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}

      <Card>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-5 py-3.5 text-[13px] text-muted">
          <span>
            <span className="tabular font-semibold text-ink">{data?.items.length ?? 0}</span> users
          </span>
          <span>
            <span className="tabular font-semibold text-ink">{admins}</span> administrators
          </span>
          <span>
            <span className="tabular font-semibold text-ink">{data?.items.filter((u) => u.mfa_method === "authenticator").length ?? 0}</span> using Microsoft Authenticator
          </span>
        </div>
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Second sign in step</Th>
                <Th className="hidden lg:table-cell">Last sign in</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className={cx("[&:last-child>td]:border-0", !u.is_active && "opacity-60")}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          {u.full_name}
                          {u.id === me.id && <span className="text-[12px] font-normal text-muted">(you)</span>}
                        </div>
                        <div className="truncate text-[12.5px] text-muted">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role === "admin" ? "Administrator" : "User"}</Badge>
                      {!u.is_active && <Badge tone="bad">Deactivated</Badge>}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                      <MethodIcon method={u.mfa_method} /> {MFA_OPTIONS.find((o) => o.value === u.mfa_method)?.label}
                    </span>
                    {u.mfa_method === "authenticator" && !u.totp_enabled && <div className="mt-0.5 text-[12px] text-muted">Connects at next sign in</div>}
                    {u.must_change_password && <div className="mt-0.5 text-[12px] text-warn">Temporary password</div>}
                  </Td>
                  <Td className="hidden text-[13px] text-muted lg:table-cell">{timeAgo(u.last_login_at)}</Td>
                  <Td className="text-right">
                    <RowMenu
                      items={[
                        { label: "Edit user", onClick: () => setEditing(u) },
                        { label: "Reset password", onClick: () => action(u, "reset-password"), hidden: u.id === me.id },
                        { label: "Reset authenticator", onClick: () => action(u, "reset-mfa"), hidden: !u.totp_enabled },
                        u.is_active
                          ? { label: "Deactivate", onClick: () => action(u, "deactivate"), danger: true, hidden: u.id === me.id }
                          : { label: "Activate", onClick: () => action(u, "activate") },
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(r) => {
          setData((d) => (d ? { items: [r.user, ...d.items] } : d));
          setCreating(false);
          setCreds({ ...r, reason: "created" });
        }}
      />
      <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={(u) => { replace(u); setEditing(null); toast.success("User updated", u.full_name); }} isSelf={editing?.id === me.id} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}

function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink" aria-label="Actions">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 animate-rise rounded-xl border border-line bg-surface p-1 text-left shadow-pop">
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
              <button
                key={i.label}
                onClick={() => {
                  setOpen(false);
                  i.onClick();
                }}
                className={cx("flex h-8 w-full items-center rounded-lg px-2.5 text-[13px]", i.danger ? "text-bad hover:bg-bad-bg" : "text-ink hover:bg-ink/[0.04]")}
              >
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: { user: User; temporary_password: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [method, setMethod] = useState<MfaMethod>("captcha");
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setRole("user");
      setMethod("captcha");
      setMode("generate");
      setPassword("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User; temporary_password: string }>("/users", {
        body: { full_name: name, email, role, mfa_method: method, password: mode === "manual" ? password : null },
      });
      onCreated(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      description="The user signs in with this email and password, then completes the second step you choose."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!name || !email || (mode === "manual" && !password)}>
            Create user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reem Saif Al Ali" />
        </Field>
        <Field label="Work email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@tarmeem.ae" />
        </Field>
        <Field label="Role" hint={role === "admin" ? "Can import customers, manage users and view the audit log." : "Can upload certificates and verify them with customers."}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">User</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <MethodPicker value={method} onChange={setMethod} />
        <Field label="Password">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-subtle p-1">
            {(["generate", "manual"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("h-8 rounded-md text-[13px] font-medium", mode === m ? "bg-surface shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}>
                {m === "generate" ? "Generate secure password" : "Set manually"}
              </button>
            ))}
          </div>
          {mode === "manual" && (
            <Input className="mt-2" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters with upper, lower, number and symbol" />
          )}
        </Field>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved, isSelf }: { user: User | null; onClose: () => void; onSaved: (u: User) => void; isSelf: boolean }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [method, setMethod] = useState<MfaMethod>("captcha");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setRole(user.role);
      setMethod(user.mfa_method);
      setError(null);
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>(`/users/${user.id}`, { method: "PATCH", body: { full_name: name, role, mfa_method: method } });
      onSaved(r.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Edit user"
      description={user?.email}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role" hint={isSelf ? "You cannot change your own role." : "Changing the role signs the user out of active sessions."}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            <option value="user">User</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <MethodPicker value={method} onChange={setMethod} />
        {user && method === "authenticator" && user.mfa_method !== "authenticator" && !user.totp_enabled && (
          <Alert tone="info">The user will scan a QR code with Microsoft Authenticator the next time they sign in.</Alert>
        )}
      </div>
    </Modal>
  );
}

function MethodIcon({ method }: { method: MfaMethod }) {
  if (method === "authenticator") return <Smartphone className="size-4 text-brand-600" />;
  if (method === "email_otp") return <Mail className="size-4 text-brand-600" />;
  return <ShieldCheck className="size-4 text-brand-600" />;
}

function MethodPicker({ value, onChange }: { value: MfaMethod; onChange: (m: MfaMethod) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Second sign in step</legend>
      <div className="space-y-2">
        {MFA_OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cx(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              value === o.value ? "border-brand-500 bg-brand-50/60 ring-[3px] ring-brand-500/10" : "border-line-strong hover:border-faint",
            )}
          >
            <input type="radio" name="mfa_method" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface">
              <MethodIcon method={o.value} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink">{o.label}</span>
              <span className="block text-[12.5px] text-muted">{o.description}</span>
            </span>
            <span className={cx("grid size-4 shrink-0 place-items-center rounded-full border", value === o.value ? "border-brand-600 bg-brand-600" : "border-line-strong")}>
              {value === o.value && <span className="size-1.5 rounded-full bg-white" />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CredentialsModal({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [creds]);
  if (!creds) return null;
  const text = `Tarmeem Leave Verification\nEmail: ${creds.user.email}\nTemporary password: ${creds.temporary_password}`;
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={creds.reason === "created" ? "User created" : "Password reset"}
      description="Share these sign in details securely. The password is shown only once."
      footer={
        <>
          <Button onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
            {copied ? "Copied" : "Copy details"}
          </Button>
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl border border-line bg-subtle p-4">
        <div className="flex items-center gap-3">
          {creds.reason === "created" ? <UserRoundCheck className="size-4 text-good" /> : <UserRoundX className="size-4 text-warn" />}
          <span className="font-medium">{creds.user.full_name}</span>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-y-2 text-[13.5px]">
          <span className="text-muted">Email</span>
          <span className="font-medium">{creds.user.email}</span>
          <span className="text-muted">Password</span>
          <span className="font-mono text-[14px] font-semibold tracking-wide">{creds.temporary_password}</span>
        </div>
      </div>
      <p className="mt-4 flex gap-2 text-[12.5px] text-muted">
        <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
        The user will be asked to change this password after signing in.
      </p>
    </Modal>
  );
}
