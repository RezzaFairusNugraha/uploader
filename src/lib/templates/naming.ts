import type { DatabricksClient } from "../databricks";

export const OBJECT_NAME_REGEX = /^[a-z][a-z0-9_]{2,59}$/;

export const RESERVED_SCHEMA_NAMES = new Set(["information_schema", "default"]);

export function isValidObjectName(name: string): boolean {
  return OBJECT_NAME_REGEX.test(name);
}

export function isReservedSchemaName(name: string): boolean {
  return RESERVED_SCHEMA_NAMES.has(name.toLowerCase());
}

export function resolveVolumeName(slug: string, defaultVolumeName?: string | null): string {
  const trimmed = defaultVolumeName?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return slug;
}

export function validateSchemaName(name: string): { valid: boolean; error?: string } {
  if (isReservedSchemaName(name)) {
    return {
      valid: false,
      error: "Nama folder sudah dipakai. Pilih nama lain.",
    };
  }
  if (!isValidObjectName(name)) {
    return {
      valid: false,
      error: "Nama folder harus 3-60 karakter, diawali huruf kecil, dan hanya berisi huruf kecil, angka, atau garis bawah.",
    };
  }
  return { valid: true };
}

export function validateVolumeName(name: string): { valid: boolean; error?: string } {
  if (!isValidObjectName(name)) {
    return {
      valid: false,
      error: "Nama volume harus 3-60 karakter, diawali huruf kecil, dan hanya berisi huruf kecil, angka, atau garis bawah.",
    };
  }
  return { valid: true };
}

export async function checkSchemaCollision(
  client: DatabricksClient,
  catalog: string,
  schemaName: string
): Promise<{ collision: boolean; error?: string }> {
  try {
    const res = await client.getSchema(catalog, schemaName);
    if (res.success && res.data) {
      return {
        collision: true,
        error: "Nama folder sudah dipakai. Pilih nama lain.",
      };
    }
  } catch {
    return { collision: false };
  }
  return { collision: false };
}
