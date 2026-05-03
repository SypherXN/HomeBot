import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthLoginResponse } from "../api";

const STORAGE_TOKEN = "homebot_webui_api_token";
const STORAGE_ACTOR = "homebot_webui_actor_user_id";
const STORAGE_WEB_USERNAME = "homebot_webui_web_username";

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
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN) ?? "");
  const [actorUserId, setActorUserId] = useState(
    () => localStorage.getItem(STORAGE_ACTOR) ?? ""
  );
  const [webUsername, setWebUsername] = useState(
    () => localStorage.getItem(STORAGE_WEB_USERNAME) ?? ""
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_TOKEN, token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ACTOR, actorUserId);
  }, [actorUserId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_WEB_USERNAME, webUsername);
  }, [webUsername]);

  const applyWebLogin = useMemo(
    () => (r: AuthLoginResponse) => {
      setToken(r.accessToken);
      setActorUserId(r.discordUserId);
      setWebUsername(r.username);
    },
    []
  );

  const clearSession = useMemo(
    () => () => {
      setToken("");
      setActorUserId("");
      setWebUsername("");
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
