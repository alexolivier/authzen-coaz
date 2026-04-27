export function log(prefix: string, message: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`[${prefix}] ${message}`);
    return;
  }
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  console.log(`[${prefix}] ${message} ${payload}`);
}
