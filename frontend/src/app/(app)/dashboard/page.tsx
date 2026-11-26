"use client";

import { ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, Clock3, FileUp, KeyRound, Link2Off, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth";
import { StatusBadge } from "@/components/brand";
import { Alert, ButtonLink, Card, CardHeader, EmptyState, Mono, Skeleton, Table, Td, Th } from "@/components/ui";
import { ACTION_LABELS, fmtRange, greeting, timeAgo } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Activity, LeaveSummary } from "@/lib/types";

type Dashboard = {
  stats: {
    total: number;
    verified: number;
    not_verified: number;
    awaiting_otp: number;
    unmatched: number;
    uploaded_this_week: number;
    verified_this_week: number;
    customers: number;
  };
  recent: LeaveSummary[];
  activity: Activity[];
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, loading, error } = useResource<Dashboard>("/dashboard");
  const s = data?.stats;
  const rate = s && s.total ? Math.round((s.verified / s.total) * 100) : 0;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai" });

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[13px] text-muted">{today}</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">
            {greeting()}, {user.full_name.split(" ")[0]}
          </h1>
        </div>
        <ButtonLink href="/leaves/upload" variant="primary" icon={<FileUp className="size-4" />}>
          Upload certificate
        </ButtonLink>
      </div>

      {user.must_change_password && (
        <Alert
          tone="warn"
          className="mb-6"
          title="You are using a temporary password"
          action={
            <Link href="/settings" className="shrink-0 self-center text-[13px] font-medium underline underline-offset-2">
              Change it now
            </Link>
          }
        >
          Set a personal password and connect an authenticator app to protect your account.
        </Alert>
      )}

      {error && <Alert tone="bad" className="mb-6">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Certificates" value={s?.total} foot={s ? `${s.uploaded_this_week} uploaded this week` : undefined} icon={<FileUp />} />
        <Stat label="Verified" value={s?.verified} foot={s ? `${s.verified_this_week} this week` : undefined} icon={<CheckCircle2 />} />
        <Stat label="Not verified" value={s?.not_verified} foot={s ? (s.unmatched ? `${s.unmatched} without a customer` : "All matched to a customer") : undefined} icon={<CircleDashed />} href="/leaves" />
        <Stat label="Awaiting code" value={s?.awaiting_otp} foot="Code sent, not yet confirmed" icon={<Clock3 />} href="/leaves?status=awaiting_otp" />
      </div>

      <Card className="mt-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="text-[13.5px]">
            <span className="font-medium text-ink">Verification progress</span>
            <span className="ml-2 text-muted">
              {s ? `${s.verified} of ${s.total} certificates confirmed with the patient` : "Loading"}
            </span>
          </div>
          <div className="tabular text-[13.5px] font-semibold">{rate}%</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.06]" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-700" style={{ width: `${rate}%` }} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="Recent certificates"
            description="The latest sick leave uploads across the team"
            action={
              <Link href="/leaves" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-800">
                View pending <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {loading && !data ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : data && data.recent.length === 0 ? (
            <EmptyState
              icon={<FileUp />}
              title="No certificates yet"
              description="Upload a sick leave certificate to extract its details and match it to a customer."
              action={<ButtonLink href="/leaves/upload" variant="primary">Upload certificate</ButtonLink>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Patient</Th>
                  <Th className="hidden md:table-cell">Leave period</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data?.recent.map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/leaves/${l.id}`)} className="cursor-pointer transition-colors hover:bg-subtle [&:last-child>td]:border-0">
                    <Td>
                      <Mono className="text-ink-2">{l.reference}</Mono>
                    </Td>
                    <Td>
                      <div className="font-medium">{l.customer?.full_name ?? l.patient_name ?? "Unknown patient"}</div>
                      {!l.customer && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-warn">
                          <Link2Off className="size-3" /> No customer linked
                        </div>
                      )}
                    </Td>
                    <Td className="tabular hidden text-ink-2 md:table-cell">{fmtRange(l.start_date, l.end_date)}</Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={user.role === "admin" ? "Team activity" : "Your activity"} />
            {data && data.activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13.5px] text-muted">No activity yet.</p>
            ) : (
              <ol className="px-5 py-2">
                {(data?.activity ?? []).map((a) => (
                  <li key={a.id} className="flex gap-3 border-b border-line py-3 last:border-0">
                    <ActivityIcon action={a.action} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px]">
                        <span className="font-medium">{ACTION_LABELS[a.action] ?? a.action}</span>
                        {a.user && <span className="text-muted"> by {a.user}</span>}
                      </div>
                      {a.detail && <div className="mt-0.5 truncate text-[12.5px] text-muted">{a.detail}</div>}
                    </div>
                    <time className="shrink-0 text-[12px] text-faint">{timeAgo(a.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Link href="/customers" className="group flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 shadow-card transition-colors hover:border-line-strong">
            <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Users className="size-[18px]" />
            </div>
            <div className="flex-1">
              <div className="tabular text-[18px] font-semibold tracking-tight">{s?.customers.toLocaleString() ?? "0"}</div>
              <div className="text-[12.5px] text-muted">Customers in the register</div>
            </div>
            <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-ink" />
          </Link>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, foot, icon, href }: { label: string; value?: number; foot?: string; icon: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className="text-faint [&>svg]:size-4">{icon}</span>
      </div>
      {value === undefined ? <Skeleton className="mt-3 h-8 w-16" /> : <div className="tabular mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em]">{value.toLocaleString()}</div>}
      <div className="mt-3 truncate text-[12.5px] text-muted">{foot ?? " "}</div>
    </>
  );
  const cls = "block rounded-xl border border-line bg-surface p-5 shadow-card";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ActivityIcon({ action }: { action: string }) {
  const map: Record<string, ReactNode> = {
    leave_verified: <CheckCircle2 className="size-3.5 text-good" />,
    otp_sent: <KeyRound className="size-3.5 text-warn" />,
    otp_resent: <KeyRound className="size-3.5 text-warn" />,
    leave_uploaded: <FileUp className="size-3.5 text-brand-600" />,
  };
  return <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-subtle ring-1 ring-line">{map[action] ?? <CircleDashed className="size-3.5 text-muted" />}</div>;
}
