import type { TimerMode } from "./timer";

export type NotificationPermissionResult =
  | { status: "granted" }
  | { status: "denied" }
  | { status: "dismissed" }
  | { status: "unsupported" };

const REQUEST_TIMEOUT_MS = 4000;
const SERVICE_WORKER_TIMEOUT_MS = 1500;
const NOTIFICATION_TAG = "pomodoro-timer";

export function notificationApiAvailable(): boolean {
  return typeof Notification === "function";
}

export function permissionToResult(permission: NotificationPermission): NotificationPermissionResult {
  switch (permission) {
    case "granted":
      return { status: "granted" };
    case "denied":
      return { status: "denied" };
    case "default":
      return { status: "dismissed" };
    default: {
      const _exhaustive: never = permission;
      return _exhaustive;
    }
  }
}

export function resolveEnableAttempt(input: {
  available: boolean;
  current: NotificationPermission | null;
  requested?: NotificationPermission;
}): NotificationPermissionResult {
  if (!input.available || input.current === null) {
    return { status: "unsupported" };
  }

  switch (input.current) {
    case "granted":
      return { status: "granted" };
    case "denied":
      return { status: "denied" };
    case "default":
      return input.requested === undefined ? { status: "dismissed" } : permissionToResult(input.requested);
    default: {
      const _exhaustive: never = input.current;
      return _exhaustive;
    }
  }
}

export function messageForPermissionResult(result: NotificationPermissionResult): string | null {
  switch (result.status) {
    case "granted":
      return null;
    case "denied":
      return "Alerts are blocked for this app. Allow them in your browser or Windows settings, then try again.";
    case "dismissed":
      return "The permission prompt was hidden or dismissed. Allow notifications in Edge or Windows settings, then try again.";
    case "unsupported":
      return "Desktop alerts aren’t available in this window.";
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export function timerAlertCopy(
  mode: TimerMode,
  autoStartBreaks: boolean,
): { title: string; body: string } {
  switch (mode) {
    case "focus":
      return {
        title: "Focus session complete",
        body: autoStartBreaks ? "Your break timer has started." : "Your focus timer has ended.",
      };
    case "break":
      return {
        title: "Break complete",
        body: "Your break timer has ended.",
      };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export async function enableDesktopAlerts(): Promise<NotificationPermissionResult> {
  if (!notificationApiAvailable()) {
    return resolveEnableAttempt({ available: false, current: null });
  }

  const current = Notification.permission;
  if (current !== "default") {
    return resolveEnableAttempt({ available: true, current });
  }

  try {
    const requested = await withTimeout(
      Notification.requestPermission(),
      REQUEST_TIMEOUT_MS,
      () => Notification.permission,
    );
    return resolveEnableAttempt({ available: true, current: "default", requested });
  } catch {
    return { status: "unsupported" };
  }
}

export async function showDesktopAlert(title: string, body: string): Promise<void> {
  if (!notificationApiAvailable() || Notification.permission !== "granted") {
    return;
  }

  const options: NotificationOptions = {
    body,
    icon: new URL("/pwa-192x192.png", window.location.origin).toString(),
    tag: NOTIFICATION_TAG,
  };

  const registration = await readyServiceWorker();
  if (registration !== null) {
    await registration.showNotification(title, options);
    return;
  }

  new Notification(title, options);
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await withTimeout(navigator.serviceWorker.ready, SERVICE_WORKER_TIMEOUT_MS, () => null);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(fallback()), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
