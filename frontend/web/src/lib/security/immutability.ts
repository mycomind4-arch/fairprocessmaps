/**
 * Audit Log Immutability — Phase 1E+
 *
 * Audit logs must be append-only. This module enforces that at the
 * application layer by providing INSERT-only access patterns.
 *
 * No function in this module or the security layer should ever
 * issue UPDATE or DELETE against audit_logs. D1 (SQLite) doesn't
 * support row-level security, so this is enforced by convention + code.
 *
 * If a write fails or needs correction, the correction is itself
 * an audit event:
 *   audit_logs: { action: "audit.correction", details: "..." }
 *
 * Never:
 *   UPDATE audit_logs SET ...
 *   DELETE FROM audit_logs WHERE ...
 */

/**
 * Asserts that a SQL statement is an INSERT (not UPDATE/DELETE) for audit_logs.
 * This is a development-time guard — call it in tests.
 */
export function assertAppendOnly(query: string): boolean {
  const normalized = query.trim().toUpperCase();
  if (normalized.startsWith("UPDATE") && normalized.includes("AUDIT_LOGS")) {
    throw new Error("IMMUTABILITY VIOLATION: UPDATE on audit_logs is forbidden");
  }
  if (normalized.startsWith("DELETE") && normalized.includes("AUDIT_LOGS")) {
    throw new Error("IMMUTABILITY VIOLATION: DELETE on audit_logs is forbidden");
  }
  return true;
}

/**
 * The only allowed operations on audit_logs:
 * - INSERT (via emitAuditEvent)
 * - SELECT (for audit review)
 *
 * Any code path that attempts to mutate audit_logs should be caught
 * in code review and rejected.
 */
