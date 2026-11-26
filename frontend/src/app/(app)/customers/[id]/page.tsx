"use client";

import { ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, ClipboardCheck, ExternalLink, FileText, Mail, Pencil, Phone, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CustomerFormModal } from "@/components/add-customer";
import { useAuth } from "@/components/auth";
import { StatusBadge } from "@/components/brand";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Button, ButtonLink, Card, EmptyState, Mono, Skeleton, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtRange, timeAgo } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Customer, LeaveDetail } from "@/lib/types";

type CustomerDetail = {
  customer: Customer;
  imported_from: string | null;
  stats: { total: number; verified: number; awaiting_otp: number; not_verified: number; days: number };
  leaves: LeaveDetail[];
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useResource<CustomerDetail>(`/customers/${id}`);
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );

  const { customer: c, stats, leaves } = data;
  const isAdmin = user.role === "admin";

  const remove = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      await api(`/customers/${c.id}`, { method: "DELETE" });
      toast.success("Customer deleted", c.full_name);
      router.push("/customers");
    } catch (err) {
      setDeleteError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>

      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={c.full_name} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{c.full_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="size-4 text-faint" />
              <Mono>{c.emirates_id}</Mono>
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="size-4 text-faint" />
              {c.email ?? <span className="text-bad">No email</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="size-4 text-faint" />
              {c.phone ? (
                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="tabular hover:text-ink">
                  {c.phone}
                </a>
              ) : (
                <span className="text-faint">No phone</span>
              )}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 gap-2">
            <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                setDeleteError(null);
                setDeleting(true);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <CustomerFormModal
        open={editing}
        onClose={() => setEditing(false)}
        customer={c}
        eidLocked={stats.verified > 0 ? "Locked: a verified certificate is linked to this Emirates ID" : null}
        onSaved={async (saved, warnings) => {
          setEditing(false);
          toast.success("Customer updated", warnings[0] ?? saved.full_name);
          await reload();
        }}
      />

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={stats.total > 0 ? "This customer cannot be deleted" : "Delete customer"}
        size="sm"
        footer={
          stats.total > 0 ? (
            <Button variant="primary" onClick={() => setDeleting(false)} data-autofocus>
              OK
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setDeleting(false)} data-autofocus>
                Cancel
              </Button>
              <Button variant="danger" loading={busy} onClick={remove} icon={<Trash2 className="size-3.5" />}>
                Delete customer
              </Button>
            </>
          )
        }
      >
        {deleteError && <Alert tone="bad" className="mb-3">{deleteError}</Alert>}
        {stats.total > 0 ? (
          <p className="text-[13.5px] text-ink-2">
            {c.full_name} has {stats.total} sick leave {stats.total === 1 ? "certificate" : "certificates"} linked. Certificates are kept as a permanent record, so this customer stays in the register. You can still edit their details.
          </p>
        ) : (
          <p className="text-[13.5px] text-ink-2">
            <span className="font-medium text-ink">{c.full_name}</span> (<span className="font-mono">{c.emirates_id}</span>) will be removed from the register. This cannot be undone, but the deletion is recorded in the audit log.
          </p>
        )}
      </Modal>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Certificates" value={stats.total} />
        <Stat label="Verified" value={stats.verified} tone={stats.verified ? "text-good" : undefined} />
        <Stat label="Not verified" value={stats.not_verified + stats.awaiting_otp} foot={stats.awaiting_otp ? `${stats.awaiting_otp} awaiting code` : undefined} />
        <Stat label="Total sick days" value={stats.days} />
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Sick leave history</h2>
        <span className="text-[12.5px] text-muted">Newest first</span>
      </div>

      {leaves.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck />} title="No sick leaves" description="No certificate has been linked to this customer yet." />
        </Card>
      ) : (
        <ol className="space-y-4">
          {leaves.map((l) => (
            <LeaveCard key={l.id} leave={l} customer={c} />
          ))}
        </ol>
      )}

      <p className="mt-6 text-[12.5px] text-faint">
        In the register since {fmtDate(c.created_at)}
        {data.imported_from && `, imported from ${data.imported_from}`}.
      </p>
    </>
  );
}

