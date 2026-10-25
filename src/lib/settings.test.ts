import { describe, expect, it } from "bun:test";
import {
  decryptToken,
  encryptToken,
  FakeInMemorySettingsStore,
  getConnectionState,
  getEncryptionKey,
  isValidPathSegment,
  maskToken,
  normalizeUrl,
  setSettingsStore,
  type SettingsStore,
} from "./settings";

describe("Settings & Encryption (SettingsStore)", () => {
  const dummyKey = Buffer.from(
    "01234567890123456789012345678901",
    "utf8"
  );

  describe("URL Normalizer", () => {
    it("menghapus spasi dan trailing slash serta menambahkan https://", () => {
      expect(normalizeUrl("  dbc-xxxx.cloud.databricks.com/ ")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("http://dbc-xxxx.cloud.databricks.com///")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("https://dbc-xxxx.cloud.databricks.com/")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("")).toBe("");
    });
  });

  describe("Validasi Segmen Path", () => {
    it("menerima segmen yang valid dan menolak karakter terlarang", () => {
      expect(isValidPathSegment("databricks_catalog")).toBe(true);
      expect(isValidPathSegment("csv")).toBe(true);
      expect(isValidPathSegment("")).toBe(false);
      expect(isValidPathSegment("   ")).toBe(false);
      expect(isValidPathSegment("path/with/slash")).toBe(false);
      expect(isValidPathSegment("..")).toBe(false);
      expect(isValidPathSegment("folder\\sub")).toBe(false);
    });
  });

  describe("Masking Token", () => {
    it("menampilkan titik masker dengan 4 karakter terakhir", () => {
      expect(maskToken("dapi1234567890abcdef")).toBe("••••••••••••cdef");
      expect(maskToken("1234")).toBe("••••");
      expect(maskToken("")).toBe("");
    });
  });

  describe("Enkripsi AES-256-GCM dari ENCRYPTION_KEY", () => {
    it("melakukan round-trip enkripsi dan dekripsi dengan benar", () => {
      const secret = "dapi-super-secret-databricks-token-12345";
      const encrypted = encryptToken(secret, dummyKey);
      const decrypted = decryptToken(encrypted, dummyKey);
      expect(decrypted).toBe(secret);
      expect(encrypted.iv.length).toBe(24);
      expect(encrypted.tag.length).toBe(32);
    });

    it("gagal mendeskripsi jika kunci salah", () => {
      const secret = "token-rahasia";
      const encrypted = encryptToken(secret, dummyKey);
      const wrongKey = Buffer.from(
        "abcdefabcdefabcdefabcdefabcdefab",
        "utf8"
      );
      expect(() => decryptToken(encrypted, wrongKey)).toThrow();
    });

    it("gagal mendeskripsi jika tag otentikasi dimanipulasi", () => {
      const secret = "token-rahasia";
      const encrypted = encryptToken(secret, dummyKey);
      const tampered = {
        ...encrypted,
        tag: encrypted.tag.replace(/^./, encrypted.tag[0] === "a" ? "b" : "a"),
      };
      expect(() => decryptToken(tampered, dummyKey)).toThrow();
    });

    it("memvalidasi panjang ENCRYPTION_KEY dari variabel lingkungan (32 byte)", () => {
      const orig = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = Buffer.from("01234567890123456789012345678901").toString("base64");
      const key = getEncryptionKey();
      expect(key.length).toBe(32);

      process.env.ENCRYPTION_KEY = Buffer.from("terlalu-pendek").toString("base64");
      expect(() => getEncryptionKey()).toThrow("panjang tepat 32 byte");

      delete process.env.ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow("belum dikonfigurasi");
      process.env.ENCRYPTION_KEY = orig;
    });
  });

  describe("SettingsStore In-Memory Fake & getConnectionState", () => {
    it("mengembalikan null jika belum ada pengaturan yang disimpan", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      const decrypted = await store.readDecrypted();
      expect(decrypted).toBeNull();
      const masked = await store.readMasked();
      expect(masked).toBeNull();
    });

    it("menyimpan pengaturan dan membaca kembali data terdekripsi dan ter-masking", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      setSettingsStore(store);

      const saved = await store.save({
        workspaceUrl: "dbc-test.cloud.databricks.com",
        token: "dapi999988887777",
        catalog: "sales_cat",
        schema: "staging_schema",
        maxFileSizeMb: 50,
      });

      expect(saved.configured).toBe(true);
      expect(saved.workspaceUrl).toBe("https://dbc-test.cloud.databricks.com");
      expect(saved.tokenMasked).toBe("••••••••••••7777");
      expect(saved.catalog).toBe("sales_cat");
      expect(saved.schema).toBe("staging_schema");
      expect(saved.maxFileSizeMb).toBe(50);

      const decrypted = await store.readDecrypted();
      expect(decrypted?.token).toBe("dapi999988887777");
    });

    it("dapat menyimpan dan memperbarui hasil uji koneksi", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      await store.save({
        workspaceUrl: "dbc-test.cloud.databricks.com",
        token: "token-uji",
        catalog: "main",
        schema: "sales",
        maxFileSizeMb: 100,
      });

      const testResult = {
        success: true,
        testedAt: new Date().toISOString(),
        steps: [
          {
            name: "Host dapat dijangkau dan token valid",
            success: true,
          },
        ],
      };

      await store.saveTestResult(testResult);
      const updated = await store.readMasked();
      expect(updated?.lastTestResult?.success).toBe(true);
      expect(updated?.lastTestResult?.steps[0].name).toBe(
        "Host dapat dijangkau dan token valid"
      );
    });

    it("getConnectionState: mendeteksi pengaturan lengkap", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      setSettingsStore(store);

      await store.save({
        workspaceUrl: "dbc-test.cloud.databricks.com",
        token: "dapi12345678",
        catalog: "main",
        schema: "default",
      });

      const conn = await getConnectionState();
      expect(conn.ready).toBe(true);
      expect(conn.missing.length).toBe(0);
      expect(conn.error).toBeNull();
    });

    it("getConnectionState: mendeteksi setiap kolom yang belum diisi", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      setSettingsStore(store);

      await store.save({
        workspaceUrl: "",
        token: "dapi12345678",
        catalog: "main",
        schema: "default",
      });

      let conn = await getConnectionState();
      expect(conn.ready).toBe(false);
      expect(conn.missing).toContain("alamat");

      await store.save({
        workspaceUrl: "https://dbc-test.databricks.com",
        token: "",
        catalog: "main",
        schema: "default",
      });
      conn = await getConnectionState();
      expect(conn.ready).toBe(true);
      expect(conn.missing.length).toBe(0);
    });

    it("getConnectionState: error database tidak dilaporkan sebagai missing", async () => {
      const failingStore: SettingsStore = {
        async readDecrypted() {
          throw new Error("Neon timeout");
        },
        async readMasked() {
          throw new Error("Neon timeout");
        },
        async save() {
          throw new Error("Neon timeout");
        },
        async saveTestResult() {
          throw new Error("Neon timeout");
        },
      };
      setSettingsStore(failingStore);

      const conn = await getConnectionState();
      expect(conn.ready).toBe(false);
      expect(conn.error).toBe("database_tidak_terjangkau");
      expect(conn.missing.length).toBe(0);
    });

    it("partial update: menyimpan tanpa token tetap mempertahankan token lama", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      setSettingsStore(store);

      await store.save({
        workspaceUrl: "https://dbc.databricks.com",
        token: "dapi-initial-secret",
        catalog: "cat_a",
        schema: "sch_a",
      });

      await store.save({
        workspaceUrl: "https://dbc.databricks.com",
        catalog: "cat_b",
        schema: "sch_b",
      });

      const decrypted = await store.readDecrypted();
      expect(decrypted?.token).toBe("dapi-initial-secret");
      expect(decrypted?.catalog).toBe("cat_b");
      expect(decrypted?.schema).toBe("sch_b");
    });

    it("memotong spasi (trim) pada alamat, catalog, dan schema", async () => {
      const store = new FakeInMemorySettingsStore(dummyKey);
      setSettingsStore(store);

      await store.save({
        workspaceUrl: "   https://dbc.databricks.com/   ",
        token: "  dapi-secret   ",
        catalog: "   catalog_clean   ",
        schema: "   schema_clean   ",
      });

      const decrypted = await store.readDecrypted();
      expect(decrypted?.workspaceUrl).toBe("https://dbc.databricks.com");
      expect(decrypted?.token).toBe("dapi-secret");
      expect(decrypted?.catalog).toBe("catalog_clean");
      expect(decrypted?.schema).toBe("schema_clean");
    });
  });
});
