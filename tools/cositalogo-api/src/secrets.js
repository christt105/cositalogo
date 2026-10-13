const enc = new TextEncoder();

export function toBase64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** A random base64url string carrying `bytes` bytes of entropy. */
export function randomToken(bytes) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text) {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))));
}

/** Compares two secrets in time that does not depend on where they differ; false when either is missing. */
export async function sameSecret(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || expected === "") return false;
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
