"use client";

import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Badge, Card, EmptyState, Mono, PageHeader, Pagination, Select, Skeleton, Table, Td, Th } from "@/components/ui";
import { ACTION_LABELS, fmtDateTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Activity, Paged } from "@/lib/types";
import { AdminOnly } from "../guard";

const TONE: Record<string, "good" | "warn" | "bad" | "brand" | "neutral"> = {
  leave_verified: "good",
  otp_sent: "warn",
  otp_resent: "warn",
  otp_failed: "bad",
  login_failed: "bad",
  account_locked: "bad",
  customers_imported: "brand",
  leave_uploaded: "brand",
};

export default function AuditPage() {
  return (
    <AdminOnly>
      <Audit />
    </AdminOnly>
  );
}

function Audit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [action]);
  const { data, loading, error } = useResource<Paged<Activity>>(`/audit?page=${page}&page_size=50&action=${action}`);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A record of sign ins, imports, uploads and every verification step, with the staff member and network address."
        actions={
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56">
            <option value="">All events</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      />
      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}
      <Card>
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={<History />} title="No events" description="Nothing has been recorded for this filter yet." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Event</Th>
                  <Th>Details</Th>
                  <Th className="hidden md:table-cell">User</Th>
                  <Th className="hidden lg:table-cell">IP address</Th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-60" : undefined}>
                {data?.items.map((a) => (
                  <tr key={a.id}>
                    <Td className="tabular whitespace-nowrap text-[13px] text-muted">{fmtDateTime(a.created_at)}</Td>
                    <Td>
                      <Badge tone={TONE[a.action] ?? "neutral"}>{ACTION_LABELS[a.action] ?? a.action}</Badge>
                    </Td>
                    <Td className="max-w-[420px] truncate text-ink-2">{a.detail}</Td>
                    <Td className="hidden whitespace-nowrap md:table-cell">{a.user ?? <span className="text-faint">System</span>}</Td>
                    <Td className="hidden lg:table-cell">
                      <Mono className="text-muted">{a.ip_address}</Mono>
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
