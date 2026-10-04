/**
 * Modelo de linguagem com chamada de ferramentas, independente de provedor.
 *
 * O agente só conversa e escolhe ferramentas; quem consulta e grava dado é o
 * servidor (models/Agente.ts). Por isso um modelo pequeno e barato dá conta.
 *
 *   AGENTE_PROVEDOR   anthropic (padrão) | openai  — "openai" serve para qualquer
 *                     API compatível: OpenAI, Groq, Gemini (endpoint OpenAI),
 *                     OpenRouter, Ollama local...
 *   AGENTE_API_KEY    chave do provedor (ou ANTHROPIC_API_KEY)
 *   AGENTE_MODELO     ex.: claude-haiku-4-5-20251001, llama-3.1-8b-instant, gemini-2.0-flash-lite
 *   AGENTE_BASE_URL   só para "openai": ex. https://api.groq.com/openai/v1
 */

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>; // JSON Schema
}

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export type MensagemLLM =
  | { papel: 'usuario'; texto: string }
  | { papel: 'assistente'; texto: string | null; chamadas?: ChamadaFerramenta[] }
  | { papel: 'ferramenta'; id: string; nome: string; resultado: string };

export interface RespostaLLM {
  texto: string | null;
  chamadas: ChamadaFerramenta[];
}

export interface ModeloLLM {
  responder(sistema: string, mensagens: MensagemLLM[], ferramentas: Ferramenta[]): Promise<RespostaLLM>;
}

type Fetch = typeof fetch;

export function agenteConfigurado(): boolean {
  return Boolean(process.env.AGENTE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.AGENTE_PROVEDOR === 'openai' && process.env.AGENTE_BASE_URL);
}

export function anthropic(chave: string, modelo: string, fetchImpl: Fetch = fetch): ModeloLLM {
  return {
    async responder(sistema, mensagens, ferramentas) {
      // Resultados de ferramenta seguidos vão juntos numa mensagem do usuário.
      const msgs: { role: 'user' | 'assistant'; content: unknown }[] = [];
      for (const m of mensagens) {
        if (m.papel === 'usuario') msgs.push({ role: 'user', content: m.texto });
        else if (m.papel === 'assistente') {
          const blocos: unknown[] = [];
          if (m.texto) blocos.push({ type: 'text', text: m.texto });
          for (const c of m.chamadas ?? []) blocos.push({ type: 'tool_use', id: c.id, name: c.nome, input: c.argumentos });
          msgs.push({ role: 'assistant', content: blocos.length ? blocos : '' });
        } else {
          const bloco = { type: 'tool_result', tool_use_id: m.id, content: m.resultado };
          const ultima = msgs.at(-1);
          if (ultima?.role === 'user' && Array.isArray(ultima.content)) (ultima.content as unknown[]).push(bloco);
          else msgs.push({ role: 'user', content: [bloco] });
        }
      }
      const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelo, max_tokens: 500, system: sistema, messages: msgs,
          tools: ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, any>;
      if (!r.ok) throw new Error(`LLM: ${j.error?.message ?? `HTTP ${r.status}`}`);
      const blocos = (j.content ?? []) as Record<string, any>[];
      return {
        texto: blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || null,
        chamadas: blocos.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, nome: b.name, argumentos: b.input ?? {} })),
      };
    },
  };
}

export function compativelOpenAI(baseUrl: string, chave: string, modelo: string, fetchImpl: Fetch = fetch): ModeloLLM {
  return {
    async responder(sistema, mensagens, ferramentas) {
      const msgs: Record<string, unknown>[] = [{ role: 'system', content: sistema }];
      for (const m of mensagens) {
        if (m.papel === 'usuario') msgs.push({ role: 'user', content: m.texto });
        else if (m.papel === 'assistente') {
          msgs.push({
            role: 'assistant',
            content: m.texto,
            ...(m.chamadas?.length
              ? { tool_calls: m.chamadas.map((c) => ({ id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.argumentos) } })) }
              : {}),
          });
        } else msgs.push({ role: 'tool', tool_call_id: m.id, content: m.resultado });
      }
      const r = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo, max_tokens: 500, messages: msgs,
          tools: ferramentas.map((f) => ({ type: 'function', function: { name: f.nome, description: f.descricao, parameters: f.parametros } })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, any>;
      if (!r.ok) throw new Error(`LLM: ${j.error?.message ?? `HTTP ${r.status}`}`);
      const msg = j.choices?.[0]?.message ?? {};
      return {
        texto: (msg.content as string | null)?.trim() || null,
        chamadas: ((msg.tool_calls ?? []) as Record<string, any>[]).map((c) => {
          let argumentos: Record<string, unknown> = {};
          try { argumentos = JSON.parse(c.function?.arguments || '{}'); } catch { /* argumento malformado vira vazio */ }
          return { id: c.id, nome: c.function?.name, argumentos };
        }),
      };
    },
  };
}

// Testes trocam o modelo por um roteiro (sem rede).
let modeloDeTeste: ModeloLLM | null = null;
export function usarModeloDeTeste(m: ModeloLLM | null): void {
  modeloDeTeste = m;
}

export function modeloDoAgente(): ModeloLLM {
  if (modeloDeTeste) return modeloDeTeste;
  const chave = process.env.AGENTE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  if (process.env.AGENTE_PROVEDOR === 'openai') {
    return compativelOpenAI(process.env.AGENTE_BASE_URL || 'https://api.openai.com/v1', chave, process.env.AGENTE_MODELO || 'gpt-4o-mini');
  }
  return anthropic(chave, process.env.AGENTE_MODELO || 'claude-haiku-4-5-20251001');
}
