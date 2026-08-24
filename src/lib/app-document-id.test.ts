import { describe, expect, test } from "bun:test";
import { isDocumentIdString, parseCachedDocumentId } from "./app-document-id";

describe("app document id", () => {
  test("accepts base58check-shaped ids", () => {
    expect(isDocumentIdString("8LBM7yobAFhxQTo9LDWkjcxBrmH")).toBe(true);
    expect(isDocumentIdString("not valid")).toBe(false);
    expect(isDocumentIdString("")).toBe(false);
  });

  test("parseCachedDocumentId rejects junk", () => {
    expect(parseCachedDocumentId("8LBM7yobAFhxQTo9LDWkjcxBrmH")).toBe("8LBM7yobAFhxQTo9LDWkjcxBrmH");
    expect(parseCachedDocumentId(null)).toBeNull();
    expect(parseCachedDocumentId("automerge:nope")).toBeNull();
  });
});
