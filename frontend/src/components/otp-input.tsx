"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cx } from "./ui";

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const handleInput = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    if (!d) return;
    if (d.length > 1) {
      const clean = set(value.slice(0, i) + d);
      refs.current[Math.min(clean.length, length - 1)]?.focus();
      return;
    }
    const arr = digits.slice();
    arr[i] = d;
    const joined = arr.join("").slice(0, length);
    set(joined);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        const arr = digits.slice();
        arr[i] = "";
        onChange(arr.join("").replace(/\s/g, ""));
      } else if (i > 0) {
        const arr = digits.slice();
        arr[i - 1] = "";
        onChange(arr.join(""));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const clean = set(e.clipboardData.getData("text"));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
          className={cx(
            "tabular h-12 w-full min-w-0 max-w-12 rounded-lg border bg-surface text-center font-mono text-[20px] font-medium text-ink outline-none transition-[border,box-shadow]",
            "focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 disabled:bg-subtle disabled:text-muted",
            invalid ? "border-bad" : d ? "border-faint" : "border-line-strong",
            i === 2 && length === 6 && "mr-2",
          )}
        />
      ))}
    </div>
  );
}
