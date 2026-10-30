export interface DatabricksResponse<T = unknown> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
}

export interface UnityCatalogCatalogInfo {
  name: string;
  comment?: string;
}

export interface UnityCatalogSchemaInfo {
  name: string;
  catalog_name: string;
  comment?: string;
}

export interface UnityCatalogVolumeInfo {
  name: string;
  catalog_name: string;
  schema_name: string;
  volume_type: string;
  comment?: string;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  is_directory: boolean;
  file_size?: number;
  modification_time?: number;
}

export interface VolumeContentsSummary {
  csvFiles: number;
  csvSize: number;
  parquetFiles: number;
  parquetSize: number;
  totalFiles: number;
  totalSize: number;
  capped: boolean;
}

export interface DatabricksClient {
  listCatalogs: () => Promise<DatabricksResponse<{ catalogs: UnityCatalogCatalogInfo[] }>>;
  getCatalog: (catalog: string) => Promise<DatabricksResponse<UnityCatalogCatalogInfo>>;
  listSchemas: (catalog: string) => Promise<DatabricksResponse<{ schemas: UnityCatalogSchemaInfo[] }>>;
  getSchema: (catalog: string, schema: string) => Promise<DatabricksResponse<UnityCatalogSchemaInfo>>;
  createSchema: (
    catalog: string,
    schema: string,
    templateId: string
  ) => Promise<DatabricksResponse<UnityCatalogSchemaInfo>>;
  deleteSchema: (fullName: string) => Promise<DatabricksResponse>;
  listTables: (
    catalog: string,
    schema: string
  ) => Promise<DatabricksResponse<{ tables?: unknown[] }>>;
  isSchemaEmpty: (catalog: string, schema: string) => Promise<boolean>;
  getVolume: (catalog: string, schema: string, name: string) => Promise<DatabricksResponse<UnityCatalogVolumeInfo>>;
  listVolumes: (catalog: string, schema: string) => Promise<DatabricksResponse<{ volumes?: UnityCatalogVolumeInfo[] }>>;
  createVolume: (
    catalog: string,
    schema: string,
    name: string,
    comment?: string
  ) => Promise<DatabricksResponse<UnityCatalogVolumeInfo>>;
  deleteVolume: (fullName: string) => Promise<DatabricksResponse>;
  listVolumeContents: (
    slugOrPath: string,
    catalog?: string,
    schema?: string,
    csvFolder?: string,
    parquetFolder?: string
  ) => Promise<DatabricksResponse<VolumeContentsSummary>>;
  listDirectory: (path: string) => Promise<DatabricksResponse<{ contents: DirectoryEntry[] }>>;
  readRange: (path: string, start: number, length: number) => Promise<DatabricksResponse<Uint8Array>>;
  createDirectory: (path: string) => Promise<DatabricksResponse>;
  checkDirectory: (directoryPath: string) => Promise<DatabricksResponse>;
  uploadFile: (filePath: string, body: BodyInit) => Promise<DatabricksResponse>;
}

