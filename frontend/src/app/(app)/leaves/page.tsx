"use client";

import { CheckCircle2, ClipboardCheck, FileText, FileUp, Link2Off, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StatusBadge } from "@/components/brand";
import { Alert, ButtonLink, Card, EmptyState, Input, Mono, PageHeader, Pagination, Segmented, Skeleton, Table, Td, Th } from "@/components/ui";
import { fmtRange, timeAgo } from "@/lib/format";
import { useDebounced, useResource } from "@/lib/hooks";
import type { LeaveSummary, Paged } from "@/lib/types";

type Filter = "open" | "not_verified" | "awaiting_otp";
const FILTERS: Filter[] = ["open", "not_verified", "awaiting_otp"];

export default function LeavesPage() {
  return (
    <Suspense>
      <Leaves />
    </Suspense>
  );
}

function Leaves() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<Filter>(() => {
    const s = params.get("status") as Filter;
    return FILTERS.includes(s) ? s : "open";
  });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);

  useEffect(() => setPage(1), [query, status]);

  const { data, loading, error } = useResource<Paged<LeaveSummary>>(
    `/leaves?status=${status}&page=${page}&page_size=20&q=${encodeURIComponent(query)}`,
  );

  return (
    <>
      <PageHeader
        title="Sick leaves"
        description="Certificates still waiting to be confirmed with the customer. Once verified, a certificate moves to the customer's page."
        actions={
          <>
            <ButtonLink href="/leaves/upload" variant="primary" icon={<FileUp className="size-4" />}>
              Upload certificate
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "All pending" },
            { value: "not_verified", label: "Not verified" },
            { value: "awaiting_otp", label: "Awaiting code" },
          ]}
        />
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, Emirates ID or reference" className="pl-9" />
        </div>
      </div>

      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}

      <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
        <CheckCircle2 className="size-3.5 text-good" />
        Verified certificates are listed on each customer&apos;s page.
      </p>

      <Card>
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          query || status !== "open" ? (
            <EmptyState icon={<Search />} title="No matching certificates" description="Try a different search or filter." />
          ) : (
            <EmptyState
              icon={<ClipboardCheck />}
              title="All caught up"
              description="Every uploaded certificate has been verified. New uploads will appear here until they are confirmed with the customer."
              action={<ButtonLink href="/leaves/upload" variant="primary">Upload certificate</ButtonLink>}
            />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Patient</Th>
                  <Th className="hidden lg:table-cell">Emirates ID</Th>
                  <Th className="hidden md:table-cell">Leave period</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell text-right">Uploaded</Th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-60" : undefined}>
                {data?.items.map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/leaves/${l.id}`)} className="cursor-pointer transition-colors hover:bg-subtle">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <FileText className="size-4 shrink-0 text-faint" />
                        <Mono className="text-ink-2">{l.reference}</Mono>
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{l.customer?.full_name ?? l.patient_name ?? "Unknown patient"}</div>
                      {l.customer ? (
                        l.patient_name && l.patient_name.toLowerCase() !== l.customer.full_name.toLowerCase() ? (
                          <div className="mt-0.5 text-[12px] text-muted">On certificate: {l.patient_name}</div>
                        ) : null
                      ) : (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-warn">
                          <Link2Off className="size-3" /> No customer linked
                        </div>
                      )}
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <Mono className="text-ink-2">{l.customer?.emirates_id ?? l.emirates_id ?? "Not found"}</Mono>
                    </Td>
                    <Td className="tabular hidden text-ink-2 md:table-cell">
                      {fmtRange(l.start_date, l.end_date)}
                      {l.days ? <span className="text-muted"> · {l.days}d</span> : null}
                    </Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                    <Td className="hidden whitespace-nowrap text-right text-[13px] text-muted sm:table-cell">
                      <div>{timeAgo(l.created_at)}</div>
                      {l.uploaded_by && <div className="text-[12px] text-faint">{l.uploaded_by}</div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
