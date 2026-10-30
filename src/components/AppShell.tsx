"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Database } from "lucide-react";
import Sidebar from "./Sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal_sidebar_collapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
    } catch {}
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("portal_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-full flex flex-col bg-[#fafafa]">
      <header className="lg:hidden sticky top-0 z-20 h-14 bg-white border-b border-zinc-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Buka navigasi"
            aria-expanded={isDrawerOpen}
            className="h-11 w-11 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link
            href="/uploader"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-zinc-900"
          >
            <Database className="h-5 w-5 text-indigo-600" />
            <span>Portal Data</span>
          </Link>
        </div>
      </header>

      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        isDrawerOpen={isDrawerOpen}
        onCloseDrawer={() => setIsDrawerOpen(false)}
      />

      <div
        className={`flex-1 flex flex-col transition-[padding-left] motion-reduce:transition-none duration-200 ${
          isCollapsed ? "lg:pl-16" : "lg:pl-[260px]"
        }`}
      >
        <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
