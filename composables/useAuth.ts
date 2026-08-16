import { ref, computed, readonly } from "vue";
import { getApiDomain, getOAuthClientId, getRedirectURI } from "@/lib/config";
import { generatePKCE } from "@/lib/pkce";
import type { TokenData } from "@/lib/types";

const TOKEN_STORAGE_KEY = "yourtask-tokens";

const tokens = ref<TokenData | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

function loadTokensFromStorage(): TokenData | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TokenData;
  } catch {
    return null;
  }
}

function saveTokensToStorage(data: TokenData | null) {
  if (data) {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data));
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

// Load tokens on module init
tokens.value = loadTokensFromStorage();

// Proactively refresh on module load if the access token is expired
// but we still have a refresh token. This prevents the user from seeing
// API errors on first interaction after the access token has expired.
if (tokens.value) {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.value.expiresAt <= now) {
    const apiDomain = getApiDomain();
    fetch(`${apiDomain}/api/v1/extension/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: tokens.value.refreshToken,
        client_id: getOAuthClientId(),
      }),
    }).then(async (resp) => {
      if (!resp.ok) {
        tokens.value = null;
        saveTokensToStorage(null);
        return;
      }
      const data = await resp.json();
      tokens.value = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.value!.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        user: data.user || tokens.value!.user,
      };
      saveTokensToStorage(tokens.value);
    }).catch(() => {
      tokens.value = null;
      saveTokensToStorage(null);
    });
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => tokens.value !== null);

  const user = computed(() => tokens.value?.user ?? null);

  async function login() {
    loading.value = true;
    error.value = null;
    try {
      const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePKCE();
      // Store verifier for later use in token exchange
      sessionStorage.setItem("pkce_verifier", codeVerifier);

      const apiDomain = getApiDomain();
      const clientId = getOAuthClientId();
      const redirectURI = getRedirectURI();
      const state = crypto.randomUUID();

      const authURL = new URL(`${apiDomain}/api/v1/extension/authorize`);
      authURL.searchParams.set("client_id", clientId);
      authURL.searchParams.set("redirect_uri", redirectURI);
      authURL.searchParams.set("code_challenge", codeChallenge);
      authURL.searchParams.set("code_challenge_method", codeChallengeMethod);
      authURL.searchParams.set("state", state);

      const finalURL = authURL.toString();

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: finalURL,
        interactive: true,
      });

      if (!responseUrl) {
        error.value = "Authentication cancelled";
        return;
      }

      const callbackURL = new URL(responseUrl);
      const code = callbackURL.searchParams.get("code");
      const returnedState = callbackURL.searchParams.get("state");

      if (!code) {
        error.value = "No authorization code returned";
        return;
      }
      if (returnedState !== state) {
        error.value = "State mismatch";
        return;
      }

      // Exchange code for tokens
      const tokenResponse = await fetch(`${apiDomain}/api/v1/extension/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          client_id: clientId,
          redirect_uri: redirectURI,
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.json().catch(() => ({}));
        error.value = errBody.detail || "Token exchange failed";
        return;
      }

      const tokenData = await tokenResponse.json();
      const data: TokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        user: tokenData.user,
      };

      tokens.value = data;
      saveTokensToStorage(data);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Authentication failed";
    } finally {
      loading.value = false;
    }
  }

  async function refreshTokens(): Promise<boolean> {
    if (!tokens.value) return false;

    try {
      const apiDomain = getApiDomain();
      const response = await fetch(`${apiDomain}/api/v1/extension/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: tokens.value.refreshToken,
          client_id: getOAuthClientId(),
        }),
      });

      if (!response.ok) {
        // If refresh fails, logout
        logout();
        return false;
      }

      const data = await response.json();
      tokens.value = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.value.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        user: data.user || tokens.value.user,
      };
      saveTokensToStorage(tokens.value);
      return true;
    } catch {
      logout();
      return false;
    }
  }

  function logout() {
    tokens.value = null;
    saveTokensToStorage(null);
  }

  async function getValidAccessToken(): Promise<string | null> {
    if (!tokens.value) return null;

    const now = Math.floor(Date.now() / 1000);
    const buffer = 60; // 60 second buffer

    if (tokens.value.expiresAt - now < buffer) {
      const refreshed = await refreshTokens();
      if (!refreshed) return null;
    }

    return tokens.value?.accessToken ?? null;
  }

  return {
    isAuthenticated,
    loading: readonly(loading),
    error: readonly(error),
    user: readonly(user),
    tokens: readonly(tokens),
    login,
    logout,
    refreshTokens,
    getValidAccessToken,
  };
}
