"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="center-state"><h1>Something went wrong</h1><p>Kujua Room could not load this page.</p><button className="btn primary" onClick={reset}>Try again</button></main>; }
