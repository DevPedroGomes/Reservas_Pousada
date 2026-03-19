"use client";

import { useState, useCallback } from "react";
import type { StaffInvite, Message } from "../lib/types";
import { API_BASE_URL } from "../lib/api";

interface UseStaffInvitesReturn {
  convites: StaffInvite[];
  loading: boolean;
  message: Message | null;
  carregarConvites: (pousadaId: number) => Promise<void>;
  enviarConvite: (pousadaId: number, email: string, role: string) => Promise<boolean>;
  revogarConvite: (pousadaId: number, inviteId: number) => Promise<boolean>;
  setMessage: (msg: Message | null) => void;
}

export function useStaffInvites(): UseStaffInvitesReturn {
  const [convites, setConvites] = useState<StaffInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const carregarConvites = useCallback(async (pousadaId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/pousadas/${pousadaId}/convites`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.sucesso) {
        setConvites(data.convites);
      }
    } catch (error) {
      console.error("Erro ao carregar convites:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const enviarConvite = useCallback(async (pousadaId: number, email: string, role: string): Promise<boolean> => {
    try {
      setLoading(true);
      setMessage(null);

      const response = await fetch(`${API_BASE_URL}/api/pousadas/${pousadaId}/convites`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (data.sucesso) {
        setMessage({ type: "success", text: "Convite enviado com sucesso!" });
        await carregarConvites(pousadaId);
        return true;
      } else {
        setMessage({ type: "error", text: data.mensagem || "Erro ao enviar convite" });
        return false;
      }
    } catch (error) {
      console.error("Erro ao enviar convite:", error);
      setMessage({ type: "error", text: "Erro ao enviar convite" });
      return false;
    } finally {
      setLoading(false);
    }
  }, [carregarConvites]);

  const revogarConvite = useCallback(async (pousadaId: number, inviteId: number): Promise<boolean> => {
    try {
      setLoading(true);
      setMessage(null);

      const response = await fetch(`${API_BASE_URL}/api/pousadas/${pousadaId}/convites/${inviteId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (data.sucesso) {
        setMessage({ type: "success", text: "Convite revogado" });
        await carregarConvites(pousadaId);
        return true;
      } else {
        setMessage({ type: "error", text: data.mensagem || "Erro ao revogar convite" });
        return false;
      }
    } catch (error) {
      console.error("Erro ao revogar convite:", error);
      setMessage({ type: "error", text: "Erro ao revogar convite" });
      return false;
    } finally {
      setLoading(false);
    }
  }, [carregarConvites]);

  return {
    convites,
    loading,
    message,
    carregarConvites,
    enviarConvite,
    revogarConvite,
    setMessage,
  };
}
