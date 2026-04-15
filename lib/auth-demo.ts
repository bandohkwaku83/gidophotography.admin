const AUTH_KEY = "gidostorage_auth_v1";

export type DemoAuthUser = {
  email: string;
};

function storageForRemember(remember: boolean) {
  return remember ? window.localStorage : window.sessionStorage;
}

export function getAuth(): DemoAuthUser | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.sessionStorage.getItem(AUTH_KEY) ?? window.localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoAuthUser;
  } catch {
    return null;
  }
}

export function setAuth(email: string, remember: boolean) {
  window.sessionStorage.removeItem(AUTH_KEY);
  window.localStorage.removeItem(AUTH_KEY);
  const payload = JSON.stringify({ email } satisfies DemoAuthUser);
  storageForRemember(remember).setItem(AUTH_KEY, payload);
}

export function clearAuth() {
  window.sessionStorage.removeItem(AUTH_KEY);
  window.localStorage.removeItem(AUTH_KEY);
}
