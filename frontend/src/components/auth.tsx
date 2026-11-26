"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { BrandMark } from "./brand";
import { Spinner } from "./ui";

type Me = { user: User; otp_dev_mode: boolean; mail_enabled: boolean };
type Ctx = {
  user: User;
  devMode: boolean;
  mailEnabled: boolean;
  setUser: (u: User) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    const data = await api<Me>("/auth/me");
    setMe(data);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }, []);

  if (!me) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <BrandMark compact />
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: me.user,
        devMode: me.otp_dev_mode,
        mailEnabled: me.mail_enabled,
        setUser: (u) => setMe((m) => (m ? { ...m, user: u } : m)),
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
