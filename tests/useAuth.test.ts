import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenData } from "@/lib/types";

const TOKEN_KEY = "yourtask-tokens";

function token(over: Partial<TokenData> = {}): TokenData {
  return {
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 1, login: "u" },
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Module-level side effects (token load, proactive refresh) run at import
// time, so every test resets the registry and re-imports after seeding
// localStorage + fetch mocks.
async function load() {
  vi.resetModules();
  return (await import("@/composables/useAuth")).useAuth();
}

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockReset();
  });

  it("is unauthenticated without stored tokens", async () => {
    const auth = await load();
    expect(auth.isAuthenticated.value).toBe(false);
    expect(auth.user.value).toBeNull();
    expect(await auth.getValidAccessToken()).toBeNull();
  });

  it("reads tokens from storage", async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token()));
    const auth = await load();
    expect(auth.isAuthenticated.value).toBe(true);
    expect(auth.user.value?.login).toBe("u");
    expect(await auth.getValidAccessToken()).toBe("at");
  });

  it("proactively refreshes an expired token on module load", async () => {
    const expired = token({ expiresAt: Math.floor(Date.now() / 1000) - 10 });
    localStorage.setItem(TOKEN_KEY, JSON.stringify(expired));
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: "new-at",
        refresh_token: "new-rt",
        expires_in: 3600,
      }),
    );
    const auth = await load();
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/extension/refresh");
    expect(JSON.parse(init.body).refresh_token).toBe("rt");

    // Wait for the floating proactive-refresh promise to settle.
    await vi.waitFor(() => {
      expect(auth.isAuthenticated.value).toBe(true);
    });
    expect(await auth.getValidAccessToken()).toBe("new-at");
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY)!);
    expect(stored.accessToken).toBe("new-at");
    expect(stored.refreshToken).toBe("new-rt");
  });

  it("refreshes when the access token is close to expiry", async () => {
    const expiring = token({ expiresAt: Math.floor(Date.now() / 1000) + 30 });
    localStorage.setItem(TOKEN_KEY, JSON.stringify(expiring));
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: "new-at",
        refresh_token: "new-rt",
        expires_in: 3600,
      }),
    );
    const auth = await load();
    expect(await auth.getValidAccessToken()).toBe("new-at");
    expect(JSON.parse(localStorage.getItem(TOKEN_KEY)!).accessToken).toBe(
      "new-at",
    );
  });

  it("returns null and logs out when refresh fails", async () => {
    const expired = token({ expiresAt: Math.floor(Date.now() / 1000) - 10 });
    localStorage.setItem(TOKEN_KEY, JSON.stringify(expired));
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    const auth = await load();
    await vi.waitFor(() => {
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });
    expect(await auth.getValidAccessToken()).toBeNull();
    expect(auth.isAuthenticated.value).toBe(false);
  });

  it("logout clears tokens from memory and storage", async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token()));
    const auth = await load();
    auth.logout();
    expect(auth.isAuthenticated.value).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("login flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockReset();
  });

  function stubChrome(
    callbackUrl: string | null,
    redirect = "https://ext.chromiumapp.org/callback",
  ) {
    const launchWebAuthFlow = vi.fn().mockResolvedValue(callbackUrl);
    vi.stubGlobal("chrome", {
      identity: {
        launchWebAuthFlow,
        getRedirectURL: () => redirect,
      },
    });
    return launchWebAuthFlow;
  }

  it("runs the PKCE flow end-to-end and stores tokens", async () => {
    const launch = stubChrome(null);
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 3600,
        user: { id: 7, login: "me" },
      }),
    );
    const auth = await load();
    launch.mockImplementation((opts: { url: string }) => {
      const u = new URL(opts.url);
      const state = u.searchParams.get("state")!;
      return Promise.resolve(
        `${u.searchParams.get("redirect_uri")}?code=abc&state=${state}`,
      );
    });
    await auth.login();

    const authUrl = new URL(launch.mock.calls[0][0].url);
    expect(authUrl.pathname).toBe("/api/v1/extension/authorize");
    expect(authUrl.searchParams.get("client_id")).toBe("yourtask-extension");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toContain("/api/v1/extension/token");
    const body = JSON.parse(tokenInit.body);
    expect(body.code).toBe("abc");
    expect(body.code_verifier).toBeTruthy();
    expect(body.code_verifier).toBe(sessionStorage.getItem("pkce_verifier"));

    expect(auth.isAuthenticated.value).toBe(true);
    expect(auth.user.value?.id).toBe(7);
    expect(JSON.parse(localStorage.getItem(TOKEN_KEY)!).accessToken).toBe(
      "at-1",
    );
  });

  it("reports an error on state mismatch", async () => {
    const launch = stubChrome(null);
    const auth = await load();
    launch.mockResolvedValue(
      "https://ext.chromiumapp.org/callback?code=abc&state=wrong",
    );
    await auth.login();
    expect(auth.error.value).toBe("State mismatch");
    expect(auth.isAuthenticated.value).toBe(false);
  });

  it("reports an error when no code is returned", async () => {
    const launch = stubChrome(null);
    const auth = await load();
    launch.mockResolvedValue(
      "https://ext.chromiumapp.org/callback?error=denied",
    );
    await auth.login();
    expect(auth.error.value).toBe("No authorization code returned");
  });

  it("reports cancellation when the flow returns no url", async () => {
    stubChrome(null);
    const auth = await load();
    await auth.login();
    expect(auth.error.value).toBe("Authentication cancelled");
  });

  it("surfaces the backend error on token exchange failure", async () => {
    const launch = stubChrome(null);
    const auth = await load();
    launch.mockImplementation((opts: { url: string }) => {
      const u = new URL(opts.url);
      return Promise.resolve(
        `https://ext.chromiumapp.org/callback?code=abc&state=${u.searchParams.get("state")}`,
      );
    });
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "auth.invalid_code" }, 400),
    );
    await auth.login();
    expect(auth.error.value).toBe("auth.invalid_code");
  });
});
