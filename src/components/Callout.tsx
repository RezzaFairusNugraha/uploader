import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

type CalloutType = "info" | "success" | "warning" | "error";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
  className?: string;
}

const calloutStyles: Record<
  CalloutType,
  { container: string; iconColor: string; Icon: typeof Info }
> = {
  info: {
    container: "bg-blue-50/80 border-blue-200 text-blue-950",
    iconColor: "text-blue-600",
    Icon: Info,
  },
  success: {
    container: "bg-emerald-50/80 border-emerald-200 text-emerald-950",
    iconColor: "text-emerald-600",
    Icon: CheckCircle2,
  },
  warning: {
    container: "bg-amber-50/80 border-amber-200 text-amber-950",
    iconColor: "text-amber-600",
    Icon: AlertTriangle,
  },
  error: {
    container: "bg-rose-50/80 border-rose-200 text-rose-950",
    iconColor: "text-rose-600",
    Icon: AlertCircle,
  },
};

export default function Callout({
  type = "info",
  title,
  children,
  className = "",
}: CalloutProps) {
  const { container, iconColor, Icon } = calloutStyles[type];

  return (
    <div
      role="status"
      className={`flex items-start gap-3 p-3.5 border rounded-lg text-sm ${container} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 space-y-0.5">
        {title ? <p className="font-medium text-sm leading-tight">{title}</p> : null}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}
