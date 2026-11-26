const TZ = "Asia/Dubai";

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "Not found";
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(value.length === 10 ? {} : { timeZone: TZ }) });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Not found";
  if (start && end && start === end) return fmtDate(start);
  const s = start ? new Date(`${start}T00:00:00`) : null;
  const e = end ? new Date(`${end}T00:00:00`) : null;
  if (s && e && s.getFullYear() === e.getFullYear()) {
    const sameMonth = s.getMonth() === e.getMonth();
    const left = s.toLocaleDateString("en-GB", { day: "numeric", ...(sameMonth ? {} : { month: "short" }) });
    return `${left} to ${fmtDate(end)}`;
  }
  return `${start ? fmtDate(start) : "?"} to ${end ? fmtDate(end) : "?"}`;
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "Never";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 45) return "Just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 7) {
    const days = Math.round(diff / 86400);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }
  return fmtDate(value);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign in",
  account_locked: "Account locked",
  mfa_enabled: "Authenticator connected",
  mfa_disabled: "Authenticator removed",
  mfa_reset: "Authenticator reset",
  password_changed: "Password changed",
  password_reset: "Password reset",
  user_created: "User created",
  user_updated: "User updated",
  customers_imported: "Customers imported",
  customer_deleted: "Customer removed",
  leave_uploaded: "Certificate uploaded",
  leave_fields_corrected: "Details corrected",
  leave_linked: "Customer linked",
  leave_unlinked: "Customer unlinked",
  otp_sent: "Code sent",
  otp_resent: "Code resent",
  otp_failed: "Incorrect code",
  leave_verified: "Certificate verified",
  sheet_sent: "Sheet emailed",
  customer_created: "Customer added",
  customer_updated: "Customer updated",
  data_exported: "Data exported",
};
