import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import {
  getConnectionState,
  normalizeUrl,
  readDecryptedSettings,
  readMaskedSettings,
  saveSettings,
  settingsFormSchema,
} from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";

import { connection } from "next/server";

export async function GET() {
  await connection();
  const conn = await getConnectionState();
  const settings = await readMaskedSettings();
  if (conn.error) {
    return NextResponse.json({
      configured: false,
      error: conn.error,
      connection: conn,
    });
  }

  return NextResponse.json({
    configured: conn.ready,
    settings,
    connection: conn,
  });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("admin_session")?.value;
    if (!sessionCookie || !verifyAdminToken(sessionCookie)) {
      return NextResponse.json(
        { error: "Akses ditolak. Silakan masuk sebagai administrator." },
        { status: 401 }
      );
    }
    const json = await request.json();
    const parsed = settingsFormSchema.safeParse(json);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Data tidak valid";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const existing = await readDecryptedSettings();
    const oldHost = existing?.workspaceUrl
      ? existing.workspaceUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()
      : "";
    const rawNewUrl = parsed.data.workspaceUrl || existing?.workspaceUrl || "";
    const newHost = rawNewUrl
      ? normalizeUrl(rawNewUrl).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()
      : "";

    const hostChanged = Boolean(oldHost && newHost && oldHost !== newHost);
    const tokenChanged = Boolean(parsed.data.token && parsed.data.token.trim() !== "");

    const saved = await saveSettings(parsed.data);

    let message: string | undefined = undefined;

    if (hostChanged) {
      const allTemplates = await templateRepository.list();
      let flaggedCount = 0;
      for (const t of allTemplates) {
        const tHost = t.workspaceHost
          ? t.workspaceHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()
          : null;
        if (!tHost || tHost !== newHost) {
          await templateRepository.update(t.id, { needsCheck: true });
          flaggedCount++;
        }
      }
      message = `Alamat workspace diganti. ${flaggedCount} template perlu diperiksa.`;
    } else if (tokenChanged) {
      (async () => {
        try {
          const fresh = await readDecryptedSettings();
          if (!fresh || !fresh.workspaceUrl || !fresh.token) return;
          const client = createDatabricksClient(fresh.workspaceUrl, fresh.token);
          const allTemplates = await templateRepository.list();
          const groups = new Map<string, typeof allTemplates>();
          for (const t of allTemplates) {
            const groupKey = `${t.volume.catalog}.${t.volume.schema}`;
            const list = groups.get(groupKey) || [];
            list.push(t);
            groups.set(groupKey, list);
          }
          for (const [groupKey, templatesInGroup] of groups.entries()) {
            const [cat, sch] = groupKey.split(".");
            const listRes = await client.listVolumes(cat, sch);
            if (!listRes.success || !listRes.data?.volumes) {
              continue;
            }
            const visibleNames = new Set(
              listRes.data.volumes.map((v) => v.name.toLowerCase())
            );
            const now = new Date().toISOString();
            for (const t of templatesInGroup) {
              const isVisible = visibleNames.has(t.volume.name.toLowerCase());
              await templateRepository.update(t.id, {
                visibility: isVisible ? "terlihat" : "tidak_terlihat",
                visibilityCheckedAt: now,
              }).catch(() => {});
            }
          }
        } catch {}
      })();
    }

    return NextResponse.json({ success: true, settings: saved, message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan pengaturan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
