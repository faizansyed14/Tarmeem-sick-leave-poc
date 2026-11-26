import Image from "next/image";
import { CheckCircle2, Clock3, CircleDashed } from "lucide-react";
import type { LeaveStatus } from "@/lib/types";
import { Badge, cx } from "./ui";

export function BrandMark({
  className,
  inverted,
  compact,
}: {
  className?: string;
  inverted?: boolean;
  compact?: boolean;
}) {
  const imageSize = compact ? "h-9 w-auto" : inverted ? "w-[164px] h-auto" : "w-[140px] h-auto";
  return (
    <span
      className={cx(
        "inline-flex w-fit shrink-0 items-center justify-start self-start",
        inverted && "rounded-lg bg-white px-2.5 py-1.5 shadow-sm",
        className,
      )}
    >
      <Image
        src="/tarmeem-logo.png"
        alt="Tarmeem"
        width={322}
        height={139}
        className={cx("object-contain object-left", imageSize)}
        priority
      />
    </span>
  );
}

export function BrandLockup({
  subtitle,
  inverted,
  className,
}: {
  subtitle?: string;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex w-fit flex-col items-start gap-0.5", className)}>
      <BrandMark inverted={inverted} />
      {subtitle ? (
        <div className={cx("text-[11.5px]", inverted ? "text-brand-200" : "text-muted")}>{subtitle}</div>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: LeaveStatus }) {
  if (status === "verified")
    return (
      <Badge tone="good">
        <CheckCircle2 className="size-3" /> Verified
      </Badge>
    );
  if (status === "awaiting_otp")
    return (
      <Badge tone="warn">
        <Clock3 className="size-3" /> Awaiting code
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <CircleDashed className="size-3" /> Not verified
    </Badge>
  );
}
