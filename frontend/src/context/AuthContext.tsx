import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";

export type Role =
  | "admin"
  | "analyst"
  | "client"
  | "fiduciary"
  | "payer";

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  company_id: number | null;
};

type AuthState = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (p: {
    legal_name: string;
    trade_name?: string;
    tax_id: string;
    contact_email: string;
    phone?: string;
    contact_full_name?: string;
    admin_email: string;
    admin_name: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshMe = useCallback(async () => {
    const t = localStorage.getItem("finecta_token");
    if (!t) {
      setUser(null);
      return;
    }
    setToken(t);
    const u = await api<User>("/auth/me", { method: "GET" });
    setUser(u);
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("finecta_token");
    if (!t) {
      setReady(true);
      return;
    }
    setToken(t);
    refreshMe()
      .catch(() => {
        localStorage.removeItem("finecta_token");
        setUser(null);
        setToken(null);
      })
      .finally(() => setReady(true));
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{
      access_token: string;
      user: User;
    }>("/auth/login", { method: "POST", json: { email, password } });
    localStorage.setItem("finecta_token", r.access_token);
    setToken(r.access_token);
    setUser(r.user);
  }, []);

  const register = useCallback(
    async (p: {
      legal_name: string;
      trade_name?: string;
      tax_id: string;
      contact_email: string;
      phone?: string;
      contact_full_name?: string;
      admin_email: string;
      admin_name: string;
      password: string;
    }) => {
      const r = await api<{
        access_token: string;
        user: User;
      }>("/auth/register", { method: "POST", json: p });
      localStorage.setItem("finecta_token", r.access_token);
      setToken(r.access_token);
      setUser(r.user);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("finecta_token");
    setToken(null);
    setUser(null);
  }, []);

  const v = useMemo(
    () => ({ user, token, ready, login, register, logout, refreshMe }),
    [user, token, ready, login, register, logout, refreshMe]
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth en AuthProvider");
  return c;
}
