export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const newArray = array.slice();
  newArray.splice(
    to < 0 ? newArray.length + to : to,
    0,
    newArray.splice(from, 1)[0]
  );
  return newArray;
}

export function generateStableColumnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `col-${crypto.randomUUID()}`;
  }
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
