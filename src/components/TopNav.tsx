"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import StatusDot from "./StatusDot";
import { USER_COPY } from "@/lib/copy";

const navItems = [
  { href: "/", label: USER_COPY.nav.unggah },
  { href: "/template", label: USER_COPY.nav.template },
  { href: "/riwayat", label: USER_COPY.nav.riwayat },
  { href: "/panduan", label: USER_COPY.nav.panduan },
];

type ConnectionStatus = "unconfigured" | "connected" | "failed";

export default function TopNav() {
  const pathname = usePathname();
  const [status, setStatus] = useState<ConnectionStatus>("unconfigured");

  useEffect(() => {
    let active = true;
    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.status) {
          setStatus(data.status);
        }
      })
      .catch(() => {});

    const handleStatusUpdate = () => {
      fetch("/api/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (active && data?.status) {
            setStatus(data.status);
          }
        })
        .catch(() => {});
    };

    window.addEventListener("databricks-status-updated", handleStatusUpdate);
    return () => {
      active = false;
      window.removeEventListener(
        "databricks-status-updated",
        handleStatusUpdate
      );
    };
  }, []);

  const isLinkActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="border-b border-zinc-200 bg-white sticky top-0 z-40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 sm:gap-8">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-zinc-900 hover:text-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 rounded-sm"
          >
            Data Uploader
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            {navItems.map((item) => {
              const active = isLinkActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`h-14 inline-flex items-center text-sm font-medium transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 rounded-sm ${
                    active
                      ? "text-zinc-900 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-indigo-600"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="shrink-0">
          <StatusDot status={status} />
        </div>
      </div>
    </nav>
  );
}
