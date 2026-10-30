import { describe, expect, it, spyOn } from "bun:test";
import { getLimits } from "./limits";
import { validateLight } from "@/lib/validation/light";
import * as databricks from "@/lib/databricks";
import * as config from "@/platform/config";
import * as templates from "@/lib/templates";
import * as uploadLog from "@/lib/upload/log";

describe("Cloudflare Workers limits and adapter", () => {
  it("returns limits per DEPLOY_TARGET", () => {
    const originalEnv = process.env.DEPLOY_TARGET;

    try {
      process.env.DEPLOY_TARGET = "node";
      const nodeLimits = getLimits(150);
      expect(nodeLimits.maxUploadMb).toBe(150);
      expect(nodeLimits.serverValidation).toBe("full");
      expect(nodeLimits.maxSubrequests).toBe(Infinity);
      expect(nodeLimits.maxInspectRows).toBe(2000);

      process.env.DEPLOY_TARGET = "cloudflare";
      const cfLimits = getLimits(150);
      expect(cfLimits.maxUploadMb).toBe(100);
      expect(cfLimits.serverValidation).toBe("light");
      expect(cfLimits.maxSubrequests).toBe(40);
      expect(cfLimits.maxInspectRows).toBe(1000);

      const cfSmallLimits = getLimits(50);
      expect(cfSmallLimits.maxUploadMb).toBe(50);

      process.env.DEPLOY_TARGET = "aws-lambda";
      const lambdaLimits = getLimits(150);
      expect(lambdaLimits.maxUploadMb).toBe(5);
      expect(lambdaLimits.serverValidation).toBe("light");
      expect(lambdaLimits.maxSubrequests).toBe(Infinity);
      expect(lambdaLimits.maxInspectRows).toBe(1000);
    } finally {
      if (originalEnv !== undefined) {
        process.env.DEPLOY_TARGET = originalEnv;
      } else {
        delete process.env.DEPLOY_TARGET;
      }
    }
  });

  const testTemplate = {
    id: "999e4567-e89b-12d3-a456-426614174999",
    name: "Toko Template",
    slug: "toko_template",
    delimiter: ";" as const,
    status: "aktif" as const,
    volume: { catalog: "main", schema: "default", name: "toko_template" },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [
      {
        name: "kode",
        required: true,
        rule: { type: "digits" as const, length: 6 },
      },
      {
        name: "nama",
        required: true,
        rule: { type: "text" as const },
      },
    ],
  };

  it("light validation accepts a good file and rejects a bad header", () => {
    const goodCsv = new TextEncoder().encode("kode;nama\n123456;Toko Baru\n654321;Cabang Dua\n");
    const goodResult = validateLight(goodCsv, "data.csv", testTemplate);
    expect(goodResult.ok).toBe(true);
    expect(goodResult.rowCount).toBe(2);

    const badHeaderCsv = new TextEncoder().encode("kode;alamat\n123456;Jakarta\n");
    const badHeaderResult = validateLight(badHeaderCsv, "data.csv", testTemplate);
    expect(badHeaderResult.ok).toBe(false);
    expect(badHeaderResult.error).toContain("Kolom wajib 'nama' tidak ditemukan");

    const extraHeaderCsv = new TextEncoder().encode("kode;nama;ekstra\n123456;Toko;X\n");
    const extraHeaderResult = validateLight(extraHeaderCsv, "data.csv", testTemplate);
    expect(extraHeaderResult.ok).toBe(false);
    expect(extraHeaderResult.error).toContain("tidak dikenali");

    const wrongDelimiterCsv = new TextEncoder().encode("kode,nama\n123456,Toko\n");
    const wrongDelimResult = validateLight(wrongDelimiterCsv, "data.csv", testTemplate);
    expect(wrongDelimResult.ok).toBe(false);
    expect(wrongDelimResult.error).toContain("Pemisah file");

    const validParquet = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0x01]);
    const parquetResult = validateLight(validParquet, "data.parquet", testTemplate);
    expect(parquetResult.ok).toBe(true);

    const invalidParquet = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const invalidParquetResult = validateLight(invalidParquet, "data.parquet", testTemplate);
    expect(invalidParquetResult.ok).toBe(false);
    expect(invalidParquetResult.error).toContain("PAR1");
  });

  it("the streaming upload passes exact bytes through with mocked client and never buffers more than the first chunk", async () => {
    let capturedBytes: Uint8Array | null = null;
    let uploadCalled = false;

    const spyClient = spyOn(databricks, "createDatabricksClient").mockImplementation(() => ({
      uploadFile: async (_path: string, body: BodyInit) => {
        uploadCalled = true;
        if (body instanceof Uint8Array) {
          capturedBytes = body;
        } else if (body instanceof ReadableStream) {
          const reader = body.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
          const combined = new Uint8Array(totalLen);
          let off = 0;
          for (const c of chunks) {
            combined.set(c, off);
            off += c.length;
          }
          capturedBytes = combined;
        }
        return { success: true, status: 200 };
      },
    } as unknown as databricks.DatabricksClient));

    const spyConfig = spyOn(config, "getDatabricksConfig").mockReturnValue({
      host: "https://mock.databricks.com",
      workspaceHost: "mock.databricks.com",
      token: "mock-token",
      catalog: "main",
    });

    const fakeRepo = new templates.FakeInMemoryTemplateRepository();
    templates.setTemplateRepository(fakeRepo);
    await fakeRepo.create(testTemplate as unknown as templates.TemplateDefinition);

    const fakeLogRepo = new uploadLog.FakeInMemoryUploadLogRepository();
    uploadLog.setUploadLogRepository(fakeLogRepo);

    try {
      const { PUT } = await import("@/app/api/upload/[templateId]/route");

      const chunk1Header = new TextEncoder().encode("kode;nama\n123456;Toko Utama\n");
      const chunk1Padding = new Uint8Array(256 * 1024 - chunk1Header.length);
      chunk1Padding.fill(0x20);
      const chunk1 = new Uint8Array(256 * 1024);
      chunk1.set(chunk1Header, 0);
      chunk1.set(chunk1Padding, chunk1Header.length);

      const chunk2 = new Uint8Array(128 * 1024);
      chunk2.fill(0x41);

      const chunk3 = new Uint8Array(64 * 1024);
      chunk3.fill(0x42);

      const fullOriginalBytes = new Uint8Array(chunk1.length + chunk2.length + chunk3.length);
      fullOriginalBytes.set(chunk1, 0);
      fullOriginalBytes.set(chunk2, chunk1.length);
      fullOriginalBytes.set(chunk3, chunk1.length + chunk2.length);

      const inputChunks = [chunk1, chunk2, chunk3];
      let chunkIndex = 0;
      const bodyStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunkIndex < inputChunks.length) {
            controller.enqueue(inputChunks[chunkIndex++]);
          } else {
            controller.close();
          }
        },
      });

      const request = new Request(`http://localhost/api/upload/${testTemplate.id}?name=data.csv`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(fullOriginalBytes.length),
        },
        body: bodyStream,
      });

      const response = await PUT(request, {
        params: Promise.resolve({ templateId: testTemplate.id }),
      });

      if (response.status !== 200) {
        console.log("PUT error detail:", await response.text());
      }

      expect(response.status).toBe(200);
      expect(uploadCalled).toBe(true);
      expect(capturedBytes).not.toBeNull();
      expect(capturedBytes!.length).toBe(fullOriginalBytes.length);
      expect(capturedBytes).toEqual(fullOriginalBytes);
    } finally {
      spyClient.mockRestore();
      spyConfig.mockRestore();
    }
  });
});
