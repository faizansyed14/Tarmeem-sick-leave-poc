"use client";

import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* Button ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(8_56_59/0.3)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50",
  secondary: "bg-surface text-ink border border-line-strong shadow-card hover:bg-subtle hover:border-faint disabled:text-faint",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50",
  ghost: "text-ink-2 hover:bg-ink/[0.04] hover:text-ink disabled:text-faint",
  danger: "bg-surface text-bad border border-bad-line hover:bg-bad-bg disabled:opacity-50",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13.5px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-[14.5px] gap-2 rounded-xl",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,border,color,box-shadow] duration-150 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx("inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors", VARIANTS[variant], SIZES[size], className)}
    >
      {icon}
      {children}
    </Link>
  );
}

/* Form controls ----------------------------------------------------------- */

const control =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-faint shadow-[inset_0_1px_1px_rgb(20_28_27/0.03)] transition-[border,box-shadow] outline-none hover:border-faint focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 disabled:bg-subtle disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(control, "h-10", invalid && "border-bad focus:border-bad focus:ring-bad/15", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(control, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2378807d%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

/* Surfaces ---------------------------------------------------------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-xl border border-line bg-surface shadow-card", className)}>{children}</section>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[13px] text-muted">{eyebrow}</div>}
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* Feedback ---------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-muted", className)} />;
}

export function Alert({ tone = "info", title, children, action, className }: { tone?: "info" | "good" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const styles = {
    info: "bg-brand-50 border-brand-100 text-brand-800",
    good: "bg-good-bg border-good-line text-good",
    warn: "bg-warn-bg border-warn-line text-warn",
    bad: "bg-bad-bg border-bad-line text-bad",
  }[tone];
  const Icon = { info: Info, good: CheckCircle2, warn: TriangleAlert, bad: AlertCircle }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg border px-3.5 py-3 text-[13.5px]", styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx(!!title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-subtle text-muted [&>svg]:size-5">{icon}</div>
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13.5px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-ink/[0.06]", className)} />;
}

/* Data display ------------------------------------------------------------ */

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "brand" | "good" | "warn" | "bad"; children: ReactNode; className?: string }) {
  const styles = {
    neutral: "bg-ink/[0.05] text-ink-2 ring-ink/[0.06]",
    brand: "bg-brand-50 text-brand-700 ring-brand-100",
    good: "bg-good-bg text-good ring-good-line",
    warn: "bg-warn-bg text-warn ring-warn-line",
    bad: "bg-bad-bg text-bad ring-bad-line",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset", styles, className)}>{children}</span>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px] tracking-tight", className)}>{children}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const parts = name.trim().split(/\s+/);
  const text = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800",
        size === "sm" ? "size-7 text-[11px]" : "size-9 text-[12.5px]",
      )}
      aria-hidden
    >
      {text}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("whitespace-nowrap border-b border-line bg-subtle px-5 py-2.5 text-[12px] font-medium text-muted", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-5 py-3 align-middle", className)}>{children}</td>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[13px] text-muted">
      <span className="tabular">
        {from} to {to} of {total.toLocaleString()}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
            o.value === value ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cx("tabular text-[12px]", o.value === value ? "text-muted" : "text-faint")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
