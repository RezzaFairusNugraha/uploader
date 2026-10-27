import { getEnv } from "./env";

export interface PlatformLimits {
  maxUploadMb: number;
  serverValidation: "full" | "light";
  maxSubrequests: number;
  maxInspectRows: number;
}

export function getLimits(settingMaxUploadMb?: number): PlatformLimits {
  const target = (getEnv("DEPLOY_TARGET") || "node").toLowerCase();
  const setting =
    typeof settingMaxUploadMb === "number" && !isNaN(settingMaxUploadMb)
      ? settingMaxUploadMb
      : 100;

  if (target === "cloudflare") {
    return {
      maxUploadMb: Math.min(setting, 100),
      serverValidation: "light",
      maxSubrequests: 40,
      maxInspectRows: 1000,
    };
  }

  if (target === "aws-lambda") {
    return {
      maxUploadMb: 5,
      serverValidation: "light",
      maxSubrequests: Infinity,
      maxInspectRows: 1000,
    };
  }

  return {
    maxUploadMb: setting,
    serverValidation: "full",
    maxSubrequests: Infinity,
    maxInspectRows: 2000,
  };
}
