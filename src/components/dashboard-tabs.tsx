"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "Matchups",
    isActive: (pathname: string) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/leagues"),
  },
  {
    href: "/dashboard/intel",
    label: "Cross-League Intel",
    isActive: (pathname: string) => pathname.startsWith("/dashboard/intel"),
  },
];

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border">
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
