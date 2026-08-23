import {
  Bell,
  BellOff,
  Check,
  Cloud,
  CloudOff,
  ListTodo,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, progressFor, remainingFromEnd, TIMER_SECONDS, type TimerMode } from "../lib/timer";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "./ui/drawer";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  pomodoros: number;
};

type TimerStatus = "idle" | "running" | "paused";
type MobileView = "timer" | "tasks";

type Preferences = {
  sound: boolean;
  notifications: boolean;
  autoStartBreaks: boolean;
  focusMinutes: number;
  breakMinutes: number;
};

type StoredAppState = {
  tasks: Task[];
  selectedTaskId: string | null;
  completedSessions: number;
  sessionDate: string;
  preferences: Preferences;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "pomodoro.study-state.v1";
const INSTALL_DISMISSED_KEY = "pomodoro.install-dismissed.v1";
const CIRCLE_RADIUS = 148;
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;
const MAX_FOCUS_MINUTES = 120;
const MAX_BREAK_MINUTES = 60;

function localDateKey(): string {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function defaultState(): StoredAppState {
  return {
    tasks: [],
    selectedTaskId: null,
    completedSessions: 0,
    sessionDate: localDateKey(),
    preferences: {
      sound: true,
      notifications: false,
      autoStartBreaks: false,
      focusMinutes: TIMER_SECONDS.focus / 60,
      breakMinutes: TIMER_SECONDS.break / 60,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event &&
    event.userChoice instanceof Promise
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.completed === "boolean" &&
    typeof value.pomodoros === "number"
  );
}

function parseDuration(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum
    ? value
    : fallback;
}

function durationSeconds(preferences: Preferences, mode: TimerMode): number {
  return (mode === "focus" ? preferences.focusMinutes : preferences.breakMinutes) * 60;
}

function parseStoredState(raw: string | null): StoredAppState {
  if (raw === null) return defaultState();

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return defaultState();
    if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) return defaultState();
    if (value.selectedTaskId !== null && typeof value.selectedTaskId !== "string") return defaultState();
    if (typeof value.completedSessions !== "number") return defaultState();
    if (!isRecord(value.preferences)) return defaultState();
    if (typeof value.preferences.sound !== "boolean" || typeof value.preferences.notifications !== "boolean") {
      return defaultState();
    }

    const today = localDateKey();
    const storedDate = typeof value.sessionDate === "string" ? value.sessionDate : today;

    return {
      tasks: value.tasks,
      selectedTaskId: value.selectedTaskId,
      completedSessions: storedDate === today ? value.completedSessions : 0,
      sessionDate: today,
      preferences: {
        sound: value.preferences.sound,
        notifications: value.preferences.notifications,
        autoStartBreaks: typeof value.preferences.autoStartBreaks === "boolean" ? value.preferences.autoStartBreaks : false,
        focusMinutes: parseDuration(value.preferences.focusMinutes, TIMER_SECONDS.focus / 60, MAX_FOCUS_MINUTES),
        breakMinutes: parseDuration(value.preferences.breakMinutes, TIMER_SECONDS.break / 60, MAX_BREAK_MINUTES),
      },
    };
  } catch {
    return defaultState();
  }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning, Alex.";
  if (hour < 18) return "Good afternoon, Alex.";
  return "Good evening, Alex.";
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
  const [storedState, setStoredState] = useState<StoredAppState>(() =>
    parseStoredState(window.localStorage.getItem(STORAGE_KEY)),
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
  const completedRef = useRef(false);

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  }, [storedState]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
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
    if (storedState.preferences.notifications && "Notification" in window && Notification.permission === "granted") {
      new Notification(mode === "focus" ? "Focus session complete" : "Break complete", {
        body: mode === "focus" && storedState.preferences.autoStartBreaks
          ? "Your break timer has started."
          : mode === "focus"
            ? "Your focus timer has ended."
            : "Your break timer has ended.",
        icon: "/pwa-192x192.png",
      });
    }

    if (mode === "focus") {
      setStoredState((current) => ({
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

    setStoredState((current) => ({
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
    setStoredState((current) => ({
      ...current,
      tasks: [...current.tasks, task],
      selectedTaskId: current.selectedTaskId ?? task.id,
    }));
    setTaskTitle("");
  }

  function toggleTask(taskId: string) {
    setStoredState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  function deleteTask(taskId: string) {
    setStoredState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
      selectedTaskId: current.selectedTaskId === taskId ? null : current.selectedTaskId,
    }));
  }

  function selectTask(taskId: string) {
    setStoredState((current) => ({ ...current, selectedTaskId: taskId }));
    setMobileView("timer");
  }

  async function toggleNotifications() {
    if (storedState.preferences.notifications) {
      setStoredState((current) => ({
        ...current,
        preferences: { ...current.preferences, notifications: false },
      }));
      return;
    }

    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setStoredState((current) => ({
      ...current,
      preferences: { ...current.preferences, notifications: permission === "granted" },
    }));
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
          <span className="offline-status" title={isOnline ? "Your progress is saved on this device" : "The app is available offline"}>
            {isOnline ? <Cloud aria-hidden="true" size={15} /> : <CloudOff aria-hidden="true" size={15} />}
            {isOnline ? "Saved locally" : "Working offline"}
          </span>
          <SettingsControl
            durationLocked={status === "running"}
            onAdjustDuration={adjustDuration}
            onToggleAutoStartBreaks={() => setStoredState((current) => ({
              ...current,
              preferences: { ...current.preferences, autoStartBreaks: !current.preferences.autoStartBreaks },
            }))}
            onToggleNotifications={toggleNotifications}
            onToggleSound={() => setStoredState((current) => ({
              ...current,
              preferences: { ...current.preferences, sound: !current.preferences.sound },
            }))}
            preferences={storedState.preferences}
          />
        </div>
      </header>

      <section className="page-intro">
        <div>
          <h1>{getGreeting()}</h1>
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
  durationLocked: boolean;
  onAdjustDuration: (mode: TimerMode, delta: number) => void;
  onToggleAutoStartBreaks: () => void;
  onToggleNotifications: () => void;
  onToggleSound: () => void;
  preferences: Preferences;
};

function SettingsControl(props: SettingsControlProps) {
  return (
    <>
      <div className="settings-desktop">
        <Dialog>
          <DialogTrigger asChild>
            <Button aria-label="Open settings" size="icon" variant="icon">
              <Settings2 aria-hidden="true" size={18} />
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
            <Button aria-label="Open settings" size="icon" variant="icon">
              <Settings2 aria-hidden="true" size={18} />
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

function SettingsBody({ durationLocked, onAdjustDuration, onToggleAutoStartBreaks, onToggleNotifications, onToggleSound, preferences }: SettingsControlProps) {
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
            <span><strong>Desktop alerts</strong><small>Helpful when this tab is hidden</small></span>
            <span className="switch" data-checked={preferences.notifications}><i /></span>
          </button>
        </div>
        <div className="settings-note">
          <Cloud aria-hidden="true" size={17} />
          <p>Tasks are stored on this device and available offline.</p>
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
