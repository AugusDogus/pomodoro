import {
  Bell,
  BellOff,
  Check,
  Cloud,
  CloudOff,
  ListTodo,
  LogIn,
  LogOut,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Timer as TimerIcon,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  durationSeconds,
  firstName,
  localDateKey,
  MAX_BREAK_MINUTES,
  MAX_FOCUS_MINUTES,
  parseStoredState,
  sameSnapshot,
  touchState,
  type Preferences,
  type StoredAppState,
  type Task,
} from "../lib/app-state";
import {
  clearSyncHint,
  initialSyncStatus,
  mergeRemoteState,
  readSyncHint,
  remoteStateFromStored,
  STORAGE_KEY,
  storedStateFromRemote,
  writeLocalState,
  writeSyncHint,
  type SyncStatus,
} from "../lib/app-sync";
import {
  enableDesktopAlerts,
  messageForPermissionResult,
  showDesktopAlert,
  timerAlertCopy,
  type NotificationPermissionResult,
} from "../lib/notifications";
import {
  clearCachedUser,
  readCachedUser,
  signedInUser,
  toSessionUser,
  writeCachedUser,
  type SessionUser,
} from "../lib/session-user";
import { formatTime, progressFor, remainingFromEnd, type TimerMode } from "../lib/timer";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "./ui/drawer";

type TimerStatus = "idle" | "running" | "paused";
type MobileView = "timer" | "tasks";
type AlertIssue = Exclude<NotificationPermissionResult, { status: "granted" }>;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_DISMISSED_KEY = "pomodoro.install-dismissed.v1";
const CIRCLE_RADIUS = 148;
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event &&
    event.userChoice instanceof Promise
  );
}

function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const suffix = name === null ? "." : `, ${name}.`;
  if (hour < 12) return `Good morning${suffix}`;
  if (hour < 18) return `Good afternoon${suffix}`;
  return `Good evening${suffix}`;
}

function playChime(): void {
  const AudioContextConstructor = window.AudioContext;
  const context = new AudioContextConstructor();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
  gain.connect(context.destination);

  [523.25, 659.25].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.16);
    oscillator.stop(context.currentTime + 0.9);
  });
}

