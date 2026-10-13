export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** Parses a JSON request body, rejecting anything not sent as application/json so a cross-site form cannot post without a CORS preflight. */
export async function readJson(request) {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError(415, "expected an application/json body");
  }
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "body must be a JSON object");
  }
}
