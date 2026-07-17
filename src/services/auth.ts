import { SocialLogin } from "@capgo/capacitor-social-login";

const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? "";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  name: string | null;
  expiresAt: number | null;
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;

  await SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      mode: "online",
    },
  });

  initialized = true;
}

const STORAGE_KEY = "relay_auth_state";

function loadLocalState(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalState(state: AuthState | null) {
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

let cachedState: AuthState | null = loadLocalState();

export function getAuthState(): AuthState | null {
  return cachedState;
}

export function isAuthenticated(): boolean {
  return cachedState?.accessToken !== null && cachedState?.accessToken !== undefined;
}

export async function signIn(): Promise<AuthState> {
  await ensureInitialized();

  const result = await SocialLogin.login({
    provider: "google",
    options: {
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "profile",
        "email",
      ],
    },
  });

  if (result.provider !== "google") {
    throw new Error("Unexpected provider");
  }

  const googleResult = result.result;
  if (googleResult.responseType !== "online") {
    throw new Error("Expected online response");
  }

  const token = googleResult.accessToken?.token ?? null;
  const refreshToken = googleResult.accessToken?.refreshToken ?? null;
  const expiresIn = googleResult.accessToken?.expires
    ? new Date(googleResult.accessToken.expires).getTime()
    : Date.now() + 3600 * 1000;

  const state: AuthState = {
    accessToken: token,
    refreshToken,
    email: googleResult.profile?.email ?? null,
    name: googleResult.profile?.name ?? null,
    expiresAt: expiresIn,
  };

  cachedState = state;
  saveLocalState(state);

  return state;
}

export async function signOut(): Promise<void> {
  try {
    await ensureInitialized();
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // ignore logout errors
  }

  cachedState = null;
  saveLocalState(null);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!cachedState?.refreshToken) return null;

  try {
    await ensureInitialized();
    await SocialLogin.refresh({
      provider: "google",
      options: {
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
          "profile",
          "email",
        ],
      },
    });

    const newState = loadLocalState();
    if (newState?.accessToken) {
      cachedState = newState;
      return newState.accessToken;
    }
  } catch {
    // refresh failed
  }

  return null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!cachedState?.accessToken) return null;

  if (cachedState.expiresAt && Date.now() < cachedState.expiresAt - 60000) {
    return cachedState.accessToken;
  }

  const refreshed = await refreshAccessToken();
  return refreshed ?? cachedState.accessToken;
}
