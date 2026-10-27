import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env && process.env[name] !== undefined) {
    return process.env[name];
  }
  try {
    const ctx = getCloudflareContext({ async: false });
    const envObj = ctx?.env as Record<string, unknown> | undefined;
    const val = envObj?.[name];
    if (typeof val === "string") {
      return val;
    }
  } catch {}
  return undefined;
}
