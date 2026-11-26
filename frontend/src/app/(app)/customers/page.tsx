"use client";

import { Download, Search, Sheet, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddCustomerModal } from "@/components/add-customer";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Button, ButtonLink, Card, EmptyState, Input, Mono, PageHeader, Pagination, Skeleton, Table, Td, Th } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useDebounced, useResource } from "@/lib/hooks";
import type { Customer, Paged } from "@/lib/types";

export default function CustomersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  useEffect(() => setPage(1), [term]);
  const { data, loading, error } = useResource<Paged<Customer>>(`/customers?q=${encodeURIComponent(term)}&page=${page}&page_size=25`);

  return (
    <>
      <PageHeader
        title="Customers"
        description="The customer register used to match sick leave certificates. Records come from the main customer database by spreadsheet import, or can be added one at a time."
        actions={
          user.role === "admin" && (
            <>
              <a
                href="/api/export/customers"
                download
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[13.5px] font-medium shadow-card hover:bg-subtle"
              >
                <Download className="size-4" /> Export
              </a>
              <ButtonLink href="/admin/import" icon={<Sheet className="size-4" />}>
                Import
              </ButtonLink>
              <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
                Add customer
              </Button>
            </>
          )
        }
      />

      <AddCustomerModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(c, warnings) => {
          setAdding(false);
          toast.success("Customer added", warnings[0] ?? `${c.full_name} is now in the register.`);
          router.push(`/customers/${c.id}`);
        }}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, Emirates ID, email or phone" className="pl-9" />
        </div>
        {data && <span className="tabular hidden text-[13px] text-muted sm:block">{data.total.toLocaleString()} customers</span>}
      </div>

      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}

      <Card>
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          term ? (
            <EmptyState icon={<Search />} title="No customers found" description={`Nothing matches “${term}”.`} />
          ) : (
            <EmptyState
              icon={<Users />}
              title="The register is empty"
              description="Import the customer spreadsheet exported from the main customer database."
              action={user.role === "admin" ? <ButtonLink href="/admin/import" variant="primary">Import customers</ButtonLink> : undefined}
            />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Emirates ID</Th>
                  <Th className="hidden md:table-cell">Email</Th>
                  <Th className="hidden lg:table-cell">Phone</Th>
                  <Th className="hidden sm:table-cell text-right">Added</Th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-60" : undefined}>
                {data?.items.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer transition-colors hover:bg-subtle">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.full_name} size="sm" />
                        <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-brand-700 hover:underline hover:underline-offset-2">
                          {c.full_name}
                        </Link>
                      </div>
                    </Td>
                    <Td>
                      <Mono className="text-ink-2">{c.emirates_id}</Mono>
                    </Td>
                    <Td className="hidden text-ink-2 md:table-cell">{c.email ?? <span className="text-faint">No email</span>}</Td>
                    <Td className="tabular hidden text-ink-2 lg:table-cell">{c.phone ?? <span className="text-faint">No phone</span>}</Td>
                    <Td className="hidden text-right text-[13px] text-muted sm:table-cell">{fmtDate(c.created_at)}</Td>
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
