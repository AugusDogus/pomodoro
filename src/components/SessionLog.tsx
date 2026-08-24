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
        <span aria-label={`${todayCount} today`} className="log-count">
          <strong>{todayCount}</strong>
          <span aria-hidden="true">·</span>
          <span>today</span>
        </span>
      </div>

      <div className="log-list">
        {groups.length === 0 ? (
          <div className="log-empty">
            <LogEmptyMark />
            <p>No sessions yet</p>
            <small>Finish a focus session and it will land here.</small>
          </div>
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

function LogEmptyMark() {
  return (
    <svg aria-hidden="true" className="log-empty-mark" fill="none" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill="#f4efe4" />
      <path
        d="M25.5 47c0-9.6 6.6-17.2 14.5-17.2S54.5 37.4 54.5 47 47.9 62 40 62s-14.5-5.4-14.5-15Z"
        fill="#e76f51"
      />
      <path
        d="M29.5 43.5c2.2-5.4 6-8.4 10-8.4"
        stroke="#f6c8bb"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path d="M40 29.5c-4.4-6.2-11-7.4-13.2-5.2 2.4 4.2 7.4 6.2 13.2 6.2Z" fill="#9dac91" />
      <path d="M40 29.5c4.4-6.2 11-7.4 13.2-5.2-2.4 4.2-7.4 6.2-13.2 6.2Z" fill="#7f9176" />
      <path d="M40 27v7" stroke="#5f6f58" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}
