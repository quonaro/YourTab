import { readSettings } from "./settings";

const DEFAULT_API_DOMAIN = "https://yourtask.app";

function isLocalHost(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d === "localhost" ||
    d.startsWith("localhost:") ||
    d === "127.0.0.1" ||
    d.startsWith("127.0.0.1:")
  );
}

export function getApiDomain(): string {
  const settings = readSettings();
  const domain = settings.apiDomain?.trim() || DEFAULT_API_DOMAIN;
  if (!/^https?:\/\//i.test(domain)) {
    const protocol = isLocalHost(domain) ? "http://" : "https://";
    return `${protocol}${domain}`;
  }
  return domain;
}

export function getApiBase(): string {
  return getApiDomain() + "/api/v1";
}

export function getOAuthClientId(): string {
  return "yourtask-extension";
}

export function getRedirectURI(): string {
  return chrome.identity.getRedirectURL("callback");
}

const DEFAULT_HOST_PERMISSIONS = ["https://yourtask.app/*"];

export async function ensureHostPermission(domain: string): Promise<boolean> {
  const d = domain.toLowerCase().trim();
  if (!d) return true;

  const isLocal =
    d === "localhost" ||
    d.startsWith("localhost:") ||
    d === "127.0.0.1" ||
    d.startsWith("127.0.0.1:");

  const protocol = isLocal ? "http" : "https";
  const host = d.replace(/^https?:\/\//, "");
  const pattern = `${protocol}://${host}/*`;

  if (DEFAULT_HOST_PERMISSIONS.includes(pattern)) return true;

  try {
    const granted = await chrome.permissions.request({
      origins: [pattern],
    });
    return granted;
  } catch {
    return false;
  }
}
