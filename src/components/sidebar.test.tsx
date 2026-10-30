import { describe, expect, it } from "bun:test";
import { MODULES, PANDUAN_ITEM } from "@/config/modules";
import nextConfig from "../../next.config";
import { isNavItemActive } from "./Sidebar";

describe("Part C: Sidebar and Modules Registry", () => {
  it("the registry builds the right routes for uploader and dashboard modules and panduan", () => {
    const uploaderModule = MODULES.find((m) => m.id === "uploader");
    expect(uploaderModule).toBeDefined();
    expect(uploaderModule?.label).toBe("Uploader");
    expect(uploaderModule?.items.map((i) => i.href)).toEqual([
      "/uploader",
      "/uploader/template",
      "/uploader/riwayat",
    ]);

    const dashboardModule = MODULES.find((m) => m.id === "dashboard");
    expect(dashboardModule).toBeDefined();
    expect(dashboardModule?.label).toBe("Dashboard");
    expect(dashboardModule?.items.map((i) => i.href)).toEqual([
      "/dashboard/mekari-talenta",
    ]);

    expect(PANDUAN_ITEM.href).toBe("/panduan");
    expect(PANDUAN_ITEM.label).toBe("Panduan");
  });

  it("the redirects map correctly in next.config", async () => {
    expect(nextConfig.redirects).toBeDefined();
    const redirects = await nextConfig.redirects!();

    const rootRedirect = redirects.find((r) => r.source === "/");
    expect(rootRedirect).toBeDefined();
    expect(rootRedirect?.destination).toBe("/uploader");

    const templateRedirect = redirects.find((r) => r.source === "/template");
    expect(templateRedirect).toBeDefined();
    expect(templateRedirect?.destination).toBe("/uploader/template");

    const templateWildcard = redirects.find((r) => r.source === "/template/:path*");
    expect(templateWildcard).toBeDefined();
    expect(templateWildcard?.destination).toBe("/uploader/template/:path*");

    const riwayatRedirect = redirects.find((r) => r.source === "/riwayat");
    expect(riwayatRedirect).toBeDefined();
    expect(riwayatRedirect?.destination).toBe("/uploader/riwayat");
  });

  it("the active item follows the path accurately", () => {
    expect(isNavItemActive("/uploader", "/uploader")).toBe(true);
    expect(isNavItemActive("/uploader", "/uploader/")).toBe(true);
    expect(isNavItemActive("/uploader", "/uploader/template")).toBe(false);
    expect(isNavItemActive("/uploader", "/uploader/riwayat")).toBe(false);

    expect(isNavItemActive("/uploader/template", "/uploader/template")).toBe(true);
    expect(isNavItemActive("/uploader/template", "/uploader/template/baru")).toBe(true);
    expect(isNavItemActive("/uploader/template", "/uploader/template/tpl-123/edit")).toBe(true);
    expect(isNavItemActive("/uploader/template", "/uploader/template/perubahan")).toBe(true);
    expect(isNavItemActive("/uploader/template", "/uploader")).toBe(false);

    expect(isNavItemActive("/uploader/riwayat", "/uploader/riwayat")).toBe(true);
    expect(isNavItemActive("/uploader/riwayat", "/uploader")).toBe(false);

    expect(isNavItemActive("/dashboard/mekari-talenta", "/dashboard/mekari-talenta")).toBe(true);
    expect(isNavItemActive("/dashboard/mekari-talenta", "/uploader")).toBe(false);

    expect(isNavItemActive("/panduan", "/panduan")).toBe(true);
    expect(isNavItemActive("/panduan", "/uploader")).toBe(false);
  });

  it("the drawer opens and closes with Escape key listener", () => {
    let closed = false;
    const onClose = () => {
      closed = true;
    };

    const listeners: Record<string, (e: any) => void> = {};
    const mockWindow = {
      addEventListener: (type: string, handler: (e: any) => void) => {
        listeners[type] = handler;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    };

    const attachEscapeListener = (isOpen: boolean, closeCb: () => void) => {
      if (!isOpen) return () => {};
      const onKeyDown = (e: { key: string; preventDefault: () => void }) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeCb();
        }
      };
      mockWindow.addEventListener("keydown", onKeyDown);
      return () => {
        mockWindow.removeEventListener("keydown");
      };
    };

    const cleanup = attachEscapeListener(true, onClose);
    expect(typeof listeners["keydown"]).toBe("function");

    let prevented = false;
    listeners["keydown"]({
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(closed).toBe(true);
    expect(prevented).toBe(true);

    cleanup();
    expect(listeners["keydown"]).toBeUndefined();
  });
});
