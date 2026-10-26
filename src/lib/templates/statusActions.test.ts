import { describe, expect, it } from "bun:test";
import { FakeInMemoryTemplateRepository } from "./repository";
import { withDbRetry } from "@/db";

describe("Part A: Status Actions & Concurrency Resilience", () => {
  it("deactivating with a stale version succeeds (idempotent status update)", async () => {
    const repo = new FakeInMemoryTemplateRepository();
    const id = crypto.randomUUID();
    const created = await repo.create({
      id,
      name: "Template Tes",
      slug: "template_tes",
      description: "",
      delimiter: ";",
      status: "aktif",
      volume: { catalog: "cat", schema: "sch", name: "vol" },
      version: 5,
      columns: [{ name: "kolom1", required: true, rule: { type: "text" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const archived = await repo.updateStatus(created.id, "diarsipkan");
    expect(archived.status).toBe("diarsipkan");
    expect(archived.version).toBe(6);
  });

  it("two quick status changes produce valid sequential version increments", async () => {
    const repo = new FakeInMemoryTemplateRepository();
    const id = crypto.randomUUID();
    const created = await repo.create({
      id,
      name: "Template Double",
      slug: "template_double",
      description: "",
      delimiter: ";",
      status: "aktif",
      volume: { catalog: "cat", schema: "sch", name: "vol" },
      version: 1,
      columns: [{ name: "col", required: true, rule: { type: "text" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let calls = 0;
    const requestAction = async () => {
      calls++;
      return repo.updateStatus(created.id, "diarsipkan");
    };

    const first = await requestAction();
    expect(calls).toBe(1);
    expect(first.status).toBe("diarsipkan");
    expect(first.version).toBe(2);
  });

  it("transient failure is retried once and then succeeds via withDbRetry", async () => {
    let attempts = 0;
    const flakyOperation = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("Neon cold start connection reset");
      }
      return "SUCCESS_DATA";
    };

    const result = await withDbRetry(flakyOperation, 2, 10);
    expect(result).toBe("SUCCESS_DATA");
    expect(attempts).toBe(2);
  });

  it("response contains the new version after status update", async () => {
    const repo = new FakeInMemoryTemplateRepository();
    const id = crypto.randomUUID();
    const created = await repo.create({
      id,
      name: "Template Ver",
      slug: "template_ver",
      description: "",
      delimiter: ";",
      status: "aktif",
      volume: { catalog: "cat", schema: "sch", name: "vol" },
      version: 3,
      columns: [{ name: "col", required: true, rule: { type: "text" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updated = await repo.updateStatus(created.id, "diarsipkan");
    expect(updated.version).toBe(4);
    expect(updated.status).toBe("diarsipkan");
  });

  it("undo restores the previous status and updates the version", async () => {
    const repo = new FakeInMemoryTemplateRepository();
    const id = crypto.randomUUID();
    const created = await repo.create({
      id,
      name: "Template Undo",
      slug: "template_undo",
      description: "",
      delimiter: ";",
      status: "aktif",
      volume: { catalog: "cat", schema: "sch", name: "vol" },
      version: 1,
      columns: [{ name: "col", required: true, rule: { type: "text" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const archived = await repo.updateStatus(created.id, "diarsipkan");
    expect(archived.status).toBe("diarsipkan");
    expect(archived.version).toBe(2);

    const restored = await repo.updateStatus(created.id, "aktif");
    expect(restored.status).toBe("aktif");
    expect(restored.version).toBe(3);
  });
});
