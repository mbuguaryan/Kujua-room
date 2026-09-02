"use client";
import type { SessionNotes } from "@/types/room";

export function SessionNotesPanel({
  title,
  agenda,
  goals,
  notes,
}: {
  title: string;
  agenda: string | null;
  goals: string | null;
  notes: SessionNotes;
}) {
  const hasNotes = Boolean(notes.body.trim() || notes.points.length);
  return (
    <section className="panel-card">
      <div className="panel-heading"><strong>Session plan</strong></div>
      <h2>{title}</h2>
      {agenda ? (
        <div className="session-plan-section">
          <h3>Agenda</h3>
          <p className="session-plan-copy">{agenda}</p>
        </div>
      ) : null}
      {goals ? (
        <div className="session-plan-section">
          <h3>Goals</h3>
          <p className="session-plan-copy">{goals}</p>
        </div>
      ) : null}
      {hasNotes ? (
        <div className="session-plan-section">
          <h3>{notes.title}</h3>
          {notes.body ? <p className="session-plan-copy">{notes.body}</p> : null}
          {notes.points.length ? <ul>{notes.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
        </div>
      ) : null}
      {!agenda && !goals && !hasNotes ? <p>No agenda or goals were added for this session.</p> : null}
    </section>
  );
}
