"use client";

import {
  ClipboardCheck,
  FileUp,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  Sheet,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { BrandLockup, BrandMark } from "./brand";
import { HOME_PATH, isHidden } from "@/lib/features";
import { Avatar, cx } from "./ui";

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

const WORKSPACE: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: <LayoutGrid /> },
  { href: "/leaves", label: "Sick leaves", icon: <ClipboardCheck />, exact: true },
  { href: "/leaves/upload", label: "Upload certificate", icon: <FileUp /> },
  { href: "/customers", label: "Customers", icon: <Users /> },
];

const ADMIN: NavItem[] = [
  { href: "/admin/import", label: "Import customers", icon: <Sheet /> },
  { href: "/admin/users", label: "Users and roles", icon: <UserCog /> },
  { href: "/admin/audit", label: "Audit log", icon: <History /> },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href || (/^\/leaves\/\d+/.test(pathname) && item.href === "/leaves");
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavGroup({ label, items, pathname }: { label?: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      {label ? (
        <div className="px-2.5 pb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">{label}</div>
      ) : null}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cx(
                  "group flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors [&>svg]:size-4 [&>svg]:shrink-0",
                  active ? "bg-brand-50 text-brand-800 [&>svg]:text-brand-600" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink [&>svg]:text-muted",
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarContent({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <Link href={HOME_PATH} className="block px-3 pb-5 pt-4">
        <BrandLockup />
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2">
        <NavGroup items={WORKSPACE.filter((i) => !isHidden(i.href))} pathname={pathname} />
        {user.role === "admin" && <NavGroup label="Administration" items={ADMIN.filter((i) => !isHidden(i.href))} pathname={pathname} />}
      </nav>
      <div className="border-t border-line p-2">
        <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
          <Avatar name={user.full_name} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{user.full_name}</div>
            <div className="truncate text-[11.5px] text-muted">{user.role === "admin" ? "Administrator" : "Staff member"}</div>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link
            href="/settings"
            className={cx(
              "flex h-8 items-center justify-center gap-1 rounded-lg text-[12px] font-medium transition-colors",
              pathname === "/settings" ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-ink/[0.04]",
            )}
          >
            <Settings className="size-3.5" /> Settings
          </Link>
          <button onClick={logout} className="flex h-8 items-center justify-center gap-1 rounded-lg text-[12px] font-medium text-ink-2 transition-colors hover:bg-ink/[0.04]">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen lg:pl-[212px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[212px] border-r border-line bg-surface lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Link href={HOME_PATH} className="flex items-center">
          <BrandMark compact />
        </Link>
        <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg hover:bg-ink/[0.05]" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[220px] animate-rise border-r border-line bg-surface">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 grid size-8 place-items-center rounded-lg hover:bg-ink/[0.05]" aria-label="Close menu">
              <X className="size-4" />
            </button>
            <SidebarContent pathname={pathname} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
