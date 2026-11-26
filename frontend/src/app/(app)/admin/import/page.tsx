"use client";

import { CheckCircle2, Download, FileSpreadsheet, Loader2, Sheet, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Mono, PageHeader, Segmented, Table, Td, Th, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { ImportBatch, ImportPreview, ImportRow } from "@/lib/types";
import { AdminOnly } from "../guard";

type RowFilter = "all" | "new" | "existing" | "duplicate_in_file" | "invalid" | "warnings";

const STATUS: Record<ImportRow["status"], { label: string; tone: "good" | "neutral" | "brand" | "warn" | "bad" }> = {
  new: { label: "New", tone: "good" },
  exists: { label: "Already in register", tone: "neutral" },
  exists_changed: { label: "Details changed", tone: "brand" },
  duplicate_in_file: { label: "Duplicate in file", tone: "warn" },
  invalid: { label: "Invalid", tone: "bad" },
};

export default function ImportPage() {
  return (
    <AdminOnly>
      <Importer />
    </AdminOnly>
  );
}

function Importer() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; invalid: number } | null>(null);
  const history = useResource<{ items: ImportBatch[] }>("/customers/imports");

  const analyse = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      setPreview(await api<ImportPreview>("/customers/import/preview", { form }));
      setFilter("all");
      setUpdateExisting(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const r = await api<{ inserted: number; updated: number; skipped: number; invalid: number }>("/customers/import/commit", {
        body: { token: preview.token, update_existing: updateExisting },
      });
      setResult(r);
      setPreview(null);
      history.reload();
      toast.success("Import complete", `${r.inserted} added, ${r.updated} updated`);
    } catch (err) {
      setError(errorMessage(err));
      setPreview(null);
    } finally {
      setCommitting(false);
    }
  };

  const rows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "existing") return r.status === "exists" || r.status === "exists_changed";
      if (filter === "warnings") return r.warnings.length > 0 && r.status !== "invalid";
      return r.status === filter;
    });
  }, [preview, filter]);

  const s = preview?.summary;
  const toWrite = s ? s.new + (updateExisting ? s.exists_changed : 0) : 0;

  return (
    <>
      <PageHeader
        title="Import customers"
        description="Upload the spreadsheet exported from the main customer database. Rows are checked for duplicates and errors before anything is saved."
        actions={
          <a href="/api/customers/template" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[13.5px] font-medium shadow-card hover:bg-subtle">
            <Download className="size-4" /> Download template
          </a>
        }
      />

      {error && <Alert tone="bad" className="mb-5">{error}</Alert>}

      {result && (
        <Alert tone="good" className="mb-5" title="Customers imported">
          {result.inserted} added, {result.updated} updated, {result.skipped} skipped as duplicates and {result.invalid} invalid rows ignored.{" "}
          <Link href="/customers" className="font-medium underline underline-offset-2">
            View the register
          </Link>
        </Alert>
      )}

      {!preview ? (
        <Card className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDrag(false);
              analyse(e.dataTransfer.files?.[0]);
            }}
            onClick={() => !busy && input.current?.click()}
            role="button"
            tabIndex={0}
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-6 py-14 text-center transition-colors",
              drag ? "border-brand-500 bg-brand-50" : "border-line-strong bg-subtle hover:border-faint",
            )}
          >
            <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-surface text-brand-600 shadow-card">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
            </div>
            <div className="text-[15px] font-medium">{busy ? "Checking the spreadsheet" : "Drop an Excel or CSV file, or click to browse"}</div>
            <div className="mt-1.5 text-[13px] text-muted">
              Columns needed: <span className="text-ink-2">Emirates ID, Name, Email, Phone</span>. Header names are detected automatically.
            </div>
          </div>
          <input ref={input} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => analyse(e.target.files?.[0])} />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-brand-600" /> {preview.filename}
              </span>
            }
            description={`${s!.total} rows checked. Nothing has been saved yet.`}
            action={
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setPreview(null)}>
                Discard
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
            {[
              ["New customers", s!.new, "text-good"],
              ["Already in register", s!.exists + s!.exists_changed, "text-ink"],
              ["Changed details", s!.exists_changed, "text-brand-600"],
              ["Duplicates in file", s!.duplicate_in_file, "text-warn"],
              ["Invalid rows", s!.invalid, "text-bad"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="bg-surface px-5 py-4">
                <div className="text-[12.5px] text-muted">{label}</div>
                <div className={cx("tabular mt-1 text-[22px] font-semibold tracking-tight", (n as number) > 0 ? (tone as string) : "text-faint")}>{n}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto px-5 py-4">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: s!.total },
                { value: "new", label: "New", count: s!.new },
                { value: "existing", label: "Existing", count: s!.exists + s!.exists_changed },
                { value: "duplicate_in_file", label: "Duplicates", count: s!.duplicate_in_file },
                { value: "invalid", label: "Invalid", count: s!.invalid },
                { value: "warnings", label: "Warnings", count: s!.with_warnings },
              ]}
            />
          </div>

          <div className="max-h-[480px] overflow-auto border-y border-line">
            <Table>
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th className="w-14">Row</Th>
                  <Th>Customer</Th>
                  <Th>Emirates ID</Th>
                  <Th className="hidden lg:table-cell">Contact</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={cx(r.status === "invalid" && "bg-bad-bg/40", r.status === "duplicate_in_file" && "bg-warn-bg/40")}>
                    <Td className="tabular text-muted">{r.row}</Td>
                    <Td className="font-medium">{r.name || <span className="text-faint">Missing</span>}</Td>
                    <Td>
                      <Mono className={r.status === "invalid" && !r.emirates_id.startsWith("784") ? "text-bad" : "text-ink-2"}>{r.emirates_id || "Missing"}</Mono>
                    </Td>
                    <Td className="hidden text-[13px] text-ink-2 lg:table-cell">
                      <div>{r.email ?? <span className="text-faint">No email</span>}</div>
                      <div className="tabular text-muted">{r.phone}</div>
                    </Td>
                    <Td>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      {r.changes.length > 0 && <div className="mt-1 text-[12px] text-muted">Changed: {r.changes.join(", ")}</div>}
                      {[...r.errors, ...r.warnings].map((m) => (
                        <div key={m} className={cx("mt-1 text-[12px]", r.errors.includes(m) ? "text-bad" : "text-warn")}>
                          {m}
                        </div>
                      ))}
                    </Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[13.5px] text-muted">
                      No rows in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {s!.exists_changed > 0 ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="size-4 rounded accent-brand-600" />
                Update {s!.exists_changed} existing {s!.exists_changed === 1 ? "customer" : "customers"} with changed details
              </label>
            ) : (
              <span className="text-[13px] text-muted">Duplicate and invalid rows are skipped automatically.</span>
            )}
            <Button variant="primary" loading={committing} disabled={toWrite === 0} onClick={commit} icon={<CheckCircle2 className="size-4" />}>
              {toWrite === 0 ? "Nothing to import" : `Import ${toWrite} ${toWrite === 1 ? "customer" : "customers"}`}
            </Button>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Import history" description="The 20 most recent imports" />
        {history.data && history.data.items.length === 0 ? (
          <EmptyState icon={<Sheet />} title="No imports yet" description="Completed imports will be listed here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th className="hidden md:table-cell">Imported by</Th>
                <Th className="text-right">Added</Th>
                <Th className="text-right">Updated</Th>
                <Th className="hidden sm:table-cell text-right">Skipped</Th>
                <Th className="hidden sm:table-cell text-right">Invalid</Th>
                <Th className="text-right">Date</Th>
              </tr>
            </thead>
            <tbody>
              {history.data?.items.map((b) => (
                <tr key={b.id} className="[&:last-child>td]:border-0">
                  <Td className="font-medium">{b.filename}</Td>
                  <Td className="hidden text-ink-2 md:table-cell">{b.uploaded_by}</Td>
                  <Td className="tabular text-right">{b.inserted}</Td>
                  <Td className="tabular text-right">{b.updated}</Td>
                  <Td className="tabular hidden text-right text-muted sm:table-cell">{b.skipped}</Td>
                  <Td className="tabular hidden text-right text-muted sm:table-cell">{b.invalid}</Td>
                  <Td className="whitespace-nowrap text-right text-[13px] text-muted">{fmtDateTime(b.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
