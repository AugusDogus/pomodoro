import { describe, expect, test } from "bun:test";
import {
  messageForPermissionResult,
  permissionToResult,
  resolveEnableAttempt,
  timerAlertCopy,
} from "./notifications";

describe("notification permission results", () => {
  test("maps browser permission values", () => {
    expect(permissionToResult("granted")).toEqual({ status: "granted" });
    expect(permissionToResult("denied")).toEqual({ status: "denied" });
    expect(permissionToResult("default")).toEqual({ status: "dismissed" });
  });

  test("enables immediately when permission is already granted", () => {
    expect(resolveEnableAttempt({ available: true, current: "granted" })).toEqual({ status: "granted" });
  });

  test("does not prompt again when the browser already blocked alerts", () => {
    expect(resolveEnableAttempt({ available: true, current: "denied" })).toEqual({ status: "denied" });
  });

  test("treats a quiet or dismissed Edge prompt as dismissed", () => {
    expect(resolveEnableAttempt({ available: true, current: "default" })).toEqual({ status: "dismissed" });
    expect(resolveEnableAttempt({ available: true, current: "default", requested: "default" })).toEqual({
      status: "dismissed",
    });
  });

  test("enables after the user allows a prompt", () => {
    expect(resolveEnableAttempt({ available: true, current: "default", requested: "granted" })).toEqual({
      status: "granted",
    });
  });

  test("reports missing Notification support instead of failing silently", () => {
    expect(resolveEnableAttempt({ available: false, current: null })).toEqual({ status: "unsupported" });
  });
});

describe("permission messages", () => {
  test("explains why the desktop alert toggle stayed off", () => {
    expect(messageForPermissionResult({ status: "granted" })).toBeNull();
    expect(messageForPermissionResult({ status: "denied" })).toContain("blocked");
    expect(messageForPermissionResult({ status: "dismissed" })).toContain("Edge or Windows settings");
    expect(messageForPermissionResult({ status: "unsupported" })).toContain("aren’t available");
  });
});

describe("timer alert copy", () => {
  test("describes a finished focus session", () => {
    expect(timerAlertCopy("focus", false)).toEqual({
      title: "Focus session complete",
      body: "Your focus timer has ended.",
    });
    expect(timerAlertCopy("focus", true)).toEqual({
      title: "Focus session complete",
      body: "Your break timer has started.",
    });
  });

  test("describes a finished break", () => {
    expect(timerAlertCopy("break", false)).toEqual({
      title: "Break complete",
      body: "Your break timer has ended.",
    });
  });
});
