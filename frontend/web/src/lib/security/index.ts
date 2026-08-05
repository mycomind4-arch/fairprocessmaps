/**
 * Security module barrel export — Phase 1D Trust Boundary Layer.
 *
 * Import from here in API routes:
 *   import { requireAuth, requireAuthz } from "@/lib/security";
 */

export type {
  Role,
  ActorType,
  Actor,
  AuthUser,
  Action,
  AuthzResult,
  AuthResult,
  AuthSuccess,
  AuthFailure,
  Resource,
} from "./types";

export {
  authorize,
  authorizeAgent,
  can,
} from "./authorization";

export {
  authenticateRequest,
  login,
  logout,
  createSession,
  validateSession,
  destroySession,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookieName,
} from "./auth";

export {
  requireAuth,
  requireAuthz,
  resolveProjectOrg,
  resolveEvidenceOrg,
  verifyOrgAccess,
  orgScope,
} from "./middleware";

export {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  validateUpload,
  sanitizeFilename,
  safeR2Key,
  computeSHA256,
  isWithdrawn,
  EVIDENCE_WITHDRAWN,
} from "./evidence";

export {
  humanActor,
  agentActor,
  systemActor,
  governmentSourceActor,
  emitTimelineEvent,
  emitAuditEvent,
} from "./events";
