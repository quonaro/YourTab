import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getApiDomain,
  getApiBase,
  getOAuthClientId,
  getRedirectURI,
  ensureHostPermission,
} from "@/lib/config";
import { SETTINGS_KEY } from "@/lib/settings";

function setApiDomain(domain: string) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiDomain: domain }));
}

describe("getApiDomain", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default domain when not configured", () => {
    expect(getApiDomain()).toBe("https://yourtask.app");
  });

  it("returns the default when apiDomain is blank", () => {
    setApiDomain("   ");
    expect(getApiDomain()).toBe("https://yourtask.app");
  });

  it("adds https:// to bare domains", () => {
    setApiDomain("tasks.example.com");
    expect(getApiDomain()).toBe("https://tasks.example.com");
  });

  it("keeps an explicit protocol", () => {
    setApiDomain("https://tasks.example.com");
    expect(getApiDomain()).toBe("https://tasks.example.com");
  });

  it("uses http:// for localhost", () => {
    setApiDomain("localhost");
    expect(getApiDomain()).toBe("http://localhost");
    setApiDomain("localhost:25001");
    expect(getApiDomain()).toBe("http://localhost:25001");
    setApiDomain("127.0.0.1:8080");
    expect(getApiDomain()).toBe("http://127.0.0.1:8080");
  });

  it("keeps explicit http:// on localhost", () => {
    setApiDomain("http://localhost:25001");
    expect(getApiDomain()).toBe("http://localhost:25001");
  });
});

describe("getApiBase / getOAuthClientId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("appends /api/v1 to the domain", () => {
    expect(getApiBase()).toBe("https://yourtask.app/api/v1");
  });

  it("returns the fixed OAuth client id", () => {
    expect(getOAuthClientId()).toBe("yourtask-extension");
  });
});

describe("getRedirectURI", () => {
  it("delegates to chrome.identity", () => {
    const getRedirectURL = vi
      .fn()
      .mockReturnValue("https://ext.chromiumapp.org/callback");
    vi.stubGlobal("chrome", { identity: { getRedirectURL } });
    expect(getRedirectURI()).toBe("https://ext.chromiumapp.org/callback");
    expect(getRedirectURL).toHaveBeenCalledWith("callback");
    vi.unstubAllGlobals();
  });
});

describe("ensureHostPermission", () => {
  const request = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("chrome", { permissions: { request } });
    request.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true for empty domain without requesting", async () => {
    expect(await ensureHostPermission("")).toBe(true);
    expect(await ensureHostPermission("   ")).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("returns true for the default host without requesting", async () => {
    expect(await ensureHostPermission("yourtask.app")).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("requests https origin for a custom domain", async () => {
    request.mockResolvedValue(true);
    expect(await ensureHostPermission("tasks.example.com")).toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: ["https://tasks.example.com/*"],
    });
  });

  it("requests http origin for localhost", async () => {
    request.mockResolvedValue(true);
    await ensureHostPermission("localhost:25001");
    expect(request).toHaveBeenCalledWith({
      origins: ["http://localhost:25001/*"],
    });
  });

  it("strips an existing protocol before building the pattern", async () => {
    request.mockResolvedValue(true);
    await ensureHostPermission("https://tasks.example.com");
    expect(request).toHaveBeenCalledWith({
      origins: ["https://tasks.example.com/*"],
    });
  });

  it("returns false when the user rejects", async () => {
    request.mockResolvedValue(false);
    expect(await ensureHostPermission("tasks.example.com")).toBe(false);
  });

  it("returns false when request throws", async () => {
    request.mockRejectedValue(new Error("denied"));
    expect(await ensureHostPermission("tasks.example.com")).toBe(false);
  });
});
