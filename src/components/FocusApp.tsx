import {
  Bell,
  BellOff,
  Check,
  Cloud,
  CloudOff,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, progressFor, remainingFromEnd, TIMER_SECONDS, type TimerMode } from "../lib/timer";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  pomodoros: number;
};

type TimerStatus = "idle" | "running" | "paused";

type Preferences = {
  sound: boolean;
  notifications: boolean;
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
const CIRCLE_RADIUS = 148;
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;

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
    preferences: { sound: true, notifications: false },
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
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [remaining, setRemaining] = useState(TIMER_SECONDS.focus);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const completedRef = useRef(false);

  const selectedTask = useMemo(
    () => storedState.tasks.find((task) => task.id === storedState.selectedTaskId) ?? null,
    [storedState.selectedTaskId, storedState.tasks],
  );
  const completedTasks = storedState.tasks.filter((task) => task.completed).length;
  const taskProgress = storedState.tasks.length === 0 ? 0 : completedTasks / storedState.tasks.length;
  const totalSeconds = TIMER_SECONDS[mode];
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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
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
        body: mode === "focus" ? "Nice work. Take five minutes to reset." : "Ready for another gentle focus?",
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
      setRemaining(TIMER_SECONDS.break);
    } else {
      setMode("focus");
      setRemaining(TIMER_SECONDS.focus);
    }
  }, [mode, storedState.preferences.notifications, storedState.preferences.sound]);

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
    setStatus("idle");
    setEndTime(null);
    setRemaining(TIMER_SECONDS[mode]);
  }

  function changeMode(nextMode: TimerMode) {
    completedRef.current = false;
    setMode(nextMode);
    setStatus("idle");
    setEndTime(null);
    setRemaining(TIMER_SECONDS[nextMode]);
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark" aria-label="Pomodoro home">pom<span>.</span></div>
        <div className="header-actions">
          <span className="offline-status" title={isOnline ? "Your progress is saved on this device" : "The app is available offline"}>
            {isOnline ? <Cloud aria-hidden="true" size={15} /> : <CloudOff aria-hidden="true" size={15} />}
            {isOnline ? "Saved locally" : "Working offline"}
          </span>
          <SettingsDialog
            installAvailable={installPrompt !== null}
            onInstall={installApp}
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
        <section aria-label="Timer" className="focus-card">
          <div className="mode-switcher" aria-label="Timer mode">
            <button aria-pressed={mode === "focus"} onClick={() => changeMode("focus")}>Focus <span>25m</span></button>
            <button aria-pressed={mode === "break"} onClick={() => changeMode("break")}>Break <span>5m</span></button>
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
              {status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start focus"}
            </Button>
            <Button aria-label="Reset timer" className="timer-reset" onClick={resetTimer} size="icon" variant="secondary">
              <RotateCcw aria-hidden="true" size={18} />
            </Button>
          </div>
        </section>

        <section className="tasks-card" aria-labelledby="tasks-heading">
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
                    onClick={() => setStoredState((current) => ({ ...current, selectedTaskId: task.id }))}
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

    </main>
  );
}

type SettingsDialogProps = {
  installAvailable: boolean;
  onInstall: () => void;
  onToggleNotifications: () => void;
  onToggleSound: () => void;
  preferences: Preferences;
};

function SettingsDialog({ installAvailable, onInstall, onToggleNotifications, onToggleSound, preferences }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label="Open settings" size="icon" variant="icon">
          <Settings2 aria-hidden="true" size={18} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Keep things gentle.</DialogTitle>
        <DialogDescription>Choose how Pomodoro lets you know a session is complete.</DialogDescription>
        <div className="settings-list">
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
          <p><strong>Private by default</strong><br />Tasks stay on this device and work without internet.</p>
        </div>
        {installAvailable && (
          <Button className="install-button" onClick={onInstall} variant="secondary">
            <Download aria-hidden="true" size={17} /> Install as an app
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
