"use client";

import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { HOME_PATH } from "@/lib/features";

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user.role !== "admin") {
    return (
      <Card>
        <EmptyState
          icon={<ShieldX />}
          title="Administrator access required"
          description="This area is only available to administrators. Ask an administrator if you need access."
          action={<ButtonLink href={HOME_PATH}>Back to sick leaves</ButtonLink>}
        />
      </Card>
    );
  }
  return <>{children}</>;
}
