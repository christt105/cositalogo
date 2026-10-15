export const NEW_ORIGIN = "https://cositalogo.christt105.workers.dev";

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Cositálogo</title>
<script>location.replace(${JSON.stringify(NEW_ORIGIN)} + location.pathname + location.search + location.hash);</script>
</head>
<body>
<p>El Cositálogo está ahora en <a href="${NEW_ORIGIN}/">${NEW_ORIGIN.slice(8)}</a>.</p>
</body>
</html>
`;

/**
 * The Worker that keeps the Cositálogo's first name, `cositalogo-api`, alive
 * after the move to `cositalogo`. API calls get a 308 to the same path on the
 * new origin; any other address gets a page that moves the browser there
 * keeping the `#/...` route, which never reaches the server.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 308);
    }
    return new Response(PAGE, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  },
};
