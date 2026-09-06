/**
 * Encryption for org-supplied AI provider API keys.
 *
 * A user's own Anthropic key is a real credential — leaking it costs them
 * money and potentially their account. It is never handled the way the rest
 * of this app's passwords are handled (which uses one-way PBKDF2 hashing,
 * appropriate because a password only ever needs to be verified, not
 * recovered). A provider key must be recoverable — the server needs the
 * plaintext to call Anthropic on the org's behalf — so this uses reversible
 * AES-256-GCM instead, with the encryption key held in a Worker secret that
 * never reaches the database, a client, or a log line.
 *
 * What this buys: someone with read access to the D1 database (a backup, a
 * misconfigured export, another bug) sees ciphertext, not a usable key. It
 * does not protect against a compromised Worker runtime itself — nothing
 * short of an external KMS fully does, which is out of scope for what this
 * product needs today.
 */

export interface AiSettingsCryptoEnv {
  AI_SETTINGS_ENCRYPTION_KEY?: string;
}

function requireKeyMaterial(env: AiSettingsCryptoEnv): string {
  const key = (env.AI_SETTINGS_ENCRYPTION_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "AI_SETTINGS_ENCRYPTION_KEY is not configured. Generate one with " +
        "`openssl rand -base64 32` and set it with `wrangler secret put " +
        "AI_SETTINGS_ENCRYPTION_KEY` before storing any organization API key.",
    );
  }
  return key;
}

async function deriveKey(env: AiSettingsCryptoEnv): Promise<CryptoKey> {
  const material = requireKeyMaterial(env);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypt a plaintext API key. Returns base64 (IV || ciphertext). */
export async function encryptApiKey(env: AiSettingsCryptoEnv, plaintext: string): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

/** Decrypt a value produced by encryptApiKey. */
export async function decryptApiKey(env: AiSettingsCryptoEnv, encoded: string): Promise<string> {
  const key = await deriveKey(env);
  const combined = fromBase64(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Last 4 characters, for display only — never enough to reconstruct the key. */
export function last4(plaintext: string): string {
  return plaintext.slice(-4);
}

/**
 * Loose shape validation before we ever encrypt or call the provider with it.
 * Not a guarantee the key is valid — only Anthropic can tell us that — but it
 * catches the obvious paste errors (empty string, a JWT, a UUID) before they
 * become a confusing 401 three steps later.
 */
export function looksLikeAnthropicKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}
