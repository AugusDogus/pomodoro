export const DOCUMENT_ID_KEY = "pomodoro.automerge.documentId";

const BASE58CHECK = /^[1-9A-HJ-NP-Za-km-z]{16,64}$/;

export function isDocumentIdString(value: string): boolean {
  return BASE58CHECK.test(value);
}

export function parseCachedDocumentId(value: string | null): string | null {
  if (value === null || !isDocumentIdString(value)) return null;
  return value;
}

export function readCachedDocumentId(): string | null {
  return parseCachedDocumentId(window.localStorage.getItem(DOCUMENT_ID_KEY));
}

export function writeCachedDocumentId(documentId: string): void {
  window.localStorage.setItem(DOCUMENT_ID_KEY, documentId);
}

export function clearCachedDocumentId(): void {
  window.localStorage.removeItem(DOCUMENT_ID_KEY);
}
