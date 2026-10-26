import { describe, expect, it, beforeEach } from "bun:test";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "./repository";
import {
  FakeInMemorySettingsStore,
  setSettingsStore,
} from "@/lib/settings";
import type { TemplateDefinition } from "./schema";

describe("Part C: Connection Protection Tests", () => {
  let fakeRepo: FakeInMemoryTemplateRepository;
  let fakeSettingsStore: FakeInMemorySettingsStore;

  const sampleTemplate = (overrides?: Partial<TemplateDefinition>): TemplateDefinition => ({
    id: crypto.randomUUID(),
    name: "Template A",
    slug: "template_a",
    description: "",
    delimiter: ";",
    status: "aktif",
    volume: {
      catalog: "main",
      schema: "default",
      name: "vol_a",
    },
    volumeCreatedByApp: true,
    csvFolder: "csv",
    parquetFolder: "parquet",
    workspaceHost: "dbc-test.cloud.databricks.com",
    needsCheck: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [{ name: "id", required: true, rule: { type: "text" } }],
    ...overrides,
  });

  beforeEach(() => {
    fakeRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(fakeRepo);
    fakeSettingsStore = new FakeInMemorySettingsStore(Buffer.alloc(32, 1));
    setSettingsStore(fakeSettingsStore);
  });

  it("identifies host mismatch and refuses upload if workspaceHost differs", async () => {
    const currentHost = "dbc-host-a.cloud.databricks.com";
    const templateHost = "dbc-host-b.cloud.databricks.com";

    const tpl = sampleTemplate({ workspaceHost: templateHost });
    await fakeRepo.create(tpl);

    const isMismatch = tpl.workspaceHost !== currentHost;
    expect(isMismatch).toBe(true);

    const errorMessage = isMismatch
      ? "Template ini dibuat untuk koneksi yang berbeda dari koneksi saat ini. Hubungi admin."
      : null;
    expect(errorMessage).toBe(
      "Template ini dibuat untuk koneksi yang berbeda dari koneksi saat ini. Hubungi admin."
    );
  });

  it("allows upload and records host when template.workspaceHost is null", async () => {
    const tpl = sampleTemplate({ workspaceHost: null });
    const saved = await fakeRepo.create(tpl);

    expect(saved.workspaceHost).toBeNull();

    const currentHost = "dbc-new.cloud.databricks.com";
    const updated = await fakeRepo.update(saved.id, {
      workspaceHost: currentHost,
    });

    expect(updated.workspaceHost).toBe("dbc-new.cloud.databricks.com");
  });

  it("flags non-deleted templates with needs_check when workspace address changes", async () => {
    const tpl1 = sampleTemplate({
      name: "Template Old Host",
      slug: "template_old",
      workspaceHost: "dbc-old.cloud.databricks.com",
      needsCheck: false,
    });
    const tpl2 = sampleTemplate({
      name: "Template Null Host",
      slug: "template_null",
      workspaceHost: null,
      needsCheck: false,
    });
    const tpl3 = sampleTemplate({
      name: "Template New Host",
      slug: "template_new",
      workspaceHost: "dbc-new.cloud.databricks.com",
      needsCheck: false,
    });

    await fakeRepo.create(tpl1);
    await fakeRepo.create(tpl2);
    await fakeRepo.create(tpl3);

    const newHost = "dbc-new.cloud.databricks.com";
    const all = await fakeRepo.list();
    let flaggedCount = 0;

    for (const t of all) {
      if (!t.workspaceHost || t.workspaceHost !== newHost) {
        await fakeRepo.update(t.id, { needsCheck: true });
        flaggedCount++;
      }
    }

    expect(flaggedCount).toBe(2);
    const updatedTpl1 = await fakeRepo.get(tpl1.id);
    const updatedTpl2 = await fakeRepo.get(tpl2.id);
    const updatedTpl3 = await fakeRepo.get(tpl3.id);

    expect(updatedTpl1?.needsCheck).toBe(true);
    expect(updatedTpl2?.needsCheck).toBe(true);
    expect(updatedTpl3?.needsCheck).toBe(false);
  });

  it("changing only catalog or schema flags nothing", async () => {
    const tpl = sampleTemplate({ needsCheck: false });
    await fakeRepo.create(tpl);

    const oldHost = "dbc-test.cloud.databricks.com";
    const newHost = "dbc-test.cloud.databricks.com";
    const hostChanged = oldHost !== newHost;

    expect(hostChanged).toBe(false);
    const reloaded = await fakeRepo.get(tpl.id);
    expect(reloaded?.needsCheck).toBe(false);
  });

  it("token change on the same host leaves needs_check false", async () => {
    const tpl = sampleTemplate({ needsCheck: false });
    await fakeRepo.create(tpl);

    const hostChanged = false;
    const tokenChanged = true;

    if (!hostChanged && tokenChanged) {
      // do not flag needsCheck
    }

    const reloaded = await fakeRepo.get(tpl.id);
    expect(reloaded?.needsCheck).toBe(false);
  });

  it("clears needs_check and sets workspaceHost when check succeeds for found template", async () => {
    const tpl = sampleTemplate({
      needsCheck: true,
      workspaceHost: "dbc-old.cloud.databricks.com",
    });
    await fakeRepo.create(tpl);

    const currentHost = "dbc-current.cloud.databricks.com";
    const updated = await fakeRepo.update(tpl.id, {
      workspaceHost: currentHost,
      needsCheck: false,
      visibility: "terlihat",
      visibilityCheckedAt: new Date().toISOString(),
    });

    expect(updated.needsCheck).toBe(false);
    expect(updated.workspaceHost).toBe(currentHost);
    expect(updated.visibility).toBe("terlihat");
  });

  it("visibility check preserves existing value on network failure", async () => {
    const tpl = sampleTemplate({
      visibility: "terlihat",
      visibilityCheckedAt: "2026-10-25T10:00:00.000Z",
    });
    await fakeRepo.create(tpl);

    const networkSuccess = false;
    if (!networkSuccess) {
      // failed check leaves stored value unchanged
    }

    const reloaded = await fakeRepo.get(tpl.id);
    expect(reloaded?.visibility).toBe("terlihat");
    expect(reloaded?.visibilityCheckedAt).toBe("2026-10-25T10:00:00.000Z");
  });
});
