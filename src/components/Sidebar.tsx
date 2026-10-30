"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Database,
} from "lucide-react";
import { MODULES, PANDUAN_ITEM, type ModuleItem, type SubMenuItem } from "@/config/modules";

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/uploader") {
    return pathname === "/uploader" || pathname === "/uploader/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
}

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  isDrawerOpen,
  onCloseDrawer,
}: SidebarProps) {
  const pathname = usePathname();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(() => {
    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.databricks === "boolean") {
          setIsConnected(data.databricks);
        }
      })
      .catch(() => {
        setIsConnected(false);
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const handleStatusUpdated = () => fetchStatus();
    window.addEventListener("databricks-status-updated", handleStatusUpdated);
    return () => {
      window.removeEventListener("databricks-status-updated", handleStatusUpdated);
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const drawer = drawerRef.current;
    if (drawer) {
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      drawer.addEventListener("keydown", handleTab);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        drawer.removeEventListener("keydown", handleTab);
      };
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isDrawerOpen, onCloseDrawer]);

  const renderNavList = (collapsed: boolean, onItemClick?: () => void) => {
    return (
      <div className="flex flex-col gap-6">
        {MODULES.map((module) => (
          <div key={module.id} className="space-y-1">
            {!collapsed ? (
              <h2 className="px-3 text-sm font-semibold text-zinc-400">
                {module.label}
              </h2>
            ) : null}
            <div className="space-y-1">
              {module.items.map((item) => {
                const active = isNavItemActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onItemClick}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={`h-11 flex items-center rounded-lg text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      collapsed ? "justify-center px-0 w-11 mx-auto" : "gap-3 px-3"
                    } ${
                      active
                        ? "bg-zinc-100 text-indigo-600 font-semibold relative after:content-[''] after:absolute after:left-0 after:top-2 after:bottom-2 after:w-[2px] after:bg-indigo-600 after:rounded-r"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 font-medium"
                    }`}
                  >
                    {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFooter = (collapsed: boolean, onItemClick?: () => void) => {
    const PanduanIcon = PANDUAN_ITEM.icon;
    const isPanduanActive = isNavItemActive(PANDUAN_ITEM.href, pathname);
    const statusText =
      isConnected === true ? "Terhubung ke Databricks" : "Belum terhubung";
    const statusDotColor =
      isConnected === true ? "bg-emerald-500" : "bg-zinc-400";

    return (
      <div className="space-y-3 pt-3 border-t border-zinc-200">
        <Link
          href={PANDUAN_ITEM.href}
          onClick={onItemClick}
          title={collapsed ? PANDUAN_ITEM.label : undefined}
          aria-label={collapsed ? PANDUAN_ITEM.label : undefined}
          className={`h-11 flex items-center rounded-lg text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
            collapsed ? "justify-center px-0 w-11 mx-auto" : "gap-3 px-3"
          } ${
            isPanduanActive
              ? "bg-zinc-100 text-indigo-600 font-semibold relative after:content-[''] after:absolute after:left-0 after:top-2 after:bottom-2 after:w-[2px] after:bg-indigo-600 after:rounded-r"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 font-medium"
          }`}
        >
          {PanduanIcon ? <PanduanIcon className="h-5 w-5 shrink-0" /> : null}
          {!collapsed ? <span>{PANDUAN_ITEM.label}</span> : null}
        </Link>

        <div
          className={`flex items-center text-sm text-zinc-600 ${
            collapsed ? "justify-center py-2" : "gap-2.5 px-3 py-1.5"
          }`}
          title={collapsed ? statusText : undefined}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotColor}`}
            aria-hidden="true"
          />
          {!collapsed ? (
            <span className="truncate">{statusText}</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {isDrawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-xs motion-reduce:transition-none transition-opacity duration-200 lg:hidden"
          onClick={onCloseDrawer}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigasi"
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-zinc-200 p-4 flex flex-col justify-between shadow-xl motion-reduce:transition-none transition-transform duration-200 lg:hidden ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between h-11 px-2">
            <Link
              href="/uploader"
              onClick={onCloseDrawer}
              className="flex items-center gap-2.5 text-base font-bold tracking-tight text-zinc-900"
            >
              <Database className="h-5 w-5 text-indigo-600" />
              <span>Portal Data</span>
            </Link>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Tutup navigasi"
              className="h-11 w-11 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderNavList(false, onCloseDrawer)}
        </div>
        {renderFooter(false, onCloseDrawer)}
      </div>

      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col justify-between border-r border-zinc-200 bg-white p-4 motion-reduce:transition-none transition-[width] duration-200 ${
          isCollapsed ? "w-16" : "w-[260px]"
        }`}
      >
        <div className="space-y-6">
          <div
            className={`flex items-center h-11 ${
              isCollapsed ? "justify-center px-0" : "justify-between px-2"
            }`}
          >
            <Link
              href="/uploader"
              className="flex items-center gap-2.5 text-base font-bold tracking-tight text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded-md"
              title="Portal Data"
            >
              <Database className="h-5 w-5 text-indigo-600 shrink-0" />
              {!isCollapsed ? <span>Portal Data</span> : null}
            </Link>
            {!isCollapsed ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Ciutkan menu"
                className="h-10 w-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {renderNavList(isCollapsed)}
        </div>

        <div className="space-y-3">
          {isCollapsed ? (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Perluas menu"
                className="h-10 w-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {renderFooter(isCollapsed)}
        </div>
      </aside>
    </>
  );
}
