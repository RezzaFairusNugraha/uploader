export function detectDelimiter(headerLine: string): string {
  let semicolonCount = 0;
  let commaCount = 0;
  let inQuotes = false;

  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ";") {
        semicolonCount++;
      } else if (char === ",") {
        commaCount++;
      }
    }
  }

  if (semicolonCount > commaCount) {
    return ";";
  }
  if (commaCount > semicolonCount) {
    return ",";
  }
  if (semicolonCount > 0) {
    return ";";
  }
  return commaCount > 0 ? "," : "";
}
