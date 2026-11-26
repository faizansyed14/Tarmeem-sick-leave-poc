"use client";

import { AuthProvider } from "@/components/auth";
import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell>{children}</Shell>
      </AuthProvider>
    </ToastProvider>
  );
}
