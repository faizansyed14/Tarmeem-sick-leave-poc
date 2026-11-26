"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  RotateCw,
  Search,
  Send,
  ShieldAlert,
  UserPlus,
  UserRoundSearch,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AddCustomerModal } from "@/components/add-customer";
import { useAuth } from "@/components/auth";
import { StatusBadge } from "@/components/brand";
import { Modal } from "@/components/modal";
import { OtpInput } from "@/components/otp-input";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, CardHeader, Field, Input, Mono, Skeleton, Spinner, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtBytes, fmtDate, fmtDateTime, mmss, timeAgo } from "@/lib/format";
import { useDebounced, useNow, useResource } from "@/lib/hooks";
import type { Customer, LeaveDetail, Paged } from "@/lib/types";

export default function LeaveDetailPage() {
  return (
    <Suspense>
      <Detail />
    </Suspense>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { data: leave, setData: setLeave, error, reload } = useResource<LeaveDetail>(`/leaves/${id}`);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(params.get("new") === "1");

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!leave)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );

  const update = (l: LeaveDetail) => {
    setLeave(l);
    if (l.dev_code) setDevCode(l.dev_code);
  };
  const locked = leave.status === "verified";

  return (
    <>
      <Link href="/leaves" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Sick leaves
      </Link>

      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{leave.customer?.full_name ?? leave.patient_name ?? "Unknown patient"}</h1>
            <StatusBadge status={leave.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <Mono className="text-ink-2">{leave.reference}</Mono>
            <span className="text-line-strong">/</span>
            <span>
              Uploaded {timeAgo(leave.created_at)}
              {leave.uploaded_by && ` by ${leave.uploaded_by}`}
            </span>
          </div>
        </div>
        <a href={`/api/leaves/${leave.id}/file`} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[13.5px] font-medium shadow-card hover:bg-subtle">
          <ExternalLink className="size-4" /> Open document
        </a>
      </div>

      {showIntro && (
        <Alert
          tone={leave.customer ? "good" : "warn"}
          className="mb-6"
          title={leave.customer ? "Certificate read and matched" : "Certificate read, customer needs confirming"}
          action={
            <button onClick={() => setShowIntro(false)} className="self-start opacity-70 hover:opacity-100" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          }
        >
          {leave.customer
            ? `Linked to ${leave.customer.full_name} by ${leave.match_method === "emirates_id" ? "Emirates ID" : "name"}. Review the details, then send the verification code.`
            : leave.candidates.length
              ? "We found possible customers. Choose the correct one below before sending a code."
              : "No customer in the register matched this certificate. Search for the customer or correct the extracted details."}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <CertificateCard leave={leave} locked={locked} onUpdate={update} />
          <CustomerCard leave={leave} locked={locked} onUpdate={update} />
          <DocumentCard leave={leave} />
        </div>
        <div className="lg:sticky lg:top-8 lg:self-start">
          <VerificationPanel leave={leave} devCode={devCode} onUpdate={update} reload={reload} />
        </div>
      </div>
    </>
  );
}

/* Certificate ------------------------------------------------------------- */

function Value({ label, value, mono, wide }: { label: string; value: ReactNode; mono?: boolean; wide?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cx("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cx("mt-1 truncate text-[14px]", empty ? "text-faint" : "font-medium text-ink", mono && !empty && "font-mono text-[13.5px] tracking-tight")}>
        {empty ? "Not found" : value}
      </dd>
    </div>
  );
}

function CertificateCard({ leave, locked, onUpdate }: { leave: LeaveDetail; locked: boolean; onUpdate: (l: LeaveDetail) => void }) {
  const e = leave.extracted;
  const [open, setOpen] = useState(false);
  const found = [e.patient_name, e.emirates_id, e.start_date, e.end_date, e.days, e.facility, e.doctor, e.certificate_no].filter(Boolean).length;

  return (
    <Card>
      <CardHeader
        title="Certificate details"
        description={
          leave.extraction_method === "ocr"
            ? `${found} of 8 fields read with OCR from a scanned PDF. Check them against the document.`
            : `${found} of 8 fields read from ${leave.file_type === "pdf" ? "the PDF" : "the Word document"}`
        }
        action={
          !locked && (
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setOpen(true)}>
              Correct
            </Button>
          )
        }
      />
      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3">
        <Value label="Patient name" value={e.patient_name} />
        <Value label="Emirates ID" value={e.emirates_id} mono />
        <Value label="Certificate number" value={e.certificate_no} mono />
        <Value label="Leave from" value={e.start_date && fmtDate(e.start_date)} />
        <Value label="Leave to" value={e.end_date && fmtDate(e.end_date)} />
        <Value label="Number of days" value={e.days && `${e.days} ${e.days === 1 ? "day" : "days"}`} />
        <Value label="Doctor" value={e.doctor} />
        <Value label="Facility" value={e.facility} />
        <Value label="Issued on" value={e.issue_date && fmtDate(e.issue_date)} />
      </dl>
      <CorrectModal open={open} onClose={() => setOpen(false)} leave={leave} onUpdate={onUpdate} />
    </Card>
  );
}

function CorrectModal({ open, onClose, leave, onUpdate }: { open: boolean; onClose: () => void; leave: LeaveDetail; onUpdate: (l: LeaveDetail) => void }) {
  const [name, setName] = useState(leave.extracted.patient_name ?? "");
  const [eid, setEid] = useState(leave.extracted.emirates_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setName(leave.extracted.patient_name ?? "");
      setEid(leave.extracted.emirates_id ?? "");
      setError(null);
    }
  }, [open, leave]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const l = await api<LeaveDetail>(`/leaves/${leave.id}/fields`, { method: "PATCH", body: { patient_name: name, emirates_id: eid } });
      onUpdate(l);
      toast.success("Details updated", "Matching was run again with the corrected values.");
      onClose();
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
      title="Correct extracted details"
      description="Fix the name or Emirates ID if the document was read incorrectly. Customer suggestions are refreshed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save and rematch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Patient name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Emirates ID" hint="15 digits starting with 784">
          <Input value={eid} onChange={(e) => setEid(e.target.value)} className="font-mono" placeholder="784-0000-0000000-0" />
        </Field>
      </div>
    </Modal>
  );
}

