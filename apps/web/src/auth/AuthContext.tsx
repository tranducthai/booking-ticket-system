import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../api/auth";
import { loadAuth, saveAuth, type StoredAuth } from "../api/client";
import type { Role } from "../api/types";

interface AuthContextValue {
  user: StoredAuth["user"] | null;
  role: Role | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadAuth());

  useEffect(() => {
    const onChange = () => setAuth(loadAuth());
    window.addEventListener("auth-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("auth-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    saveAuth(res);
    setAuth(res);
  };

  const register = async (data: { email: string; password: string; fullName: string; phone?: string }) => {
    const res = await authApi.register(data);
    saveAuth(res);
    setAuth(res);
  };

  const logout = () => {
    saveAuth(null);
    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{ user: auth?.user ?? null, role: auth?.user.role ?? null, isAuthenticated: !!auth, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
