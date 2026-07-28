import type { StepId, StepJournalEntry } from "./types";

export interface JournalSummary {
  completed: StepId[];
  pending: StepId[];
  failedAt?: StepId;
  success: boolean;
}

// Pure reducer over a step journal: what finished, what never got to run,
// and where (if anywhere) execution stopped. A partial run is never
// destructive — it simply stops, and the next invocation re-resolves live
// state and re-plans, so "pending" steps are picked up on rerun rather than
// replayed from this journal.
export function summarizeJournal(entries: StepJournalEntry[]): JournalSummary {
  const completed = entries.filter((e) => e.status === "completed").map((e) => e.id);
  const failed = entries.find((e) => e.status === "failed");
  const pending = entries.filter((e) => e.status === "pending").map((e) => e.id);

  return {
    completed,
    pending,
    failedAt: failed?.id,
    success: !failed,
  };
}
