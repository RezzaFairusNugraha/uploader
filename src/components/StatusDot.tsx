type Status = "connected" | "unconfigured" | "failed";

interface StatusDotProps {
  status?: Status;
  label?: string;
}

const statusConfig: Record<Status, { color: string; defaultLabel: string }> = {
  connected: {
    color: "bg-emerald-500",
    defaultLabel: "Terhubung",
  },
  unconfigured: {
    color: "bg-zinc-400",
    defaultLabel: "Belum diatur",
  },
  failed: {
    color: "bg-rose-500",
    defaultLabel: "Gagal",
  },
};

export default function StatusDot({
  status = "unconfigured",
  label,
}: StatusDotProps) {
  const config = statusConfig[status];
  const displayLabel = label ?? config.defaultLabel;

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-xs font-medium text-zinc-500">{displayLabel}</span>
    </div>
  );
}
