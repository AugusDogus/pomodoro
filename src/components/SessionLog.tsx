import {
  groupSessionLog,
  pomodoroCountLabel,
  sessionDayLabel,
  sessionTimeLabel,
  type SessionLogEntry,
} from "../lib/session-log";

type SessionLogProps = {
  entries: SessionLogEntry[];
  mobileActive: boolean;
  today: string;
  todayCount: number;
};

export function SessionLog({ entries, mobileActive, today, todayCount }: SessionLogProps) {
  const groups = groupSessionLog(entries);

  return (
    <section
      aria-labelledby="mobile-log-tab"
      className="log-card"
      data-mobile-active={mobileActive}
      id="log-panel"
      role="tabpanel"
    >
      <div className="log-header">
        <div>
          <h2 id="log-heading">Log</h2>
          <p>Finished focus sessions, newest first.</p>
        </div>
        <span className="task-count">{todayCount} today</span>
      </div>

      <div className="log-list">
        {groups.length === 0 ? (
          <p className="log-empty">Finish a focus session and it will land here.</p>
        ) : (
          groups.map((group) => (
            <section className="log-day" key={group.dateKey}>
              <h3>
                {sessionDayLabel(group.dateKey, today)}
                <span>{pomodoroCountLabel(group.entries.length)}</span>
              </h3>
              <ol>
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={new Date(entry.completedAt).toISOString()}>{sessionTimeLabel(entry.completedAt)}</time>
                    <span>{entry.task === null ? "No task" : entry.task.title}</span>
                    <small>{entry.minutes}m</small>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