export function createDatabricksClient(
  workspaceUrl: string,
  token: string
): DatabricksClient {
  const normalizedBase = workspaceUrl.replace(/\/+$/, "");

  const mapStatusToMessage = (
    status: number,
    action: "createVolume" | "getSchema" | "getVolume" | "listVolumes" | "directory" | "upload" = "directory"
  ): string => {
    if (status === 401) {
      return "Token tidak valid atau kedaluwarsa";
    }
    if (status === 403) {
      if (action === "createVolume") {
        return "Izin kurang: token memerlukan izin CREATE VOLUME, USE CATALOG, dan USE SCHEMA pada skema ini";
      }
      if (action === "upload") {
        return "Izin kurang: token memerlukan izin WRITE VOLUME pada volume ini";
      }
      return "Izin kurang: token memerlukan izin akses pada Unity Catalog";
    }
    if (status === 404) {
      if (action === "getSchema") {
        return "Katalog atau skema tidak ditemukan";
      }
      if (action === "getVolume") {
        return "Volume tidak ditemukan";
      }
      return "Path tidak ditemukan";
    }
    if (status === 409) {
      if (action === "createVolume") {
        return "Volume sudah ada";
      }
      return "File sudah ada";
    }
    return `Permintaan gagal dengan kode status ${status}`;
  };

  const executeJson = async <T>(
    endpoint: string,
    method: "GET" | "POST",
    body?: unknown,
    action: "createVolume" | "getSchema" | "getVolume" | "listVolumes" = "getSchema"
  ): Promise<DatabricksResponse<T>> => {
    try {
      const response = await fetch(`${normalizedBase}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as T;
        return { success: true, status: response.status, data };
      }

      if (action === "createVolume" && response.status === 409) {
        return { success: true, status: 409, error: "Volume sudah ada" };
      }

      return {
        success: false,
        status: response.status,
        error: mapStatusToMessage(response.status, action),
      };
    } catch {
      return {
        success: false,
        error: "Host tidak terjangkau atau koneksi terputus",
      };
    }
  };

  return {
    async listCatalogs(): Promise<DatabricksResponse<{ catalogs: UnityCatalogCatalogInfo[] }>> {
      const all: UnityCatalogCatalogInfo[] = [];
      let pageToken: string | undefined = undefined;
      while (true) {
        let endpoint = "/api/2.1/unity-catalog/catalogs";
        if (pageToken) {
          endpoint += `?page_token=${encodeURIComponent(pageToken)}`;
        }
        const res = await executeJson<{ catalogs?: UnityCatalogCatalogInfo[]; next_page_token?: string }>(
          endpoint,
          "GET",
          undefined,
          "getSchema"
        );
        if (!res.success) {
          return { success: false, status: res.status, error: res.error };
        }
        if (res.data?.catalogs) {
          all.push(...res.data.catalogs);
        }
        if (!res.data?.next_page_token) {
          break;
        }
        pageToken = res.data.next_page_token;
      }
      return { success: true, data: { catalogs: all } };
    },

    async getCatalog(catalog: string): Promise<DatabricksResponse<UnityCatalogCatalogInfo>> {
      return executeJson<UnityCatalogCatalogInfo>(
        `/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalog)}`,
        "GET",
        undefined,
        "getSchema"
      );
    },

    async listSchemas(catalog: string): Promise<DatabricksResponse<{ schemas: UnityCatalogSchemaInfo[] }>> {
      const all: UnityCatalogSchemaInfo[] = [];
      let pageToken: string | undefined = undefined;
      while (true) {
        let endpoint = `/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`;
        if (pageToken) {
          endpoint += `&page_token=${encodeURIComponent(pageToken)}`;
        }
        const res = await executeJson<{ schemas?: UnityCatalogSchemaInfo[]; next_page_token?: string }>(
          endpoint,
          "GET",
          undefined,
          "getSchema"
        );
        if (!res.success) {
          return { success: false, status: res.status, error: res.error };
        }
        if (res.data?.schemas) {
          all.push(...res.data.schemas);
        }
        if (!res.data?.next_page_token) {
          break;
        }
        pageToken = res.data.next_page_token;
      }
      return { success: true, data: { schemas: all } };
    },

    async getSchema(catalog: string, schema: string): Promise<DatabricksResponse<UnityCatalogSchemaInfo>> {
      return executeJson<UnityCatalogSchemaInfo>(
        `/api/2.1/unity-catalog/schemas/${encodeURIComponent(catalog)}.${encodeURIComponent(schema)}`,
        "GET",
        undefined,
        "getSchema"
      );
    },

    async createSchema(
      catalog: string,
      schema: string,
      templateId: string
    ): Promise<DatabricksResponse<UnityCatalogSchemaInfo>> {
      const endpoint = "/api/2.1/unity-catalog/schemas";
      const body = {
        name: schema,
        catalog_name: catalog,
        comment: `Dibuat oleh Data Uploader (template ${templateId})`,
      };
      try {
        const response = await fetch(`${normalizedBase}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as UnityCatalogSchemaInfo;
          return { success: true, status: response.status, data };
        }

        if (response.status === 409) {
          return { success: true, status: 409, error: "Folder induk sudah ada" };
        }

        if (response.status === 403) {
          return {
            success: false,
            status: 403,
            error: "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin.",
          };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status, "createVolume"),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async deleteSchema(fullName: string): Promise<DatabricksResponse> {
      const url = `${normalizedBase}/api/2.1/unity-catalog/schemas/${encodeURIComponent(fullName)}`;
      try {
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (
          response.ok ||
          response.status === 200 ||
          response.status === 204 ||
          response.status === 404
        ) {
          return { success: true, status: response.status };
        }

        if (response.status === 403) {
          return {
            success: false,
            status: 403,
            error: "Izin kurang: token memerlukan izin untuk menghapus skema",
          };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status, "getSchema"),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async listTables(
      catalog: string,
      schema: string
    ): Promise<DatabricksResponse<{ tables?: unknown[] }>> {
      return executeJson<{ tables?: unknown[] }>(
        `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`,
        "GET",
        undefined,
        "getSchema"
      );
    },

    async isSchemaEmpty(catalog: string, schema: string): Promise<boolean> {
      const volRes = await this.listVolumes(catalog, schema);
      if (volRes.success && volRes.data?.volumes && volRes.data.volumes.length > 0) {
        return false;
      }
      const tblRes = await this.listTables(catalog, schema);
      if (tblRes.success && tblRes.data?.tables && tblRes.data.tables.length > 0) {
        return false;
      }
      return true;
    },

    async getVolume(
      catalog: string,
      schema: string,
      name: string
    ): Promise<DatabricksResponse<UnityCatalogVolumeInfo>> {
      return executeJson<UnityCatalogVolumeInfo>(
        `/api/2.1/unity-catalog/volumes/${encodeURIComponent(catalog)}.${encodeURIComponent(schema)}.${encodeURIComponent(name)}`,
        "GET",
        undefined,
        "getVolume"
      );
    },

    async listVolumes(
      catalog: string,
      schema: string
    ): Promise<DatabricksResponse<{ volumes: UnityCatalogVolumeInfo[] }>> {
      const all: UnityCatalogVolumeInfo[] = [];
      let pageToken: string | undefined = undefined;
      while (true) {
        let endpoint = `/api/2.1/unity-catalog/volumes?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`;
        if (pageToken) {
          endpoint += `&page_token=${encodeURIComponent(pageToken)}`;
        }
        const res = await executeJson<{ volumes?: UnityCatalogVolumeInfo[]; next_page_token?: string }>(
          endpoint,
          "GET",
          undefined,
          "listVolumes"
        );
        if (!res.success) {
          return { success: false, status: res.status, error: res.error };
        }
        if (res.data?.volumes) {
          all.push(...res.data.volumes);
        }
        if (!res.data?.next_page_token) {
          break;
        }
        pageToken = res.data.next_page_token;
      }
      return { success: true, data: { volumes: all } };
    },

    async createVolume(
      catalog: string,
      schema: string,
      name: string,
      comment?: string
    ): Promise<DatabricksResponse<UnityCatalogVolumeInfo>> {
      return executeJson<UnityCatalogVolumeInfo>(
        "/api/2.1/unity-catalog/volumes",
        "POST",
        {
          catalog_name: catalog,
          schema_name: schema,
          name,
          volume_type: "MANAGED",
          comment: comment || `Volume untuk template ${name}`,
        },
        "createVolume"
      );
    },

    async createDirectory(dirPath: string): Promise<DatabricksResponse> {
      const cleanPath = dirPath.startsWith("/") ? dirPath : `/${dirPath}`;
      const url = `${normalizedBase}/api/2.0/fs/directories${encodeURI(cleanPath)}`;

      try {
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok || response.status === 200 || response.status === 409) {
          return { success: true, status: response.status };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status, "directory"),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async checkDirectory(directoryPath: string): Promise<DatabricksResponse> {
      const cleanPath = directoryPath.startsWith("/")
        ? directoryPath
        : `/${directoryPath}`;
      const url = `${normalizedBase}/api/2.0/fs/directories${encodeURI(cleanPath)}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          return { success: true, status: response.status };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status, "directory"),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async uploadFile(
      filePath: string,
      body: BodyInit
    ): Promise<DatabricksResponse> {
      const cleanPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
      const url = `${normalizedBase}/api/2.0/fs/files${encodeURI(cleanPath)}?overwrite=false`;

      try {
        const isStream =
          typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body,
          signal: AbortSignal.timeout(60000),
          ...(isStream ? { duplex: "half" } : {}),
        } as RequestInit);

        if (response.ok) {
          return { success: true, status: response.status };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status, "upload"),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async deleteVolume(fullName: string): Promise<DatabricksResponse> {
      const url = `${normalizedBase}/api/2.1/unity-catalog/volumes/${encodeURIComponent(fullName)}`;
      try {
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (
          response.ok ||
          response.status === 200 ||
          response.status === 204 ||
          response.status === 404
        ) {
          return { success: true, status: response.status };
        }

        if (response.status === 403) {
          return {
            success: false,
            status: 403,
            error: "Token tidak memiliki hak untuk menghapus folder ini. Hubungi admin.",
          };
        }

        if (response.status === 401) {
          return {
            success: false,
            status: 401,
            error: "Token tidak valid atau kedaluwarsa",
          };
        }

        return {
          success: false,
          status: response.status,
          error: "Gagal menghapus folder penyimpanan di Databricks",
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },

    async listVolumeContents(
      slugOrPath: string,
      catalog?: string,
      schema?: string,
      csvFolder?: string,
      parquetFolder?: string
    ): Promise<DatabricksResponse<VolumeContentsSummary>> {
      let basePath = slugOrPath;
      if (basePath.startsWith("/Volumes/")) {
        basePath = basePath.replace(/\/+$/, "");
      } else if (catalog && schema) {
        basePath = `/Volumes/${catalog}/${schema}/${slugOrPath}`;
      } else if (slugOrPath.includes(".")) {
        const parts = slugOrPath.split(".");
        basePath = `/Volumes/${parts[0]}/${parts[1]}/${parts[2]}`;
      } else {
        basePath = `/Volumes/${slugOrPath}`;
      }

      const walkFolder = async (
        dirPath: string,
        maxEntries: number
      ): Promise<{ count: number; size: number; capped: boolean }> => {
        let count = 0;
        let size = 0;
        let pageToken: string | undefined = undefined;
        let capped = false;

        while (true) {
          const cleanPath = dirPath.startsWith("/") ? dirPath : `/${dirPath}`;
          let url = `${normalizedBase}/api/2.0/fs/directories${encodeURI(cleanPath)}`;
          if (pageToken) {
            url += `?page_token=${encodeURIComponent(pageToken)}`;
          }

          try {
            const response = await fetch(url, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              signal: AbortSignal.timeout(15000),
            });

            if (response.status === 404) {
              break;
            }
            if (!response.ok) {
              break;
            }

            const data = (await response.json()) as {
              contents?: Array<{
                path?: string;
                is_directory?: boolean;
                file_size?: number;
              }>;
              next_page_token?: string;
            };

            const contents = data.contents || [];
            for (const item of contents) {
              if (!item.is_directory) {
                count++;
                size += item.file_size || 0;
                if (count >= maxEntries) {
                  capped = true;
                  break;
                }
              }
            }

            if (capped || !data.next_page_token) {
              break;
            }
            pageToken = data.next_page_token;
          } catch {
            break;
          }
        }

        return { count, size, capped };
      };

      const MAX_TOTAL = 5000;
      const csvSub = csvFolder !== undefined ? csvFolder : "csv";
      const parquetSub = parquetFolder !== undefined ? parquetFolder : "parquet";
      const csvPath = csvSub ? `${basePath}/${csvSub}` : basePath;
      const parquetPath = parquetSub ? `${basePath}/${parquetSub}` : basePath;

      const csvRes = await walkFolder(csvPath, MAX_TOTAL);
      const remaining = MAX_TOTAL - csvRes.count;
      const parquetRes =
        remaining > 0
          ? await walkFolder(parquetPath, remaining)
          : { count: 0, size: 0, capped: true };

      const isCapped = csvRes.capped || parquetRes.capped;

      return {
        success: true,
        data: {
          csvFiles: csvRes.count,
          csvSize: csvRes.size,
          parquetFiles: parquetRes.count,
          parquetSize: parquetRes.size,
          totalFiles: csvRes.count + parquetRes.count,
          totalSize: csvRes.size + parquetRes.size,
          capped: isCapped,
        },
      };
    },

    async listDirectory(dirPath: string): Promise<DatabricksResponse<{ contents: DirectoryEntry[] }>> {
      const cleanPath = dirPath.startsWith("/") ? dirPath : `/${dirPath}`;
      const all: DirectoryEntry[] = [];
      let pageToken: string | undefined = undefined;

      while (true) {
        let url = `${normalizedBase}/api/2.0/fs/directories${encodeURI(cleanPath)}`;
        if (pageToken) {
          url += `?page_token=${encodeURIComponent(pageToken)}`;
        }

        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(15000),
          });

          if (response.status === 404) {
            return { success: true, data: { contents: [] } };
          }
          if (!response.ok) {
            return {
              success: false,
              status: response.status,
              error: mapStatusToMessage(response.status, "directory"),
            };
          }

          const data = (await response.json()) as {
            contents?: Array<{
              path?: string;
              is_directory?: boolean;
              file_size?: number;
              modification_time?: number;
            }>;
            next_page_token?: string;
          };

          for (const item of data.contents || []) {
            const rawPath = item.path || "";
            const name = rawPath.split("/").filter(Boolean).pop() || "";
            all.push({
              path: rawPath,
              name,
              is_directory: Boolean(item.is_directory),
              file_size: item.file_size,
              modification_time: item.modification_time,
            });
          }

          if (!data.next_page_token) {
            break;
          }
          pageToken = data.next_page_token;
        } catch {
          return {
            success: false,
            error: "Host tidak terjangkau atau koneksi terputus",
          };
        }
      }

      return { success: true, data: { contents: all } };
    },

    async readRange(
      filePath: string,
      start: number,
      length: number
    ): Promise<DatabricksResponse<Uint8Array>> {
      const cleanPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
      const url = `${normalizedBase}/api/2.0/fs/files${encodeURI(cleanPath)}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Range: `bytes=${start}-${start + length - 1}`,
          },
          signal: AbortSignal.timeout(20000),
        });

        if (response.status === 404) {
          return { success: false, status: 404, error: "File tidak ditemukan" };
        }
        if (!response.ok && response.status !== 206) {
          return {
            success: false,
            status: response.status,
            error: mapStatusToMessage(response.status, "upload"),
          };
        }

        const buffer = await response.arrayBuffer();
        let bytes = new Uint8Array(buffer);
        if (response.status === 200 && bytes.length > length) {
          bytes = bytes.subarray(start, start + length);
        }
        return { success: true, data: bytes };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau atau koneksi terputus",
        };
      }
    },
  };
}
