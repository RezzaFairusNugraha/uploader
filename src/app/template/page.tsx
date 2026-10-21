import PageHeader from "@/components/PageHeader";

export default function TemplatePage() {
  return (
    <div>
      <PageHeader
        title="Template CSV"
        description="Unduh format CSV acuan untuk Sales dan Marketing."
      />
      <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
        <p className="text-sm font-medium text-zinc-900">
          Daftar template belum dimuat
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Pilihan template dan tombol unduh berkas contoh akan ditampilkan di sini.
        </p>
      </div>
    </div>
  );
}
