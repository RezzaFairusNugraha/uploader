import type { ConnectionTestResult, DecryptedSettings, TestStepResult } from "./settings";

export interface DatabricksResponse {
  success: boolean;
  status?: number;
  error?: string;
}

export interface DatabricksClient {
  checkDirectory: (directoryPath: string) => Promise<DatabricksResponse>;
  uploadFile: (filePath: string, body: BodyInit) => Promise<DatabricksResponse>;
}

export function createDatabricksClient(
  workspaceUrl: string,
  token: string
): DatabricksClient {
  const normalizedBase = workspaceUrl.replace(/\/+$/, "");

  const mapStatusToMessage = (status: number): string => {
    if (status === 401) {
      return "Token tidak valid atau kedaluwarsa";
    }
    if (status === 403) {
      return "Izin kurang (butuh READ VOLUME dan WRITE VOLUME)";
    }
    if (status === 404) {
      return "Path tidak ditemukan";
    }
    if (status === 409) {
      return "File sudah ada";
    }
    return `Permintaan gagal dengan kode status ${status}`;
  };

  return {
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
          error: mapStatusToMessage(response.status),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau",
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
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body,
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          return { success: true, status: response.status };
        }

        return {
          success: false,
          status: response.status,
          error: mapStatusToMessage(response.status),
        };
      } catch {
        return {
          success: false,
          error: "Host tidak terjangkau",
        };
      }
    },
  };
}

export async function runConnectionTest(
  settings: DecryptedSettings
): Promise<ConnectionTestResult> {
  const client = createDatabricksClient(settings.workspaceUrl, settings.token);
  const volumePath = `/Volumes/${settings.catalog}/${settings.schema}/${settings.volume}`;
  const csvPath = `${volumePath}/${settings.subfolderCsv}`;
  const parquetPath = `${volumePath}/${settings.subfolderParquet}`;

  const steps: TestStepResult[] = [];

  const volumeCheck = await client.checkDirectory(volumePath);

  if (!volumeCheck.success) {
    if (volumeCheck.error === "Host tidak terjangkau") {
      steps.push({
        name: "Host dapat dijangkau dan token valid",
        success: false,
        message: "Host tidak terjangkau",
        fix: "Pastikan URL workspace benar dan perangkat terhubung ke internet.",
      });
      steps.push({
        name: "Direktori Volume utama ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Selesaikan kendala koneksi host terlebih dahulu.",
      });
      steps.push({
        name: "Subfolder CSV ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Selesaikan kendala koneksi host terlebih dahulu.",
      });
      steps.push({
        name: "Subfolder Parquet ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Selesaikan kendala koneksi host terlebih dahulu.",
      });

      return {
        success: false,
        testedAt: new Date().toISOString(),
        steps,
      };
    }

    if (volumeCheck.status === 401) {
      steps.push({
        name: "Host dapat dijangkau dan token valid",
        success: false,
        message: volumeCheck.error,
        fix: "Periksa kembali Personal Access Token pada akun Databricks Anda dan simpan token baru.",
      });
      steps.push({
        name: "Direktori Volume utama ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Perbaiki token terlebih dahulu.",
      });
      steps.push({
        name: "Subfolder CSV ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Perbaiki token terlebih dahulu.",
      });
      steps.push({
        name: "Subfolder Parquet ditemukan",
        success: false,
        message: "Pemeriksaan dilewati",
        fix: "Perbaiki token terlebih dahulu.",
      });

      return {
        success: false,
        testedAt: new Date().toISOString(),
        steps,
      };
    }

    steps.push({
      name: "Host dapat dijangkau dan token valid",
      success: true,
    });

    if (volumeCheck.status === 403) {
      steps.push({
        name: "Direktori Volume utama ditemukan",
        success: false,
        message: volumeCheck.error,
        fix: `Berikan izin READ VOLUME dan WRITE VOLUME pada volume '${settings.volume}' di Unity Catalog.`,
      });
    } else if (volumeCheck.status === 404) {
      steps.push({
        name: "Direktori Volume utama ditemukan",
        success: false,
        message: volumeCheck.error,
        fix: `Pastikan path /Volumes/${settings.catalog}/${settings.schema}/${settings.volume} sudah dibuat di Databricks.`,
      });
    } else {
      steps.push({
        name: "Direktori Volume utama ditemukan",
        success: false,
        message: volumeCheck.error || "Gagal mengakses direktori",
        fix: "Periksa status direktori pada antarmuka Databricks.",
      });
    }

    steps.push({
      name: "Subfolder CSV ditemukan",
      success: false,
      message: "Pemeriksaan dilewati",
      fix: "Pastikan direktori Volume utama sudah valid dan dapat diakses.",
    });
    steps.push({
      name: "Subfolder Parquet ditemukan",
      success: false,
      message: "Pemeriksaan dilewati",
      fix: "Pastikan direktori Volume utama sudah valid dan dapat diakses.",
    });

    return {
      success: false,
      testedAt: new Date().toISOString(),
      steps,
    };
  }

  steps.push({
    name: "Host dapat dijangkau dan token valid",
    success: true,
  });
  steps.push({
    name: "Direktori Volume utama ditemukan",
    success: true,
  });

  const csvCheck = await client.checkDirectory(csvPath);
  if (csvCheck.success) {
    steps.push({
      name: "Subfolder CSV ditemukan",
      success: true,
    });
  } else {
    steps.push({
      name: "Subfolder CSV ditemukan",
      success: false,
      message: csvCheck.error,
      fix:
        csvCheck.status === 404
          ? `Buat folder '${settings.subfolderCsv}' di dalam direktori ${volumePath}.`
          : "Periksa izin akses pada subfolder CSV.",
    });
  }

  const parquetCheck = await client.checkDirectory(parquetPath);
  if (parquetCheck.success) {
    steps.push({
      name: "Subfolder Parquet ditemukan",
      success: true,
    });
  } else {
    steps.push({
      name: "Subfolder Parquet ditemukan",
      success: false,
      message: parquetCheck.error,
      fix:
        parquetCheck.status === 404
          ? `Buat folder '${settings.subfolderParquet}' di dalam direktori ${volumePath}.`
          : "Periksa izin akses pada subfolder Parquet.",
    });
  }

  const allPassed = steps.every((s) => s.success);

  return {
    success: allPassed,
    testedAt: new Date().toISOString(),
    steps,
  };
}
