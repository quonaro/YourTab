import { readSettings } from "./settings";

const DEFAULT_API_DOMAIN = "https://yourtask.app";

export function getApiDomain(): string {
  const settings = readSettings();
  const domain = settings.apiDomain?.trim() || DEFAULT_API_DOMAIN;
  if (!/^https?:\/\//i.test(domain)) {
    return `https://${domain}`;
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
