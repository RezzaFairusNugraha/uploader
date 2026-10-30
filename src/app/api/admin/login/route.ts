import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  SESSION_DURATION_MS,
  checkAdminRateLimit,
  recordFailedAdminLogin,
  resetAdminLoginAttempts,
  signAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
} from "@/lib/adminAuth";
import { USER_COPY } from "@/lib/copy";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return NextResponse.json({
    isAuthenticated: verifyAdminToken(token),
  });
}

export async function POST(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const rateLimit = await checkAdminRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan gagal. Silakan tunggu ${rateLimit.waitSeconds} detik lagi.`,
      },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";

    const isValid = verifyAdminPassword(password);
    if (!isValid) {
      const outcome = await recordFailedAdminLogin(ip);
      if (outcome.locked) {
        return NextResponse.json(
          { error: USER_COPY.admin.blocked },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: USER_COPY.admin.wrongPassword },
        { status: 401 }
      );
    }

    await resetAdminLoginAttempts(ip);
    const token = signAdminToken();
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Gagal memproses kata sandi admin. Coba beberapa saat lagi." },
      { status: 500 }
    );
  }
}
