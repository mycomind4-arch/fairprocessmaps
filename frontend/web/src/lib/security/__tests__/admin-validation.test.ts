import { describe, it, expect } from "vitest";
import {
  VALID_ROLES, isValidRole,
  VALID_MEMBER_STATUSES, isValidMemberStatus,
  VALID_PROJECT_STATUSES, isValidProjectStatus,
  generateTemporaryPassword,
} from "../admin-validation";

describe("isValidRole", () => {
  it("accepts every role in the security Role union", () => {
    for (const role of VALID_ROLES) {
      expect(isValidRole(role)).toBe(true);
    }
  });

  it("rejects roles from the unrelated project-roster system and other garbage", () => {
    expect(isValidRole("editor")).toBe(false); // project_members.role, not organization_members.role
    expect(isValidRole("owner")).toBe(false);
    expect(isValidRole("")).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });
});

describe("isValidMemberStatus", () => {
  it("accepts active, suspended, removed", () => {
    for (const status of VALID_MEMBER_STATUSES) {
      expect(isValidMemberStatus(status)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isValidMemberStatus("banned")).toBe(false);
    expect(isValidMemberStatus(undefined)).toBe(false);
  });
});

describe("isValidProjectStatus", () => {
  it("accepts the known project lifecycle values, including archived", () => {
    for (const status of VALID_PROJECT_STATUSES) {
      expect(isValidProjectStatus(status)).toBe(true);
    }
    expect(VALID_PROJECT_STATUSES).toContain("archived");
  });

  it("rejects unknown statuses", () => {
    expect(isValidProjectStatus("deleted")).toBe(false);
    expect(isValidProjectStatus(undefined)).toBe(false);
  });
});

describe("generateTemporaryPassword", () => {
  it("generates a password well above any minimum length this app enforces", () => {
    const pw = generateTemporaryPassword();
    expect(pw.length).toBeGreaterThanOrEqual(16);
  });

  it("never includes characters that would break copy/paste or URL-safety (+ / =)", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).not.toMatch(/[+/=]/);
    }
  });

  it("generates a different password each call", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(20);
  });
});
