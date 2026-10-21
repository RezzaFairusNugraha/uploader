export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const lastDot = base.lastIndexOf(".");

  if (lastDot === -1) {
    const clean = base.replace(/[^A-Za-z0-9._-]/g, "_");
    return clean || "file";
  }

  const namePart = base.slice(0, lastDot).replace(/[^A-Za-z0-9._-]/g, "_");
  const extPart = base.slice(lastDot + 1).replace(/[^A-Za-z0-9._-]/g, "_");
  const cleanName = namePart || "file";

  return extPart ? `${cleanName}.${extPart}` : cleanName;
}

export function formatTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function buildDestinationFileName(
  templateId: string,
  originalFileName: string,
  now: Date = new Date()
): string {
  const lastDot = originalFileName.lastIndexOf(".");
  const ext =
    lastDot !== -1 ? originalFileName.slice(lastDot).toLowerCase() : ".csv";
  const timestamp = formatTimestamp(now);
  return `${templateId}__${timestamp}${ext}`;
}

export function getDestinationSubfolder(
  fileName: string,
  subfolderCsv: string = "csv",
  subfolderParquet: string = "parquet"
): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".parquet")) {
    return subfolderParquet || "parquet";
  }
  return subfolderCsv || "csv";
}

export function buildVolumePath(
  catalog: string,
  schema: string,
  volume: string,
  subfolder: string,
  fileName: string
): string {
  const cleanCatalog = catalog.trim();
  const cleanSchema = schema.trim();
  const cleanVolume = volume.trim();
  const cleanSubfolder = subfolder.trim();
  const cleanFileName = fileName.trim();

  return `/Volumes/${cleanCatalog}/${cleanSchema}/${cleanVolume}/${cleanSubfolder}/${cleanFileName}`;
}
