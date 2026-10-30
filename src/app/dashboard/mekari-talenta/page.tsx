import PageHeader from "@/components/PageHeader";
import { LayoutDashboard } from "lucide-react";

export default function DashboardMekariTalentaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Mekari Talenta"
        description="Ringkasan data kehadiran dan ketenagakerjaan dari Mekari Talenta."
      />
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
          <LayoutDashboard className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-zinc-900">
          Dashboard ini sedang disiapkan.
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Isinya akan ditambahkan setelah data dan indikatornya ditentukan.
        </p>
      </div>
    </div>
  );
}
