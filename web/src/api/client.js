/**
 * An error answer from the API. `status` lets a view tell apart 401 (sign in),
 * 403 (password or role missing), 404 and 503 (settings missing).
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Calls the API on this same origin. A `body` is sent as JSON with its
 * content type, which every write needs (the API answers 415 without it).
 * Resolves to the parsed answer, or null when there is none; any status
 * outside 2xx rejects with an ApiError carrying the API's own message.
 */
export async function request(path, { method = "GET", body, cache, fetchImpl = fetch } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  if (cache) init.cache = cache;
  const res = await fetchImpl(path, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `${path}: HTTP ${res.status}`);
  return data;
}
