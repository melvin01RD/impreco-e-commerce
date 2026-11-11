import { isPrivateNetworkHost } from "../app-url";

/** Extra public origins must be explicit HTTPS origins, never patterns or URLs
 * containing credentials, paths, queries or fragments. Do not echo bad input. */
export function authorizedPreviewOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(",").map((entry) => {
    try {
      const raw = entry.trim();
      const url = new URL(raw);
      if (
        url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash ||
        raw.includes("*") || raw.includes("\\") ||
        isPrivateNetworkHost(url.hostname)
      ) throw new Error();
      return url.origin;
    } catch {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must contain comma-separated, exact public HTTPS origins.");
    }
  }))];
}

export function createTrustedOrigins(
  configured: string[],
  allowPrivateNetwork: boolean,
) {
  const origins = [...new Set(configured.map((value) => value.trim()).filter(Boolean))];
  return (request?: Request): string[] => {
    const origin = request?.headers.get("origin")?.trim();
    if (!allowPrivateNetwork || !origin || origins.includes(origin)) return origins;
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) return origins;
      const host = request?.headers.get("host")?.trim().toLowerCase();
      return isPrivateNetworkHost(url.hostname) && host === url.host.toLowerCase()
        ? [...origins, origin]
        : origins;
    } catch {
      return origins;
    }
  };
}
