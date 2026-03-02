"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  handleSignOut
} from "../lib/auth-client";
import type { Usuario, Pousada, Message } from "../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface UseAuthReturn {
  // State
  user: Usuario | null;
  pousada: Pousada | null;
  loading: boolean;
  authLoading: boolean;
  signupLoading: boolean;
  googleLoading: boolean;
  message: Message | null;
  isAuthenticated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  googleLogin: () => Promise<void>;
  setMessage: (message: Message | null) => void;
  clearMessage: () => void;
  refreshSession: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const { data: session, isPending: sessionLoading, error: sessionError } = useSession();

  const [user, setUser] = useState<Usuario | null>(null);
  const [pousada, setPousada] = useState<Pousada | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const clearMessage = useCallback(() => setMessage(null), []);

  // Map session user to our Usuario type
  useEffect(() => {
    if (session?.user) {
      setUser({
        id: session.user.id,
        nome: session.user.name,
        email: session.user.email,
        avatar_url: session.user.image || null,
        role: (session.user as any).role || 'recepcao',
        pousada_id: (session.user as any).pousadaId || null,
        is_owner: (session.user as any).isOwner || false,
        email_verified: session.user.emailVerified || false,
      });
    } else {
      setUser(null);
    }
  }, [session]);

  // Load pousada data when user is authenticated
  const carregarPousada = useCallback(async () => {
    if (!session?.user) return;

    try {
      const response = await fetch(`${API_URL}/api/pousadas/minha`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.sucesso && data.pousada) {
        setPousada(data.pousada);
      } else if (data.needsOnboarding) {
        // User needs to complete onboarding
        setPousada(null);
      }
    } catch (error) {
      console.error("Erro ao carregar pousada:", error);
    }
  }, [session]);

  useEffect(() => {
    if (session?.user) {
      carregarPousada();
    }
  }, [session, carregarPousada]);

  // Check if user needs onboarding
  useEffect(() => {
    if (session?.user && !(session.user as any).pousadaId) {
      // User is authenticated but has no pousada - redirect to onboarding
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith('/onboarding') && !currentPath.startsWith('/auth')) {
        router.push('/onboarding');
      }
    }
  }, [session, router]);

  // Login with email/password
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await signInWithEmail(email, password);

      if (result.error) {
        setMessage({ type: "error", text: result.error.message || "Falha ao autenticar." });
        return false;
      }

      setMessage({ type: "success", text: "Login realizado com sucesso." });
      return true;
    } catch (error: any) {
      console.error("Erro ao fazer login", error);
      setMessage({ type: "error", text: error.message || "Erro ao fazer login. Tente novamente." });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Signup with email/password
  const signup = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    setSignupLoading(true);
    setMessage(null);

    if (password.length < 6) {
      setMessage({ type: "error", text: "A senha deve ter pelo menos 6 caracteres." });
      setSignupLoading(false);
      return false;
    }

    try {
      const result = await signUpWithEmail(email, password, name, {
        callbackURL: "/onboarding",
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error.message || "Erro ao criar conta." });
        return false;
      }

      setMessage({ type: "success", text: "Conta criada! Configure sua pousada..." });
      router.push("/onboarding");
      return true;
    } catch (error: any) {
      console.error("Erro ao criar conta", error);
      setMessage({ type: "error", text: error.message || "Erro ao criar conta. Tente novamente." });
      return false;
    } finally {
      setSignupLoading(false);
    }
  }, [router]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await handleSignOut();
      setUser(null);
      setPousada(null);
      router.push("/");
    } catch (error) {
      console.error("Erro ao fazer logout", error);
    }
  }, [router]);

  // Google Login
  const googleLogin = useCallback(async () => {
    try {
      setGoogleLoading(true);
      setMessage(null);

      await signInWithGoogle();
    } catch (error: any) {
      console.error("Erro ao iniciar login com Google:", error);
      setMessage({ type: "error", text: "Erro ao iniciar login com Google." });
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  // Refresh session
  const refreshSession = useCallback(async () => {
    // Better Auth handles session refresh automatically via cookies
    // This is a placeholder for manual refresh if needed
    window.location.reload();
  }, []);

  return {
    user,
    pousada,
    loading,
    authLoading: sessionLoading,
    signupLoading,
    googleLoading,
    message,
    isAuthenticated: !!session?.user,
    login,
    signup,
    logout,
    googleLogin,
    setMessage,
    clearMessage,
    refreshSession,
  };
}