export default function FocusApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const remoteUser = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  const remoteState = useQuery(api.appState.get, isAuthenticated ? {} : "skip");
  const saveRemoteState = useMutation(api.appState.save);
  const [storedState, setStoredState] = useState<StoredAppState>(() =>
    parseStoredState(window.localStorage.getItem(STORAGE_KEY)),
  );
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => readCachedUser());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    initialSyncStatus(navigator.onLine, readSyncHint()),
  );
  const [mode, setMode] = useState<TimerMode>("focus");
  const [mobileView, setMobileView] = useState<MobileView>("timer");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [remaining, setRemaining] = useState(() => durationSeconds(storedState.preferences, "focus"));
  const [endTime, setEndTime] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true",
  );
  const [shouldAutoStartBreak, setShouldAutoStartBreak] = useState(false);
  const [alertIssue, setAlertIssue] = useState<AlertIssue | null>(null);
  const completedRef = useRef(false);
  const reconciledRef = useRef(false);
  const guestStartRef = useRef(false);
  const latestState = useRef(storedState);
  latestState.current = storedState;
  const account = signedInUser(sessionUser);

  function updateState(updater: (current: StoredAppState) => StoredAppState) {
    setStoredState((current) => touchState(updater(current)));
  }

  const selectedTask = useMemo(
    () => storedState.tasks.find((task) => task.id === storedState.selectedTaskId) ?? null,
    [storedState.selectedTaskId, storedState.tasks],
  );
  const completedTasks = storedState.tasks.filter((task) => task.completed).length;
  const taskProgress = storedState.tasks.length === 0 ? 0 : completedTasks / storedState.tasks.length;
  const totalSeconds = durationSeconds(storedState.preferences, mode);
  const timerProgress = progressFor(remaining, totalSeconds);
  const circleOffset = CIRCLE_LENGTH * (1 - timerProgress);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (!isOnline || guestStartRef.current) return;
      guestStartRef.current = true;
      void signIn("anonymous").finally(() => {
        guestStartRef.current = false;
      });
      return;
    }
    if (remoteUser === undefined || remoteUser === null) return;
    const nextUser = toSessionUser(remoteUser);
    writeCachedUser(nextUser);
    setSessionUser((current) => {
      if (current === null || current.id !== nextUser.id || current.kind !== nextUser.kind) {
        reconciledRef.current = false;
      }
      return nextUser;
    });
  }, [isAuthenticated, isLoading, isOnline, remoteUser, signIn]);

  useEffect(() => {
    if (!isAuthenticated || remoteState === undefined) return;
    if (remoteState === null) {
      reconciledRef.current = true;
      return;
    }
    if (remoteState.updatedAt < latestState.current.updatedAt) {
      reconciledRef.current = true;
      return;
    }
    const merged = mergeRemoteState(latestState.current, remoteState);
    reconciledRef.current = true;
    if (sameSnapshot(merged, latestState.current) && merged.updatedAt === latestState.current.updatedAt) {
      setSyncStatus({ kind: "synced" });
      return;
    }
    setStoredState(merged);
    writeLocalState(merged);
    setSyncStatus({ kind: "synced" });
  }, [isAuthenticated, remoteState]);

  useEffect(() => {
    writeLocalState(storedState);
    if (!isAuthenticated || !reconciledRef.current || !isOnline) return;
    if (remoteState !== undefined && remoteState !== null) {
      const remoteStored = storedStateFromRemote(remoteState);
      if (sameSnapshot(storedState, remoteStored) && storedState.updatedAt === remoteStored.updatedAt) {
        return;
      }
    }
    void saveRemoteState({ state: remoteStateFromStored(storedState) })
      .then(() => {
        setSyncStatus({ kind: "synced" });
      })
      .catch(() => {
        setSyncStatus({
          kind: "error",
          message: "Cloud save failed. Changes are still on this device.",
        });
      });
  }, [isAuthenticated, isOnline, remoteState, saveRemoteState, storedState]);

  useEffect(() => {
    writeSyncHint(syncStatus);
  }, [syncStatus]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus({ kind: "offline" });
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isInstallPromptEvent(event)) {
        setInstallPrompt(event);
      }
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const completeTimer = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setStatus("idle");
    setEndTime(null);

    if (storedState.preferences.sound) playChime();
    if (storedState.preferences.notifications) {
      const alert = timerAlertCopy(mode, storedState.preferences.autoStartBreaks);
      void showDesktopAlert(alert.title, alert.body);
    }

    if (mode === "focus") {
      updateState((current) => ({
        ...current,
        completedSessions: current.sessionDate === localDateKey() ? current.completedSessions + 1 : 1,
        sessionDate: localDateKey(),
        tasks: current.tasks.map((task) =>
          task.id === current.selectedTaskId ? { ...task, pomodoros: task.pomodoros + 1 } : task,
        ),
      }));
      setMode("break");
      setRemaining(durationSeconds(storedState.preferences, "break"));
      setShouldAutoStartBreak(storedState.preferences.autoStartBreaks);
    } else {
      setMode("focus");
      setRemaining(durationSeconds(storedState.preferences, "focus"));
    }
  }, [mode, storedState.preferences]);

  useEffect(() => {
    if (!shouldAutoStartBreak || mode !== "break" || status !== "idle") return;
    const breakSeconds = durationSeconds(storedState.preferences, "break");
    completedRef.current = false;
    setRemaining(breakSeconds);
    setEndTime(Date.now() + breakSeconds * 1000);
    setStatus("running");
    setShouldAutoStartBreak(false);
  }, [mode, shouldAutoStartBreak, status, storedState.preferences]);

  useEffect(() => {
    if (status !== "running" || endTime === null) return;
    const update = () => {
      const nextRemaining = remainingFromEnd(endTime, Date.now());
      setRemaining(nextRemaining);
      if (nextRemaining === 0) completeTimer();
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [completeTimer, endTime, status]);

  useEffect(() => {
    document.title = status === "running" ? `${formatTime(remaining)} · ${mode === "focus" ? "Focus" : "Break"}` : "Pomodoro — Focus gently";
  }, [mode, remaining, status]);

  function toggleTimer() {
    completedRef.current = false;
    if (status === "running") {
      if (endTime !== null) setRemaining(remainingFromEnd(endTime, Date.now()));
      setStatus("paused");
      setEndTime(null);
      return;
    }
    setEndTime(Date.now() + remaining * 1000);
    setStatus("running");
  }

  function resetTimer() {
    completedRef.current = false;
    setShouldAutoStartBreak(false);
    setStatus("idle");
    setEndTime(null);
    setRemaining(durationSeconds(storedState.preferences, mode));
  }

  function changeMode(nextMode: TimerMode) {
    completedRef.current = false;
    setShouldAutoStartBreak(false);
    setMode(nextMode);
    setStatus("idle");
    setEndTime(null);
    setRemaining(durationSeconds(storedState.preferences, nextMode));
  }

  function adjustDuration(targetMode: TimerMode, delta: number) {
    if (status === "running") return;
    const preferenceKey = targetMode === "focus" ? "focusMinutes" : "breakMinutes";
    const maximum = targetMode === "focus" ? MAX_FOCUS_MINUTES : MAX_BREAK_MINUTES;
    const nextMinutes = Math.min(maximum, Math.max(1, storedState.preferences[preferenceKey] + delta));

    updateState((current) => ({
      ...current,
      preferences: { ...current.preferences, [preferenceKey]: nextMinutes },
    }));
    if (mode === targetMode) setRemaining(nextMinutes * 60);
  }

  function addTask(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (title.length === 0) return;
    const task: Task = { id: crypto.randomUUID(), title, completed: false, pomodoros: 0 };
    updateState((current) => ({
      ...current,
      tasks: [...current.tasks, task],
      selectedTaskId: current.selectedTaskId ?? task.id,
    }));
    setTaskTitle("");
  }

  function toggleTask(taskId: string) {
    updateState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  function deleteTask(taskId: string) {
    updateState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
      selectedTaskId: current.selectedTaskId === taskId ? null : current.selectedTaskId,
    }));
  }

  function selectTask(taskId: string) {
    updateState((current) => ({ ...current, selectedTaskId: taskId }));
    setMobileView("timer");
  }

  async function toggleNotifications() {
    if (storedState.preferences.notifications) {
      setAlertIssue(null);
      updateState((current) => ({
        ...current,
        preferences: { ...current.preferences, notifications: false },
      }));
      return;
    }

    const result = await enableDesktopAlerts();
    switch (result.status) {
      case "granted":
        setAlertIssue(null);
        updateState((current) => ({
          ...current,
          preferences: { ...current.preferences, notifications: true },
        }));
        void showDesktopAlert("Desktop alerts on", "You’ll get a notice when a timer ends.");
        return;
      case "denied":
      case "dismissed":
      case "unsupported":
        setAlertIssue(result);
        return;
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  }

  async function installApp() {
    if (installPrompt === null) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function dismissInstall() {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setInstallDismissed(true);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark" aria-label="Pomodoro home">pom<span>.</span></div>
        <div className="header-actions">
          <span
            className="offline-status"
            data-quiet={syncStatus.kind === "pending"}
            title={syncStatus.kind === "pending" ? undefined : syncStatusLabel(syncStatus, isOnline)}
          >
            {isOnline && syncStatus.kind !== "offline" ? <Cloud aria-hidden="true" size={15} /> : <CloudOff aria-hidden="true" size={15} />}
            {syncStatusLabel(syncStatus, isOnline)}
          </span>
          <div className="account-cluster">
            <SettingsControl
              alertIssue={alertIssue}
              durationLocked={status === "running"}
              onAdjustDuration={adjustDuration}
              onSignIn={() => void signIn("discord", { redirectTo: "/" })}
              onSignOut={() => {
                clearSyncHint();
                clearCachedUser();
                setSessionUser(null);
                void signOut();
              }}
              onToggleAutoStartBreaks={() => updateState((current) => ({
                ...current,
                preferences: { ...current.preferences, autoStartBreaks: !current.preferences.autoStartBreaks },
              }))}
              onToggleNotifications={toggleNotifications}
              onToggleSound={() => updateState((current) => ({
                ...current,
                preferences: { ...current.preferences, sound: !current.preferences.sound },
              }))}
              preferences={storedState.preferences}
              sessionUser={sessionUser}
              syncStatus={syncStatus}
            />
            {account === null ? (
              <Button
                className="account-cluster-identity"
                onClick={() => void signIn("discord", { redirectTo: "/" })}
                size="small"
                variant="ghost"
              >
                <LogIn aria-hidden="true" size={14} />
                Sign in
              </Button>
            ) : (
              <span className="account-cluster-identity">
                {account.image !== null && <img alt="" src={account.image} />}
                {firstName(account.name)}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="page-intro">
        <div>
          <h1>{getGreeting(account === null ? null : firstName(account.name))}</h1>
        </div>
      </section>

      <div className="workspace-grid">
        <section
          aria-labelledby="mobile-timer-tab"
          className="focus-card"
          data-mobile-active={mobileView === "timer"}
          id="timer-panel"
          role="tabpanel"
        >
          <div className="mode-switcher" aria-label="Timer mode">
            <button aria-pressed={mode === "focus"} onClick={() => changeMode("focus")}>Focus <span>{storedState.preferences.focusMinutes}m</span></button>
            <button aria-pressed={mode === "break"} onClick={() => changeMode("break")}>Break <span>{storedState.preferences.breakMinutes}m</span></button>
          </div>

          <div className="timer-wrap" aria-live="polite" aria-atomic="true">
            <svg className="timer-ring" viewBox="0 0 320 320" aria-hidden="true">
              <circle className="timer-ring-track" cx="160" cy="160" r={CIRCLE_RADIUS} />
              <circle
                className="timer-ring-progress"
                cx="160"
                cy="160"
                r={CIRCLE_RADIUS}
                strokeDasharray={CIRCLE_LENGTH}
                strokeDashoffset={circleOffset}
              />
            </svg>
            <div className="timer-content">
              <strong>{formatTime(remaining)}</strong>
              <span className="timer-task">{selectedTask?.title ?? "Choose a task for this session"}</span>
            </div>
          </div>

          <div className="timer-actions">
            <Button className="timer-primary" onClick={toggleTimer}>
              {status === "running" ? <Pause aria-hidden="true" fill="currentColor" size={18} /> : <Play aria-hidden="true" fill="currentColor" size={18} />}
              {status === "running" ? "Pause" : status === "paused" ? "Resume" : `Start ${mode}`}
            </Button>
            <Button aria-label="Reset timer" className="timer-reset" onClick={resetTimer} size="icon" variant="secondary">
              <RotateCcw aria-hidden="true" size={18} />
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="mobile-tasks-tab"
          className="tasks-card"
          data-mobile-active={mobileView === "tasks"}
          id="tasks-panel"
          role="tabpanel"
        >
          <div className="tasks-header">
            <div>
              <h2 id="tasks-heading">Tasks</h2>
            </div>
            <span className="task-count">{completedTasks}/{storedState.tasks.length}</span>
          </div>

          <div className="task-progress" aria-label={`${Math.round(taskProgress * 100)}% of tasks complete`}>
            <span style={{ transform: `scaleX(${taskProgress})` }} />
          </div>

          <div className="task-list">
            {storedState.tasks.map((task) => (
                <div className="task-row" data-completed={task.completed} data-selected={task.id === storedState.selectedTaskId} key={task.id}>
                  <Checkbox
                    aria-label={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
                    checked={task.completed}
                    onCheckedChange={() => toggleTask(task.id)}
                  />
                  <button
                    className="task-select"
                    onClick={() => selectTask(task.id)}
                  >
                    <span>{task.title}</span>
                    <small>{task.pomodoros > 0 ? `${task.pomodoros} ${task.pomodoros === 1 ? "session" : "sessions"}` : task.id === storedState.selectedTaskId ? "Focusing next" : "Choose to focus"}</small>
                  </button>
                  {task.id === storedState.selectedTaskId && !task.completed && <span className="selected-mark"><Check aria-hidden="true" size={11} /> Next</span>}
                  <Button aria-label={`Delete ${task.title}`} className="task-delete" onClick={() => deleteTask(task.id)} size="icon" variant="ghost">
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </div>
              ))}
          </div>

          <form className="add-task" onSubmit={addTask}>
            <Plus aria-hidden="true" size={18} />
            <input
              aria-label="New task"
              maxLength={100}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Add a task…"
              value={taskTitle}
            />
            <Button disabled={taskTitle.trim().length === 0} size="small" type="submit">Add</Button>
          </form>
        </section>
      </div>

      <nav aria-label="Main navigation" className="mobile-tabs" role="tablist">
        <button
          aria-controls="timer-panel"
          aria-selected={mobileView === "timer"}
          id="mobile-timer-tab"
          onClick={() => setMobileView("timer")}
          role="tab"
        >
          <TimerIcon aria-hidden="true" size={19} />
          Timer
        </button>
        <button
          aria-controls="tasks-panel"
          aria-selected={mobileView === "tasks"}
          id="mobile-tasks-tab"
          onClick={() => setMobileView("tasks")}
          role="tab"
        >
          <ListTodo aria-hidden="true" size={19} />
          Tasks
        </button>
      </nav>

      {installPrompt !== null && !installDismissed && (
        <InstallBanner onDismiss={dismissInstall} onInstall={installApp} />
      )}

    </main>
  );
}

type SettingsControlProps = {
  alertIssue: AlertIssue | null;
  durationLocked: boolean;
  onAdjustDuration: (mode: TimerMode, delta: number) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleAutoStartBreaks: () => void;
  onToggleNotifications: () => void;
  onToggleSound: () => void;
  preferences: Preferences;
  sessionUser: SessionUser | null;
  syncStatus: SyncStatus;
};

function syncStatusLabel(status: SyncStatus, isOnline: boolean): string {
  switch (status.kind) {
    case "pending":
      return "";
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing";
    case "offline":
      return "Working offline";
    case "local":
      return isOnline ? "Saved locally" : "Working offline";
    case "error":
      return "Saved locally";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function SettingsControl(props: SettingsControlProps) {
  return (
    <>
      <div className="settings-desktop">
        <Dialog>
          <DialogTrigger asChild>
            <Button aria-label="Open settings" className="account-cluster-settings" size="icon" variant="ghost">
              <Settings2 aria-hidden="true" size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Timer, sound, and notification settings.</DialogDescription>
            <SettingsBody {...props} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="settings-mobile">
        <Drawer>
          <DrawerTrigger asChild>
            <Button aria-label="Open settings" className="account-cluster-settings" size="icon" variant="ghost">
              <Settings2 aria-hidden="true" size={16} />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="drawer-heading">
              <div>
                <DrawerTitle>Settings</DrawerTitle>
                <DrawerDescription>Timer, sound, and notification settings.</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button aria-label="Close settings" className="drawer-close" size="icon" variant="ghost">
                  <X aria-hidden="true" size={18} />
                </Button>
              </DrawerClose>
            </div>
            <SettingsBody {...props} />
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function SettingsBody({
  alertIssue,
  durationLocked,
  onAdjustDuration,
  onSignIn,
  onSignOut,
  onToggleAutoStartBreaks,
  onToggleNotifications,
  onToggleSound,
  preferences,
  sessionUser,
  syncStatus,
}: SettingsControlProps) {
  const alertMessage = alertIssue === null ? null : messageForPermissionResult(alertIssue);
  return (
    <>
        <div className="duration-settings">
          <DurationRow
            disabled={durationLocked}
            label="Focus"
            maximum={MAX_FOCUS_MINUTES}
            minutes={preferences.focusMinutes}
            onChange={(delta) => onAdjustDuration("focus", delta)}
          />
          <DurationRow
            disabled={durationLocked}
            label="Break"
            maximum={MAX_BREAK_MINUTES}
            minutes={preferences.breakMinutes}
            onChange={(delta) => onAdjustDuration("break", delta)}
          />
        </div>
        <div className="settings-list">
          <button aria-pressed={preferences.autoStartBreaks} className="settings-row" onClick={onToggleAutoStartBreaks}>
            <span className="settings-icon"><Play aria-hidden="true" size={18} /></span>
            <span><strong>Auto-start breaks</strong><small>After focus sessions</small></span>
            <span className="switch" data-checked={preferences.autoStartBreaks}><i /></span>
          </button>
          <button aria-pressed={preferences.sound} className="settings-row" onClick={onToggleSound}>
            <span className="settings-icon">{preferences.sound ? <Volume2 aria-hidden="true" size={18} /> : <VolumeX aria-hidden="true" size={18} />}</span>
            <span><strong>Sound</strong><small>A soft chime when time is up</small></span>
            <span className="switch" data-checked={preferences.sound}><i /></span>
          </button>
          <button aria-pressed={preferences.notifications} className="settings-row" onClick={onToggleNotifications}>
            <span className="settings-icon">{preferences.notifications ? <Bell aria-hidden="true" size={18} /> : <BellOff aria-hidden="true" size={18} />}</span>
            <span><strong>Desktop alerts</strong><small>Helpful when the app is in the background</small></span>
            <span className="switch" data-checked={preferences.notifications}><i /></span>
          </button>
        </div>
        {alertMessage !== null && (
          <div className="settings-note" role="status">
            <BellOff aria-hidden="true" size={17} />
            <p>{alertMessage}</p>
          </div>
        )}
        {sessionUser?.kind === "signed-in" ? (
          <button className="settings-row" onClick={onSignOut} type="button">
            <span className="settings-icon"><LogOut aria-hidden="true" size={18} /></span>
            <span><strong>Sign out</strong><small>{sessionUser.name}</small></span>
          </button>
        ) : (
          <button className="settings-row" onClick={onSignIn} type="button">
            <span className="settings-icon"><LogIn aria-hidden="true" size={18} /></span>
            <span><strong>Sign in with Discord</strong><small>Keep your current tasks on your account</small></span>
          </button>
        )}
        <div className="settings-note">
          <Cloud aria-hidden="true" size={17} />
          <p>
            {syncStatus.kind === "error"
              ? syncStatus.message
              : sessionUser?.kind === "signed-in"
                ? "Your tasks stay on this device and sync when you're online."
                : "Tasks stay on this device and sync as a guest. Sign in with Discord to keep them on your account."}
          </p>
        </div>
    </>
  );
}

type InstallBannerProps = {
  onDismiss: () => void;
  onInstall: () => void;
};

function InstallBanner({ onDismiss, onInstall }: InstallBannerProps) {
  return (
    <aside aria-label="Install Pomodoro" className="install-banner">
      <span>Install Pomodoro</span>
      <div>
        <Button onClick={onInstall} size="small">Install</Button>
        <Button aria-label="Dismiss install prompt" className="install-dismiss" onClick={onDismiss} size="icon" variant="ghost">
          <X aria-hidden="true" size={16} />
        </Button>
      </div>
    </aside>
  );
}

type DurationRowProps = {
  disabled: boolean;
  label: string;
  maximum: number;
  minutes: number;
  onChange: (delta: number) => void;
};

function DurationRow({ disabled, label, maximum, minutes, onChange }: DurationRowProps) {
  return (
    <div className="duration-row">
      <span>{label}</span>
      <div className="duration-stepper">
        <Button
          aria-label={`Decrease ${label.toLowerCase()} timer`}
          className="duration-button"
          disabled={disabled || minutes <= 1}
          onClick={() => onChange(-5)}
          size="icon"
          variant="ghost"
        >
          <Minus aria-hidden="true" size={14} />
        </Button>
        <output aria-live="polite">{minutes} min</output>
        <Button
          aria-label={`Increase ${label.toLowerCase()} timer`}
          className="duration-button"
          disabled={disabled || minutes >= maximum}
          onClick={() => onChange(5)}
          size="icon"
          variant="ghost"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
    </div>
  );
}
