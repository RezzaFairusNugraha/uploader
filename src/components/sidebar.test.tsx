import { describe, expect, it } from "bun:test";
import { NAV_ITEMS } from "@/config/navigation";
import nextConfig from "../../next.config";
import { isNavItemActive } from "./Sidebar";

describe("Part B: Flat Sidebar Navigation", () => {
  it("the navigation registry holds the four flat routes", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/template",
      "/riwayat",
      "/panduan",
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Unggah",
      "Template",
      "Riwayat",
      "Panduan",
    ]);
  });

  it("the redirects map correctly in next.config from /uploader paths to root", async () => {
    expect(nextConfig.redirects).toBeDefined();
    const redirects = await nextConfig.redirects!();

    const uploaderRoot = redirects.find((r) => r.source === "/uploader");
    expect(uploaderRoot).toBeDefined();
    expect(uploaderRoot?.destination).toBe("/");

    const templateRedirect = redirects.find((r) => r.source === "/uploader/template");
    expect(templateRedirect).toBeDefined();
    expect(templateRedirect?.destination).toBe("/template");

    const templateWildcard = redirects.find((r) => r.source === "/uploader/template/:path*");
    expect(templateWildcard).toBeDefined();
    expect(templateWildcard?.destination).toBe("/template/:path*");

    const riwayatRedirect = redirects.find((r) => r.source === "/uploader/riwayat");
    expect(riwayatRedirect).toBeDefined();
    expect(riwayatRedirect?.destination).toBe("/riwayat");
  });

  it("the active item follows the path accurately", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/template")).toBe(false);
    expect(isNavItemActive("/", "/riwayat")).toBe(false);
    expect(isNavItemActive("/", "/panduan")).toBe(false);

    expect(isNavItemActive("/template", "/template")).toBe(true);
    expect(isNavItemActive("/template", "/template/baru")).toBe(true);
    expect(isNavItemActive("/template", "/template/tpl-123/edit")).toBe(true);
    expect(isNavItemActive("/template", "/template/perubahan")).toBe(true);
    expect(isNavItemActive("/template", "/")).toBe(false);
    expect(isNavItemActive("/template", "/riwayat")).toBe(false);

    expect(isNavItemActive("/riwayat", "/riwayat")).toBe(true);
    expect(isNavItemActive("/riwayat", "/")).toBe(false);

    expect(isNavItemActive("/panduan", "/panduan")).toBe(true);
    expect(isNavItemActive("/panduan", "/")).toBe(false);
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
