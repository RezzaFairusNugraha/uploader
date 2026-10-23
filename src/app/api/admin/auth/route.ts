import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  checkRateLimit,
  hashPassword,
  recordFailedAttempt,
  resetLoginAttempts,
  signAdminToken,
  verifyAdminToken,
  verifyPassword,
} from "@/lib/adminAuth";
import { getSettingsStore } from "@/lib/settings";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const isAuthenticated = sessionCookie ? verifyAdminToken(sessionCookie) : false;

  const store = getSettingsStore();
  const settings = await store.readDecrypted();
  const hasPassword = Boolean(settings?.adminPasswordHash);

  return NextResponse.json({
    isAuthenticated,
    hasPassword,
  });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan gagal. Silakan tunggu ${rateLimit.waitSeconds} detik lagi.`,
      },
      { status: 429 }
    );
  }

  try {
    const { password, action } = await req.json();
    const store = getSettingsStore();
    const settings = await store.readDecrypted();

    if (action === "logout") {
      const cookieStore = await cookies();
      cookieStore.delete("admin_session");
      return NextResponse.json({ success: true });
    }

    if (!settings?.adminPasswordHash) {
      if (!password || password.length < 6) {
        return NextResponse.json(
          { error: "Kata sandi admin minimal 6 karakter" },
          { status: 400 }
        );
      }
      const newHash = hashPassword(password);
      await store.save({
        workspaceUrl: settings?.workspaceUrl || "https://dummy-workspace.databricks.com",
        token: settings?.token || "dummy-token-placeholder",
        catalog: settings?.catalog || "main",
        schema: settings?.schema || "default",
        maxFileSizeMb: settings?.maxFileSizeMb || 100,
        adminPasswordHash: newHash,
      });

      const token = signAdminToken();
      const cookieStore = await cookies();
      cookieStore.set("admin_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60,
        path: "/",
      });

      resetLoginAttempts(ip);
      return NextResponse.json({ success: true, message: "Kata sandi admin berhasil dibuat" });
    }

    const isValid = verifyPassword(password, settings.adminPasswordHash);
    if (!isValid) {
      const result = recordFailedAttempt(ip);
      if (result.locked) {
        return NextResponse.json(
          { error: "Akun admin terkunci sementara selama 15 menit karena 5 kali percobaan gagal." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `Kata sandi admin salah. Sisa kesempatan: ${result.remaining} kali.` },
        { status: 401 }
      );
    }

    const token = signAdminToken();
    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
      path: "/",
    });

    resetLoginAttempts(ip);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memproses autentikasi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
