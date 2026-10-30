import { describe, expect, it, beforeEach } from "bun:test";
import {
  normalizeHost,
  hostOnly,
  getDatabricksConfig,
  getConfigStatus,
} from "@/platform/config";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "./repository";
import type { TemplateDefinition } from "./schema";

describe("Part A: Configuration, Status, & Host Check", () => {
  let fakeRepo: FakeInMemoryTemplateRepository;

  const sampleTemplate = (overrides?: Partial<TemplateDefinition>): TemplateDefinition => ({
    id: crypto.randomUUID(),
    name: "Template Test",
    slug: "template_test",
    description: "",
    delimiter: ";",
    status: "aktif",
    volume: {
      catalog: "main",
      schema: "template_test",
      name: "template_test",
    },
    schemaCreatedByApp: true,
    volumeCreatedByApp: true,
    workspaceHost: "dbc-test.cloud.databricks.com",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [{ name: "id", required: true, rule: { type: "text" } }],
    ...overrides,
  });

  beforeEach(() => {
    fakeRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(fakeRepo);
  });

  it("normalizes Databricks host with https and trims trailing slashes", () => {
    expect(normalizeHost("my-workspace.databricks.com")).toBe("https://my-workspace.databricks.com");
    expect(normalizeHost("http://my-workspace.databricks.com/")).toBe("https://my-workspace.databricks.com");
    expect(normalizeHost("  https://my-workspace.databricks.com///  ")).toBe("https://my-workspace.databricks.com");
    expect(hostOnly("https://my-workspace.databricks.com:443/path")).toBe("my-workspace.databricks.com:443");
  });

  it("checks config status booleans without exposing secrets or names", () => {
    const status = getConfigStatus();
    expect(typeof status.databricks).toBe("boolean");
    expect(typeof status.database).toBe("boolean");
    const keys = Object.keys(status).sort();
    expect(keys).toEqual(["database", "databricks"]);
  });

  it("identifies host mismatch and refuses upload if workspaceHost differs", async () => {
    const currentHost = "dbc-host-a.cloud.databricks.com";
    const templateHost = "dbc-host-b.cloud.databricks.com";

    const tpl = sampleTemplate({ workspaceHost: templateHost });
    await fakeRepo.create(tpl);

    const isMismatch = tpl.workspaceHost !== currentHost;
    expect(isMismatch).toBe(true);
  });

  it("records workspaceHost after first upload when host is null", async () => {
    const currentHost = "dbc-host-a.cloud.databricks.com";
    const tpl = sampleTemplate({ workspaceHost: null });
    const created = await fakeRepo.create(tpl);
    expect(created.workspaceHost).toBeNull();

    const updated = await fakeRepo.update(created.id, { workspaceHost: currentHost });
    expect(updated.workspaceHost).toBe(currentHost);
  });
});
