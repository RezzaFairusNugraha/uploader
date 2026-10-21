import PageHeader from "@/components/PageHeader";

export default function UploadPage() {
  return (
    <div>
      <PageHeader
        title="Unggah Berkas"
        description="Validasi format dan kirim berkas CSV ke Databricks Unity Catalog Volume."
      />
      <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
        <p className="text-sm font-medium text-zinc-900">
          Belum ada berkas yang dipilih
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Formulir pemilihan template dan pengunggahan berkas akan tersedia di sini.
        </p>
      </div>
    </div>
  );
}
