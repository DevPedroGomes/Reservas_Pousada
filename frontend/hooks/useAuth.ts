"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  handleSignOut
} from "../lib/auth-client";
import type { Usuario, Pousada, UserPousada, Message } from "../lib/types";
import { API_BASE_URL, authenticatedFetch } from "../lib/api";
import { fixarPousadaDaAba } from "../lib/tenant";
import { pousadaDaApi } from "../lib/adaptadores";
import { rastrear } from "../lib/medicao";

interface UseAuthReturn {
  // State
  user: Usuario | null;
  pousada: Pousada | null;
  pousadas: UserPousada[];
  loading: boolean;
  authLoading: boolean;
  signupLoading: boolean;
  googleLoading: boolean;
  pousadaLoading: boolean;
  message: Message | null;
  isAuthenticated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  googleLogin: (opcoes?: Parameters<typeof signInWithGoogle>[0]) => Promise<void>;
  setMessage: (message: Message | null) => void;
  clearMessage: () => void;
  refreshPousadas: (opcoes?: { silencioso?: boolean }) => Promise<void>;
  trocarPousada: (pousadaId: number) => Promise<boolean>;
}

export function useAuth(): UseAuthReturn {
  const { data: session, isPending: sessionLoading } = useSession();

  const [user, setUser] = useState<Usuario | null>(null);
  const [pousada, setPousada] = useState<Pousada | null>(null);
  const [pousadas, setPousadas] = useState<UserPousada[]>([]);
  const [pousadaLoading, setPousadaLoading] = useState(true);
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
    } else if (!sessionLoading) {
      setUser(null);
      setPousada(null);
      setPousadas([]);
      setPousadaLoading(false);
    }
  }, [session, sessionLoading]);

  // Load pousadas from API (single source of truth)
  const refreshPousadas = useCallback(async (opcoes: { silencioso?: boolean } = {}) => {
    if (!session?.user) return;
    // Silencioso: recarrega os dados sem o "carregando" global — que faz o
    // layout trocar a tela pelo spinner e desmontar a página aberta (e com
    // ela a mensagem de "salvo").
    if (!opcoes.silencioso) setPousadaLoading(true);

    try {
      const [minhaRes, minhasRes] = await Promise.all([
        authenticatedFetch(`${API_BASE_URL}/api/pousadas/minha`),
        authenticatedFetch(`${API_BASE_URL}/api/pousadas/minhas`),
      ]);

      const minhaData = await minhaRes.json();
      const minhasData = await minhasRes.json();

      if (minhaData.sucesso && minhaData.pousada) {
        setPousada(pousadaDaApi(minhaData.pousada));
        // Fixa a pousada nesta aba: a partir daqui, trocar em outra aba não
        // muda esta.
        fixarPousadaDaAba(minhaData.pousada.id);
      } else {
        setPousada(null);
        fixarPousadaDaAba(null);
      }

      if (minhasData.sucesso && minhasData.pousadas) {
        setPousadas(minhasData.pousadas);
      }

      // Update user with accurate role/owner from API
      if (minhasData.sucesso && minhasData.pousadas && minhasData.ativaId) {
        const ativa = minhasData.pousadas.find((p: UserPousada) => p.id === minhasData.ativaId);
        if (ativa) {
          setUser(prev => prev ? {
            ...prev,
            pousada_id: minhasData.ativaId,
            role: ativa.role,
            is_owner: ativa.isOwner,
          } : null);
        }
      }

    } catch (error) {
      console.error("Erro ao carregar pousadas:", error);
    } finally {
      setPousadaLoading(false);
    }
  }, [session]);

  // Load pousadas when session arrives
  useEffect(() => {
    if (session?.user) {
      refreshPousadas();
    }
  }, [session?.user?.id]);

  // Switch active pousada (client-side state update, no reload)
  const trocarPousada = useCallback(async (pousadaId: number): Promise<boolean> => {
    try {
      // /trocar grava a escolha como padrão para abas NOVAS; esta aba passa a
      // mandar o id novo no header.
      const response = await authenticatedFetch(`${API_BASE_URL}/api/pousadas/trocar`, {
        method: 'POST',
        body: JSON.stringify({ pousadaId }),
      });

      const data = await response.json();

      if (data.sucesso) {
        fixarPousadaDaAba(data.pousada.id);
        setPousada(pousadaDaApi(data.pousada));
        setUser(prev => prev ? {
          ...prev,
          pousada_id: data.pousada.id,
          role: data.role,
          is_owner: data.isOwner,
        } : null);
        return true;
      } else {
        setMessage({ type: "error", text: data.mensagem || "Erro ao trocar pousada" });
        return false;
      }
    } catch (error) {
      console.error("Erro ao trocar pousada:", error);
      setMessage({ type: "error", text: "Erro ao trocar pousada" });
      return false;
    }
  }, []);

  // Login
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await signInWithEmail(email, password);

      if (result.error) {
        // Conta ainda não confirmada: o backend já reenviou o link (sendOnSignIn).
        if (result.error.code === "EMAIL_NOT_VERIFIED" || result.error.status === 403) {
          setMessage({
            type: "error",
            text: "Confirme seu e-mail para entrar. Acabamos de enviar um novo link para " + email + ".",
          });
          return false;
        }
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

  // Signup
  const signup = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    setSignupLoading(true);
    setMessage(null);

    if (password.length < 8) {
      setMessage({ type: "error", text: "A senha deve ter pelo menos 8 caracteres." });
      setSignupLoading(false);
      return false;
    }

    try {
      const result = await signUpWithEmail(email, password, name);

      if (result.error) {
        setMessage({ type: "error", text: result.error.message || "Erro ao criar conta." });
        return false;
      }

      rastrear("cadastro");

      // Sem sessão até confirmar o e-mail: o link leva direto ao onboarding
      // (ou ao convite) já autenticado.
      setMessage({
        type: "success",
        text: "Conta criada! Enviamos um link de confirmação para " + email + ". Abra o e-mail para continuar.",
      });
      return true;
    } catch (error: any) {
      console.error("Erro ao criar conta", error);
      setMessage({ type: "error", text: error.message || "Erro ao criar conta. Tente novamente." });
      return false;
    } finally {
      setSignupLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await handleSignOut();
      fixarPousadaDaAba(null);
      setUser(null);
      setPousada(null);
      setPousadas([]);
      window.location.assign("/");
    } catch (error) {
      console.error("Erro ao fazer logout", error);
    }
  }, []);

  // Google Login
  const googleLogin = useCallback(async (opcoes?: Parameters<typeof signInWithGoogle>[0]) => {
    try {
      setGoogleLoading(true);
      setMessage(null);
      await signInWithGoogle(opcoes);
    } catch (error: any) {
      console.error("Erro ao iniciar login com Google:", error);
      setMessage({ type: "error", text: "Erro ao iniciar login com Google." });
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  return {
    user,
    pousada,
    pousadas,
    loading,
    authLoading: sessionLoading,
    signupLoading,
    googleLoading,
    pousadaLoading,
    message,
    isAuthenticated: !!session?.user,
    login,
    signup,
    logout,
    googleLogin,
    setMessage,
    clearMessage,
    refreshPousadas,
    trocarPousada,
  };
}
