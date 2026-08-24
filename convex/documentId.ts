const BASE58CHECK = /^[1-9A-HJ-NP-Za-km-z]{16,64}$/;

export function isDocumentIdString(value: string): boolean {
  return BASE58CHECK.test(value);
}
