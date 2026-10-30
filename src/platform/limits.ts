import { getLimitsConfig } from "./config";

export interface PlatformLimits {
  maxUploadMb: number;
  maxTemplates: number;
  serverValidation: "full" | "light";
  maxSubrequests: number;
  maxInspectRows: number;
}

export function getLimits(configuredMaxMb?: number): PlatformLimits {
  const cfg = getLimitsConfig();
  const maxUploadMb = configuredMaxMb !== undefined ? configuredMaxMb : cfg.maxUploadMb;
  const maxTemplates = cfg.maxTemplates;
  const deployTarget = cfg.deployTarget;

  if (deployTarget === "cloudflare") {
    return {
      maxUploadMb: Math.min(maxUploadMb, 100),
      maxTemplates,
      serverValidation: "light",
      maxSubrequests: 40,
      maxInspectRows: 1000,
    };
  }

  if (deployTarget === "aws-lambda") {
    return {
      maxUploadMb: 5,
      maxTemplates,
      serverValidation: "light",
      maxSubrequests: Infinity,
      maxInspectRows: 1000,
    };
  }

  return {
    maxUploadMb,
    maxTemplates,
    serverValidation: "full",
    maxSubrequests: Infinity,
    maxInspectRows: 2000,
  };
}
