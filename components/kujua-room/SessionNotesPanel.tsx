"use client";
import type { SessionNotes } from "@/types/room";
export function SessionNotesPanel({ notes }: { notes: SessionNotes }) { return <section className="panel-card"><div className="panel-heading"><strong>Today&apos;s talking points</strong></div><h2>{notes.title}</h2><p>{notes.body}</p><ul>{notes.points.map((point) => <li key={point}>{point}</li>)}</ul></section>; }
