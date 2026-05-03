import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthLoginResponse } from "../api";
import {
  AUTH_ACCESS_REFRESHED_EVENT,
  AUTH_STORAGE_ACTOR,
  AUTH_STORAGE_REFRESH,
  AUTH_STORAGE_TOKEN,
  AUTH_STORAGE_WEB_USERNAME,
  type AuthAccessRefreshedDetail,
} from "./storageKeys";

export type { AuthLoginResponse } from "../api";

export type AuthState = {
  token: string;
  setToken: (v: string) => void;
  actorUserId: string;
  setActorUserId: (v: string) => void;
  webUsername: string;
  setWebUsername: (v: string) => void;
  applyWebLogin: (r: AuthLoginResponse) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_TOKEN) ?? "");
  const [actorUserId, setActorUserId] = useState(
    () => localStorage.getItem(AUTH_STORAGE_ACTOR) ?? ""
  );
  const [webUsername, setWebUsername] = useState(
    () => localStorage.getItem(AUTH_STORAGE_WEB_USERNAME) ?? ""
  );

  useEffect(() => {
    localStorage.setItem(AUTH_STORAGE_TOKEN, token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(AUTH_STORAGE_ACTOR, actorUserId);
  }, [actorUserId]);

  useEffect(() => {
    localStorage.setItem(AUTH_STORAGE_WEB_USERNAME, webUsername);
  }, [webUsername]);

  useEffect(() => {
    const onRefreshed = (ev: Event) => {
      const e = ev as CustomEvent<AuthAccessRefreshedDetail>;
      const d = e.detail;
      if (d?.accessToken) {
        setToken(d.accessToken);
      }
    };
    window.addEventListener(AUTH_ACCESS_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(AUTH_ACCESS_REFRESHED_EVENT, onRefreshed);
  }, []);

  const applyWebLogin = useMemo(
    () => (r: AuthLoginResponse) => {
      setToken(r.accessToken);
      setActorUserId(r.discordUserId);
      setWebUsername(r.username);
      if (r.refreshToken) {
        localStorage.setItem(AUTH_STORAGE_REFRESH, r.refreshToken);
      } else {
        localStorage.removeItem(AUTH_STORAGE_REFRESH);
      }
    },
    []
  );

  const clearSession = useMemo(
    () => () => {
      setToken("");
      setActorUserId("");
      setWebUsername("");
      localStorage.removeItem(AUTH_STORAGE_REFRESH);
    },
    []
  );

  const value = useMemo(
    () => ({
      token,
      setToken,
      actorUserId,
      setActorUserId,
      webUsername,
      setWebUsername,
      applyWebLogin,
      clearSession,
    }),
    [token, actorUserId, webUsername, applyWebLogin, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
