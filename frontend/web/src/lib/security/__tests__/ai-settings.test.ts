import { describe, expect, it, vi } from "vitest";
import { encryptApiKey, decryptApiKey } from "../ai-settings-crypto";
import { resolveEffectiveClaudeEnv } from "../ai-settings";

describe("organization AI settings", () => {
  const env = { AI_SETTINGS_ENCRYPTION_KEY: "test-only-encryption-material", ANTHROPIC_API_KEY: "platform-test", ANTHROPIC_MODEL: "platform-model", DB: "binding" };
  it("encrypts keys with a unique nonce and detects tampering", async () => {
    const a = await encryptApiKey(env, "test-provider-key");
    const b = await encryptApiKey(env, "test-provider-key");
    expect(a).not.toBe(b);
    expect(await decryptApiKey(env, a)).toBe("test-provider-key");
    await expect(decryptApiKey({ AI_SETTINGS_ENCRYPTION_KEY: "wrong" }, a)).rejects.toThrow();
  });
  it("uses the requesting organization's override and preserves bindings", async () => {
    const encrypted_key = await encryptApiKey(env, "org-test");
    const bind = vi.fn(() => ({ first: async () => ({ provider: "anthropic", model: "org-model", encrypted_key }) }));
    const resolved = await resolveEffectiveClaudeEnv(env, { prepare: () => ({ bind }) } as never, "org-one");
    expect(bind).toHaveBeenCalledWith("org-one");
    expect(resolved.ANTHROPIC_API_KEY).toBe("org-test");
    expect(resolved.ANTHROPIC_MODEL).toBe("org-model");
    expect(resolved.DB).toBe("binding");
    expect(env.ANTHROPIC_API_KEY).toBe("platform-test");
  });
});
