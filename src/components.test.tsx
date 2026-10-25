import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "./components/Button";
import Callout from "./components/Callout";
import Field from "./components/Field";
import PageHeader from "./components/PageHeader";
import StatusDot from "./components/StatusDot";

describe("Komponen Desain Shell", () => {
  it("merender PageHeader dengan judul dan deskripsi", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Judul Halaman" description="Deskripsi singkat" />
    );
    expect(html).toContain("Judul Halaman");
    expect(html).toContain("Deskripsi singkat");
    expect(html).toContain("text-[28px]");
  });

  it("merender StatusDot dengan status default dan label kustom", () => {
    const unconfigured = renderToStaticMarkup(<StatusDot status="unconfigured" />);
    expect(unconfigured).toContain("Belum diatur");
    expect(unconfigured).toContain("bg-zinc-400");

    const connected = renderToStaticMarkup(<StatusDot status="connected" />);
    expect(connected).toContain("Terhubung");
    expect(connected).toContain("bg-emerald-500");

    const failed = renderToStaticMarkup(<StatusDot status="failed" />);
    expect(failed).toContain("Gagal");
    expect(failed).toContain("bg-rose-500");
  });

  it("merender Button dengan varian primary, secondary, ghost dan status loading", () => {
    const primary = renderToStaticMarkup(<Button variant="primary">Kirim</Button>);
    expect(primary).toContain("bg-indigo-600");
    expect(primary).toContain("Kirim");

    const secondary = renderToStaticMarkup(
      <Button variant="secondary">Batal</Button>
    );
    expect(secondary).toContain("border-zinc-200");

    const ghost = renderToStaticMarkup(<Button variant="ghost">Lewati</Button>);
    expect(ghost).toContain("bg-transparent");

    const loading = renderToStaticMarkup(
      <Button isLoading variant="primary">
        Memproses
      </Button>
    );
    expect(loading).toContain("animate-spin");
    expect(loading).toContain("disabled");
  });

  it("merender Field dengan label, input 44px, hint, dan error", () => {
    const field = renderToStaticMarkup(
      <Field
        id="nama"
        label="Nama Lengkap"
        placeholder="Masukkan nama"
        hint="Gunakan nama resmi"
      />
    );
    expect(field).toContain("Nama Lengkap");
    expect(field).toContain("h-11");
    expect(field).toContain("Gunakan nama resmi");

    const fieldError = renderToStaticMarkup(
      <Field id="email" label="Surel" error="Surel tidak valid" />
    );
    expect(fieldError).toContain("Surel tidak valid");
    expect(fieldError).toContain("border-rose-400");
  });

  it("merender Callout untuk keempat tipe (info, success, warning, error)", () => {
    const info = renderToStaticMarkup(
      <Callout type="info" title="Informasi">
        Pesan info
      </Callout>
    );
    expect(info).toContain("bg-blue-50/80");
    expect(info).toContain("Informasi");
    expect(info).toContain("Pesan info");

    const success = renderToStaticMarkup(
      <Callout type="success">Berhasil disimpan</Callout>
    );
    expect(success).toContain("bg-emerald-50/80");

    const warning = renderToStaticMarkup(
      <Callout type="warning">Peringatan kuota</Callout>
    );
    expect(warning).toContain("bg-amber-50/80");

    const error = renderToStaticMarkup(
      <Callout type="error">Terjadi kegagalan</Callout>
    );
    expect(error).toContain("bg-rose-50/80");
  });
});