/* Customer ---------------------------------------------------------------- */

function Compare({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const same = !!a && !!b && norm(a) === norm(b);
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {!a ? (
        <span className="grid size-4 place-items-center rounded-full bg-ink/[0.06] text-faint">
          <span className="size-1 rounded-full bg-current" />
        </span>
      ) : same ? (
        <span className="grid size-4 place-items-center rounded-full bg-good text-white">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="grid size-4 place-items-center rounded-full bg-warn text-white">
          <X className="size-2.5" strokeWidth={3} />
        </span>
      )}
      <span className="text-ink-2">
        {label} {!a ? "not on certificate" : same ? "matches" : "differs from certificate"}
      </span>
    </div>
  );
}

function CustomerCard({ leave, locked, onUpdate }: { leave: LeaveDetail; locked: boolean; onUpdate: (l: LeaveDetail) => void }) {
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<number | "unlink" | null>(null);
  const [pending, setPending] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const c = leave.customer;
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const certEid = digits(leave.extracted.emirates_id);
  const eidMismatch = (customer: Customer | null) => !!customer && !!certEid && digits(customer.emirates_id) !== certEid;

  const link = async (customer: Customer, confirmed = false) => {
    if (eidMismatch(customer) && !confirmed) {
      setPending(customer);
      return;
    }
    setBusy(customer.id);
    try {
      const l = await api<LeaveDetail>(`/leaves/${leave.id}/link`, { body: { customer_id: customer.id, confirm_mismatch: confirmed } });
      onUpdate(l);
      setChanging(false);
      setPending(null);
      toast.success("Customer linked", customer.full_name);
    } catch (err) {
      toast.error("Could not link customer", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    try {
      onUpdate(await api<LeaveDetail>(`/leaves/${leave.id}/unlink`, { method: "POST" }));
    } catch (err) {
      toast.error("Could not unlink", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const methodLabel =
    leave.match_method === "emirates_id" ? "Matched by Emirates ID" : leave.match_method === "name" ? "Matched by name" : leave.match_method === "manual" ? "Selected manually" : null;

  return (
    <Card>
      <CardHeader
        title="Customer"
        description={c ? "The register record this certificate belongs to" : "Link this certificate to a customer in the register"}
        action={
          c &&
          !locked &&
          !changing && (
            <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
              Change
            </Button>
          )
        }
      />
      {c && !changing ? (
        <div className="p-5">
          <div className="flex items-start gap-4">
            <Avatar name={c.full_name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/customers/${c.id}`} className="text-[15px] font-semibold hover:text-brand-700 hover:underline hover:underline-offset-2">
                  {c.full_name}
                </Link>
                {methodLabel && <Badge tone={leave.match_method === "emirates_id" ? "good" : "brand"}>{methodLabel}</Badge>}
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-3">
                <div className="flex items-center gap-2 text-ink-2">
                  <BadgeCheck className="size-4 shrink-0 text-faint" />
                  <Mono>{c.emirates_id}</Mono>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-ink-2">
                  <Mail className="size-4 shrink-0 text-faint" />
                  <span className="truncate">{c.email ?? <span className="text-bad">No email</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-ink-2">
                  <Phone className="size-4 shrink-0 text-faint" />
                  <span className="tabular">{c.phone ?? "No phone"}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-subtle px-4 py-3">
            <Compare label="Emirates ID" a={leave.extracted.emirates_id} b={c.emirates_id} />
            <Compare label="Name" a={leave.extracted.patient_name} b={c.full_name} />
          </div>
          {eidMismatch(c) && !locked && (
            <Alert
              tone="warn"
              className="mt-4"
              title="This may be the wrong customer"
              action={
                <Button size="sm" onClick={() => setChanging(true)} className="self-center">
                  Change
                </Button>
              }
            >
              The certificate belongs to Emirates ID <span className="font-mono">{leave.extracted.emirates_id}</span>, but this customer is{" "}
              <span className="font-mono">{c.emirates_id}</span>.
            </Alert>
          )}
        </div>
      ) : (
        <div className="p-5">
          {leave.candidates.filter((x) => x.customer.id !== c?.id).length > 0 && (
            <div className="mb-5">
              <div className="mb-2.5 text-[12.5px] font-medium text-muted">Suggested from the certificate</div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {leave.candidates
                  .filter((x) => x.customer.id !== c?.id)
                  .map((cand) => (
                    <li key={cand.customer.id} className="flex items-center gap-4 px-4 py-3">
                      <ScoreRing score={cand.score} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{cand.customer.full_name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
                          <Mono>{cand.customer.emirates_id}</Mono>
                          <span>{cand.note}</span>
                        </div>
                      </div>
                      <Button size="sm" variant={cand.score >= 90 ? "primary" : "secondary"} loading={busy === cand.customer.id} onClick={() => link(cand.customer)}>
                        Link
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <CustomerSearch onPick={link} busyId={typeof busy === "number" ? busy : null} excludeId={c?.id} />
          {user.role === "admin" && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[13px] text-muted">Not in the register? Create the customer from this certificate.</span>
              <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>
                Add as new customer
              </Button>
            </div>
          )}
          <AddCustomerModal
            open={adding}
            onClose={() => setAdding(false)}
            initial={{ emirates_id: leave.extracted.emirates_id, full_name: leave.extracted.patient_name }}
            submitLabel="Add and link"
            onCreated={async (customer, warnings) => {
              setAdding(false);
              if (warnings[0]) toast.success("Customer added", warnings[0]);
              await link(customer);
            }}
          />
          {changing && (
            <div className="mt-5 flex justify-between border-t border-line pt-4">
              <Button size="sm" variant="danger" loading={busy === "unlink"} onClick={unlink}>
                Remove link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Emirates ID does not match"
        description="Linking the wrong customer sends the verification code to the wrong person."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === pending?.id} onClick={() => pending && link(pending, true)}>
              Link anyway
            </Button>
          </>
        }
      >
        {pending && (
          <div className="overflow-hidden rounded-xl border border-line text-[13.5px]">
            <div className="grid grid-cols-[120px_1fr] gap-y-1 border-b border-line bg-subtle px-4 py-3">
              <span className="text-muted">Certificate</span>
              <span className="font-medium">{leave.extracted.patient_name ?? "Name not found"}</span>
              <span />
              <Mono className="text-ink-2">{leave.extracted.emirates_id}</Mono>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-y-1 px-4 py-3">
              <span className="text-muted">Customer</span>
              <span className="font-medium">{pending.full_name}</span>
              <span />
              <Mono className="text-bad">{pending.emirates_id}</Mono>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 15;
  const len = 2 * Math.PI * r;
  const tone = score >= 90 ? "text-good" : score >= 75 ? "text-brand-500" : "text-warn";
  return (
    <div className="relative grid size-10 shrink-0 place-items-center" title={`${Math.round(score)}% match`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-ink/[0.07]" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * len} ${len}`} className={tone} />
      </svg>
      <span className="tabular text-[11px] font-semibold">{Math.round(score)}</span>
    </div>
  );
}

function CustomerSearch({ onPick, busyId, excludeId }: { onPick: (c: Customer) => void; busyId: number | null; excludeId?: number }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 250);
  const [results, setResults] = useState<Customer[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<Paged<Customer>>(`/customers?q=${encodeURIComponent(term)}&page_size=6`)
      .then((r) => !cancelled && setResults(r.items))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [term]);

  return (
    <div>
      <div className="mb-2.5 text-[12.5px] font-medium text-muted">Search the register</div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Emirates ID, email or phone" className="pl-9" />
        {loading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {results && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {results.filter((r) => r.id !== excludeId).length === 0 ? (
            <li className="flex items-center gap-2 px-4 py-4 text-[13.5px] text-muted">
              <UserRoundSearch className="size-4" /> No customers found for “{term}”
            </li>
          ) : (
            results
              .filter((r) => r.id !== excludeId)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{r.full_name}</div>
                    <div className="text-[12.5px] text-muted">
                      <Mono>{r.emirates_id}</Mono>
                      {r.email && <span className="ml-3">{r.email}</span>}
                    </div>
                  </div>
                  <Button size="sm" loading={busyId === r.id} onClick={() => onPick(r)}>
                    Link
                  </Button>
                </li>
              ))
          )}
        </ul>
      )}
    </div>
  );
}

/* Document ---------------------------------------------------------------- */

function DocumentCard({ leave }: { leave: LeaveDetail }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"preview" | "text">(leave.file_type === "pdf" ? "preview" : "text");
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <div className="grid size-9 place-items-center rounded-lg border border-line bg-subtle">
          <FileText className="size-4 text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{leave.original_filename}</div>
          <div className="text-[12.5px] text-muted">
            {leave.file_type.toUpperCase()} · {fmtBytes(leave.file_size)}
          </div>
        </div>
        <ChevronDown className={cx("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line">
          {leave.file_type === "pdf" && (
            <div className="flex gap-1 px-5 pt-3">
              {(["preview", "text"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium", tab === t ? "bg-ink/[0.06] text-ink" : "text-muted hover:text-ink")}>
                  {t === "preview" ? "Preview" : leave.extraction_method === "ocr" ? "OCR text" : "Extracted text"}
                </button>
              ))}
            </div>
          )}
          <div className="p-5">
            {tab === "preview" && leave.file_type === "pdf" ? (
              <iframe src={`/api/leaves/${leave.id}/file`} title="Certificate preview" className="h-[640px] w-full rounded-lg border border-line bg-subtle" />
            ) : (
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-subtle p-4 font-mono text-[12.5px] leading-relaxed text-ink-2">
                {leave.text_preview || "No text could be read from this document."}
              </pre>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* Verification ------------------------------------------------------------ */

function VerificationPanel({
  leave,
  devCode,
  onUpdate,
  reload,
}: {
  leave: LeaveDetail;
  devCode: string | null;
  onUpdate: (l: LeaveDetail) => void;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otp = leave.otp;
  const now = useNow(1000, !!otp && leave.status !== "verified");

  const remaining = otp ? Math.max(0, (new Date(otp.expires_at).getTime() - now) / 1000) : 0;
  const total = otp ? (new Date(otp.expires_at).getTime() - new Date(otp.sent_at).getTime()) / 1000 : 300;
  const cooldown = otp ? Math.max(0, Math.ceil((new Date(otp.sent_at).getTime() + 30_000 - now) / 1000)) : 0;
  const active = !!otp && otp.active && remaining > 0 && otp.attempts_remaining > 0;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const l = await api<LeaveDetail>(`/leaves/${leave.id}/otp/send`, { method: "POST" });
      onUpdate(l);
      setCode("");
      toast.success(otp ? "New code sent" : "Code sent", `Emailed to ${l.otp?.sent_to}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setVerifying(true);
    setError(null);
    try {
      const l = await api<LeaveDetail>(`/leaves/${leave.id}/otp/verify`, { body: { code: value } });
      onUpdate(l);
      toast.success("Certificate verified", `${l.customer?.full_name} confirmed the code.`);
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      reload();
    } finally {
      setVerifying(false);
    }
  };

  if (leave.status === "verified") {
    return (
      <Card className="overflow-hidden">
        <div className="border-b border-good-line bg-good-bg px-5 py-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-good text-white shadow-[0_0_0_6px_rgb(21_115_71/0.12)]">
            <Check className="size-6" strokeWidth={2.5} />
          </div>
          <div className="text-[16px] font-semibold text-good">Verified</div>
          <p className="mt-1 text-[13px] text-good/80">The customer confirmed this certificate.</p>
        </div>
        <dl className="space-y-3 px-5 py-4 text-[13.5px]">
          <Row label="Verified by" value={leave.verified_by ?? "Unknown"} />
          <Row label="Verified on" value={fmtDateTime(leave.verified_at)} />
          <Row label="Code sent to" value={otp?.sent_to ?? ""} />
        </dl>
        <SendSheet leave={leave} onUpdate={onUpdate} />
      </Card>
    );
  }

  const customer = leave.customer;

  return (
    <Card>
      <CardHeader title="Verification" description="Confirm the certificate with the customer by phone" />
      <div className="space-y-5 p-5">
        <Steps step={!customer ? 1 : active ? 3 : 2} />

        {error && <Alert tone="bad">{error}</Alert>}

        {!customer ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[13.5px] text-muted">Link a customer to this certificate to start verification.</div>
        ) : !customer.email ? (
          <Alert tone="warn" title="No email on file">
            {customer.full_name} has no email address in the register, so a code cannot be sent. Update the source data and import it again.
          </Alert>
        ) : active ? (
          <>
            <div className="rounded-xl border border-line bg-subtle p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 text-ink-2">
                  <Mail className="size-4 text-faint" /> Sent to <span className="font-medium text-ink">{otp!.sent_to}</span>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12.5px]">
                <span className="text-muted">Expires in</span>
                <span className={cx("tabular font-semibold", remaining < 60 ? "text-bad" : "text-ink")}>{mmss(remaining)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                <div className={cx("h-full rounded-full transition-[width] duration-1000 ease-linear", remaining < 60 ? "bg-bad" : "bg-brand-600")} style={{ width: `${(remaining / total) * 100}%` }} />
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <PhoneCall className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <div className="text-[13px] leading-relaxed text-brand-800">
                Call <span className="font-semibold">{customer.full_name.split(" ")[0]}</span>
                {customer.phone ? (
                  <>
                    {" "}on <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="tabular font-semibold underline underline-offset-2">{customer.phone}</a>
                  </>
                ) : null}{" "}
                and ask them to read out the 6 digit code from their email.
              </div>
            </div>

            {devCode && (
              <Alert tone="warn" title="Development mode">
                Email delivery is not configured, so no email was sent. The code is <span className="font-mono font-semibold tracking-wider">{devCode}</span>
              </Alert>
            )}

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-[13px] font-medium text-ink-2">Code from the customer</label>
                <span className="text-[12px] text-muted">
                  {otp!.attempts_remaining} {otp!.attempts_remaining === 1 ? "attempt" : "attempts"} left
                </span>
              </div>
              <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={verifying} invalid={!!error} />
            </div>

            <Button variant="primary" size="lg" className="w-full" disabled={code.length !== 6} loading={verifying} onClick={() => verify()} icon={<BadgeCheck className="size-4" />}>
              Verify certificate
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[13px] text-muted">
              Customer did not receive it?
              <button onClick={send} disabled={cooldown > 0 || sending} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800 disabled:text-faint">
                {sending ? <Spinner className="size-3.5" /> : <RotateCw className="size-3.5" />}
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </>
        ) : (
          <>
            {otp && !otp.verified && (
              <Alert tone="warn" title={otp.locked || otp.attempts_remaining === 0 ? "Too many incorrect attempts" : "The previous code is no longer valid"}>
                {otp.locked || otp.attempts_remaining === 0 ? "Send a new code and try again with the customer." : "Codes are valid for 5 minutes. Send a new one when you are ready to call."}
              </Alert>
            )}
            <div className="space-y-3 rounded-xl border border-line p-4 text-[13.5px]">
              <Row label="Send to" value={customer.email} icon={<Mail className="size-3.5" />} />
              <Row label="Call on" value={customer.phone ?? "No phone on file"} icon={<Phone className="size-3.5" />} />
              <Row label="Valid for" value="5 minutes" icon={<KeyRound className="size-3.5" />} />
            </div>
            <Button variant="primary" size="lg" className="w-full" loading={sending} disabled={cooldown > 0} onClick={send} icon={<Mail className="size-4" />}>
              {cooldown > 0 ? `Send again in ${cooldown}s` : otp ? "Send a new code" : "Send verification code"}
            </Button>
            <p className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              The code is sent to the customer by email. Never read the code to the customer; they must read it to you.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function SendSheet({ leave, onUpdate }: { leave: LeaveDetail; onUpdate: (l: LeaveDetail) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const certEid = digits(leave.extracted.emirates_id);
  const mismatch = !!certEid && !!leave.customer && digits(leave.customer.emirates_id) !== certEid;
  const to = leave.otp?.sent_to ?? "";

  const send = async (confirmed = false) => {
    if (mismatch && !confirmed) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const l = await api<LeaveDetail>(`/leaves/${leave.id}/sheet/send`, { body: { confirm_mismatch: confirmed } });
      onUpdate(l);
      toast.success("Sick leave sheet sent", `Emailed to ${l.sheet?.sent_to}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-line px-5 py-4">
      {error && <Alert tone="bad">{error}</Alert>}
      <Button variant={leave.sheet ? "secondary" : "primary"} size="lg" className="w-full" loading={busy} onClick={() => send()} icon={<Send className="size-4" />}>
        {leave.sheet ? "Send sheet again" : "Send sheet"}
      </Button>
      <p className="text-center text-[12.5px] leading-relaxed text-muted">
        {leave.sheet ? `Sent to ${leave.sheet.sent_to} on ${fmtDateTime(leave.sheet.sent_at)}` : `Emails the uploaded sick leave sheet to ${to}`}
      </p>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Emirates ID does not match"
        description="The certificate shows a different Emirates ID from this customer. Check the document before emailing it."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => send(true)}>
              Send anyway
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-2">
          The sheet will be emailed to <span className="font-medium text-ink">{to}</span> ({leave.customer?.full_name}).
        </p>
      </Modal>
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Link customer", "Send code", "Confirm"];
  return (
    <ol className="flex items-center gap-2">
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                done ? "bg-brand-600 text-white" : current ? "bg-brand-50 text-brand-700 ring-1 ring-brand-300" : "bg-ink/[0.05] text-faint",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            <span className={cx("truncate text-[12.5px]", current ? "font-medium text-ink" : "text-muted")}>{label}</span>
            {n < 3 && <span className="h-px min-w-3 flex-1 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