function Stat({ label, value, foot, tone }: { label: string; value: number; foot?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={cx("tabular mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.03em]", tone)}>{value}</div>
      <div className="mt-2 text-[12px] text-muted">{foot ?? " "}</div>
    </div>
  );
}

function LeaveCard({ leave: l, customer }: { leave: LeaveDetail; customer: Customer }) {
  const e = l.extracted;
  const eidMismatch = !!e.emirates_id && digits(e.emirates_id) !== digits(customer.emirates_id);
  const nameDiffers = !!e.patient_name && e.patient_name.toLowerCase().replace(/\s+/g, " ") !== customer.full_name.toLowerCase().replace(/\s+/g, " ");

  return (
    <li>
      <Card className={cx(eidMismatch && "border-warn-line")}>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-subtle">
              <FileText className="size-4 text-brand-600" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-[13.5px] font-medium text-ink">{l.reference}</Mono>
                <StatusBadge status={l.status} />
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                <CalendarDays className="size-3.5" />
                <span className="tabular">{fmtRange(e.start_date, e.end_date)}</span>
                {e.days ? <span>· {e.days} {e.days === 1 ? "day" : "days"}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={`/api/leaves/${l.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
            >
              <ExternalLink className="size-3.5" /> Document
            </a>
            <ButtonLink href={`/leaves/${l.id}`} size="sm" icon={<ArrowUpRight className="size-3.5" />}>
              Open
            </ButtonLink>
          </div>
        </div>

        {eidMismatch && (
          <div className="flex gap-2.5 border-b border-warn-line bg-warn-bg px-5 py-3 text-[13px] text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              This certificate is for <span className="font-medium">{e.patient_name ?? "another patient"}</span> (<span className="font-mono">{e.emirates_id}</span>), not this customer. It was linked manually.
            </span>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Item label="Name on certificate" value={e.patient_name} warn={nameDiffers && !eidMismatch} />
          <Item label="Emirates ID on certificate" value={e.emirates_id} mono warn={eidMismatch} />
          <Item label="Certificate number" value={e.certificate_no} mono />
          <Item label="Issued on" value={e.issue_date && fmtDate(e.issue_date)} />
          <Item label="Doctor" value={e.doctor} />
          <Item label="Facility" value={e.facility} wide />
          <Item label="Uploaded" value={`${timeAgo(l.created_at)}${l.uploaded_by ? ` by ${l.uploaded_by}` : ""}`} />
        </dl>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-b-xl border-t border-line bg-subtle px-5 py-3 text-[13px]">
          {l.status === "verified" ? (
            <span className="text-good">
              Verified {fmtDateTime(l.verified_at)}
              {l.verified_by && ` by ${l.verified_by}`}
            </span>
          ) : l.status === "awaiting_otp" ? (
            <span className="text-warn">Code sent to {l.otp?.sent_to}, waiting for the customer to confirm</span>
          ) : (
            <span className="text-muted">{l.otp ? "Previous code expired or was not confirmed" : "No verification code sent yet"}</span>
          )}
          {l.otp && l.status === "verified" && <span className="text-muted">Code sent to {l.otp.sent_to}</span>}
        </div>
      </Card>
    </li>
  );
}

function Item({ label, value, mono, wide, warn }: { label: string; value: ReactNode; mono?: boolean; wide?: boolean; warn?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cx("min-w-0", wide && "lg:col-span-2")}>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={cx("mt-0.5 truncate text-[13.5px]", empty ? "text-faint" : warn ? "font-medium text-warn" : "font-medium text-ink", mono && !empty && "font-mono text-[13px] tracking-tight")}>
        {empty ? "Not found" : value}
      </dd>
    </div>
  );
}
