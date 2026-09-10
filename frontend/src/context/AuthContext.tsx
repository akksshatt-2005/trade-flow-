"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

export interface User {
  id: string;
  username: string;
}

export interface Company {
  id: string;
  name: string;
  gst_number?: string | null;
  address?: string | null;
  role: "owner" | "accountant" | "salesperson";
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; companiesCount?: number }>;
  signup: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  selectCompany: (company: Company) => void;
  createCompany: (name: string, gst_number?: string, address?: string) => Promise<{ success: boolean; company?: Company; error?: string }>;
  refreshCompanies: () => Promise<Company[]>;
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "tradeflow_auth_token";
const USER_KEY = "tradeflow_auth_user";
const COMPANY_KEY = "tradeflow_active_company";

const getBackendUrl = (): string => {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
  }
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (isLocalhost) {
    return "http://localhost:4000";
  }
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (window.location.origin.includes("trade-flow")
      ? "https://trade-flow-backend.onrender.com"
      : "http://localhost:4000")
  );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  // Helper API Fetch with automated Auth and Tenant Header Injection
  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
      const baseUrl = getBackendUrl();
      const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

      const headers = new Headers(options.headers || {});
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (activeCompany?.id && !headers.has("x-company-id")) {
        headers.set("x-company-id", activeCompany.id);
      }
      if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [token, activeCompany],
  );

  const fetchUserCompanies = useCallback(
    async (authToken: string): Promise<Company[]> => {
      try {
        const baseUrl = getBackendUrl();
        const res = await fetch(`${baseUrl}/companies/mine`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          return [];
        }

        const data = await res.json();
        const list: Company[] = data.companies || [];
        setCompanies(list);
        return list;
      } catch {
        return [];
      }
    },
    [],
  );

  // Initialize Session from LocalStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedUser = localStorage.getItem(USER_KEY);
        const savedCompany = localStorage.getItem(COMPANY_KEY);

        if (savedToken && savedUser) {
          const parsedUser: User = JSON.parse(savedUser);
          setToken(savedToken);
          setUser(parsedUser);

          const list = await fetchUserCompanies(savedToken);

          if (savedCompany) {
            const parsedCompany: Company = JSON.parse(savedCompany);
            // Verify user still has access to saved company
            const exists = list.find((c) => c.id === parsedCompany.id);
            if (exists) {
              setActiveCompany(exists);
            } else if (list.length > 0) {
              setActiveCompany(list[0]);
              localStorage.setItem(COMPANY_KEY, JSON.stringify(list[0]));
            } else {
              setActiveCompany(null);
            }
          } else if (list.length === 1) {
            setActiveCompany(list[0]);
            localStorage.setItem(COMPANY_KEY, JSON.stringify(list[0]));
          }
        }
      } catch (err) {
        console.error("Failed to restore auth state", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [fetchUserCompanies]);

  const selectCompany = (company: Company) => {
    setActiveCompany(company);
    localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
  };

  const refreshCompanies = async (): Promise<Company[]> => {
    if (!token) return [];
    return fetchUserCompanies(token);
  };

  const login = async (
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; companiesCount?: number }> => {
    try {
      const baseUrl = getBackendUrl();
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.message || "Invalid username or password.",
        };
      }

      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      // Fetch user companies
      const list = await fetchUserCompanies(data.access_token);

      if (list.length === 1) {
        selectCompany(list[0]);
      } else {
        setActiveCompany(null);
        localStorage.removeItem(COMPANY_KEY);
      }

      return { success: true, companiesCount: list.length };
    } catch {
      return {
        success: false,
        error: "Unable to connect to authentication server. Please check your backend connection.",
      };
    }
  };

  const signup = async (
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getBackendUrl();
      const res = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Registration failed.";
        return { success: false, error: errorMsg };
      }

      if (data.access_token) {
        setToken(data.access_token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setCompanies([]);
        setActiveCompany(null);
      }

      return { success: true };
    } catch {
      return {
        success: false,
        error: "Unable to connect to registration server. Please check your backend connection.",
      };
    }
  };

  const createCompany = async (
    name: string,
    gst_number?: string,
    address?: string,
  ): Promise<{ success: boolean; company?: Company; error?: string }> => {
    if (!token) {
      return { success: false, error: "You must be logged in to create a company." };
    }

    try {
      const baseUrl = getBackendUrl();
      const res = await fetch(`${baseUrl}/companies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, gst_number, address }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Failed to create company.";
        return { success: false, error: errorMsg };
      }

      const newCompany: Company = data.company;
      const updatedList = [...companies, newCompany];
      setCompanies(updatedList);
      selectCompany(newCompany);

      return { success: true, company: newCompany };
    } catch {
      return { success: false, error: "Network error creating company." };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCompanies([]);
    setActiveCompany(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(COMPANY_KEY);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        companies,
        activeCompany,
        loading,
        login,
        signup,
        logout,
        selectCompany,
        createCompany,
        refreshCompanies,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
