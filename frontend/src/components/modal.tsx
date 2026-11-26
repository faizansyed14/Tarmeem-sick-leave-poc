"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button[data-autofocus]");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative w-full animate-rise rounded-2xl border border-line bg-surface shadow-pop",
          { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description && <p className="mt-1 text-[13.5px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 -mt-1 grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-subtle px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
