"use client";

import { FileText, FileUp, Loader2, PhoneCall, ScanText, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { Alert, Button, Card, PageHeader, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import type { LeaveDetail } from "@/lib/types";

const ACCEPT = ".pdf,.docx";

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setError("Choose a PDF or Word (.docx) file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("The file is larger than 10 MB.");
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const leave = await api<LeaveDetail>("/leaves/upload", { form });
      router.push(`/leaves/${leave.id}?new=1`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Upload certificate" description="Add a sick leave certificate. Its details are read automatically and matched to the customer register." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          {error && <Alert tone="bad" className="mb-5">{error}</Alert>}

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={cx(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-6 py-16 text-center transition-colors",
                drag ? "border-brand-500 bg-brand-50" : "border-line-strong bg-subtle hover:border-faint",
              )}
            >
              <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-surface text-brand-600 shadow-card">
                <FileUp className="size-5" />
              </div>
              <div className="text-[15px] font-medium">Drop the certificate here, or click to browse</div>
              <div className="mt-1.5 text-[13px] text-muted">PDF or Word document, up to 10 MB</div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-subtle p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface">
                  <FileText className="size-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{file.name}</div>
                  <div className="text-[12.5px] text-muted">
                    {file.name.toLowerCase().endsWith(".pdf") ? "PDF document" : "Word document"} · {fmtBytes(file.size)}
                  </div>
                </div>
                {!busy && (
                  <button onClick={() => setFile(null)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink" aria-label="Remove file">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {busy && (
                <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4 text-[13.5px] text-ink-2">
                  <Loader2 className="size-4 animate-spin text-brand-600" />
                  Reading the certificate and searching the customer register. Scanned documents take a few seconds longer.
                </div>
              )}
            </div>
          )}

          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

          <div className="mt-6 flex justify-end gap-2">
            {file && !busy && (
              <Button variant="ghost" onClick={() => input.current?.click()}>
                Choose another file
              </Button>
            )}
            <Button variant="primary" disabled={!file} loading={busy} onClick={upload}>
              Upload and extract
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-[14px] font-semibold">How verification works</h2>
          <ol className="mt-5 space-y-5">
            {[
              [<ScanText key="1" />, "Details are extracted", "Patient name, Emirates ID, leave dates, doctor and facility are read from the document."],
              [<UserCheck key="2" />, "The customer is matched", "Emirates ID is matched first, then the name. You confirm or choose the right customer."],
              [<PhoneCall key="3" />, "Confirmed by phone", "Send a one time code to the customer by email, call them, and enter the code they read back."],
            ].map(([icon, title, body], i) => (
              <li key={i} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 [&>svg]:size-4">{icon}</div>
                <div>
                  <div className="text-[13.5px] font-medium">{title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-4 text-[12.5px] text-muted">Scanned PDFs are read with OCR automatically. For the best results use a clear, upright scan; the original digital certificate is always most accurate.</p>
        </Card>
      </div>
    </>
  );
}
