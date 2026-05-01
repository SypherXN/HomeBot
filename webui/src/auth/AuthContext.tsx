import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_TOKEN = "homebot_webui_api_token";
const STORAGE_ACTOR = "homebot_webui_actor_user_id";

export type AuthState = {
  token: string;
  setToken: (v: string) => void;
  actorUserId: string;
  setActorUserId: (v: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN) ?? "");
  const [actorUserId, setActorUserId] = useState(
    () => localStorage.getItem(STORAGE_ACTOR) ?? ""
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_TOKEN, token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ACTOR, actorUserId);
  }, [actorUserId]);

  const value = useMemo(
    () => ({ token, setToken, actorUserId, setActorUserId }),
    [token, actorUserId]
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
