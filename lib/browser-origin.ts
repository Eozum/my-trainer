export function appOrigin() {
  const { APP_URL, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  const value = APP_URL || (VERCEL_PROJECT_PRODUCTION_URL && `https://${VERCEL_PROJECT_PRODUCTION_URL}`);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.origin;
  } catch {}
  return null;
}

export function isSameOrigin(req: Request, origin = appOrigin()) {
  return origin !== null && req.headers.get("origin") === origin;
}

export const noStore = { "Cache-Control": "no-store" };
