export interface SyncProgress {
  current: number;
  total: number;
  label: string;
}

export async function syncVolumesLoop<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  onProgress?: (progress: SyncProgress) => void
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;
  for (let i = 0; i < total; i++) {
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        label: `Memeriksa ${i + 1} dari ${total} folder`,
      });
    }
    const res = await processor(items[i], i);
    results.push(res);
  }
  return results;
}
