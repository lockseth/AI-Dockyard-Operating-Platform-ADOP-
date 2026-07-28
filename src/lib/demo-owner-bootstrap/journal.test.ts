import { describe, expect, it } from "vitest";
import { summarizeJournal } from "./journal";
import type { StepJournalEntry } from "./types";

describe("summarizeJournal", () => {
  it("reports full success when every step completed", () => {
    const entries: StepJournalEntry[] = [
      { id: "resolve_or_create_tenant", status: "completed" },
      { id: "resolve_or_create_legal_entity", status: "completed" },
    ];
    const summary = summarizeJournal(entries);
    expect(summary.success).toBe(true);
    expect(summary.failedAt).toBeUndefined();
    expect(summary.pending).toEqual([]);
    expect(summary.completed).toEqual(["resolve_or_create_tenant", "resolve_or_create_legal_entity"]);
  });

  it("reports partial failure: completed steps, the failed step, and pending steps", () => {
    const entries: StepJournalEntry[] = [
      { id: "resolve_or_create_tenant", status: "completed" },
      { id: "resolve_or_create_legal_entity", status: "completed" },
      { id: "resolve_or_create_auth_user", status: "failed", error: "createUser failed" },
      { id: "ensure_active_membership", status: "pending" },
      { id: "ensure_owner_role", status: "pending" },
      { id: "write_bootstrap_audit_evidence", status: "pending" },
    ];
    const summary = summarizeJournal(entries);
    expect(summary.success).toBe(false);
    expect(summary.failedAt).toBe("resolve_or_create_auth_user");
    expect(summary.completed).toEqual(["resolve_or_create_tenant", "resolve_or_create_legal_entity"]);
    expect(summary.pending).toEqual(["ensure_active_membership", "ensure_owner_role", "write_bootstrap_audit_evidence"]);
  });

  it("never includes the sanitized error text as a secret leak vector", () => {
    const entries: StepJournalEntry[] = [
      { id: "resolve_or_create_auth_user", status: "failed", error: "createUser failed: email already exists" },
    ];
    const summary = summarizeJournal(entries);
    expect(JSON.stringify(summary)).not.toMatch(/password|service_role|api[_-]?key/i);
  });
});
