/**
 * WhatsApp pela API oficial (Cloud API da Meta), atrás de variáveis de
 * ambiente — sem elas, nada aqui é usado e o produto segue com os links
 * wa.me (que abrem o WhatsApp da própria pousada com o texto pronto).
 *
 * Mensagem iniciada pela empresa só sai por MODELO aprovado na Meta. O
 * lembrete de chegada usa o modelo de WHATSAPP_MODELO_LEMBRETE com 4
 * variáveis no corpo: {{1}} nome do hóspede, {{2}} pousada, {{3}} data de
 * entrada (dd/mm), {{4}} quarto.
 *
 *   WHATSAPP_TOKEN             token permanente do app (System User)
 *   WHATSAPP_PHONE_NUMBER_ID   id do número remetente
 *   WHATSAPP_MODELO_LEMBRETE   nome do modelo (padrão: lembrete_chegada)
 *   WHATSAPP_IDIOMA            código do idioma do modelo (padrão: pt_BR)
 */
export function whatsappApiConfigurada(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

type Fetch = typeof fetch;

export async function enviarModelo(
  para: string,
  modelo: string,
  parametros: string[],
  fetchImpl: Fetch = fetch,
): Promise<string> {
  if (!whatsappApiConfigurada()) throw new Error('API do WhatsApp não configurada');
  const numero = para.replace(/\D/g, '');
  if (numero.length < 12 || numero.length > 15) throw new Error('telefone sem DDI');
  const versao = process.env.WHATSAPP_API_VERSAO || 'v21.0';
  const r = await fetchImpl(`https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: modelo,
        language: { code: process.env.WHATSAPP_IDIOMA || 'pt_BR' },
        components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text: text.slice(0, 200) })) }],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) throw new Error(`WhatsApp recusou (${r.status}): ${j.error?.message ?? 'erro'}`);
  return String(j.messages?.[0]?.id ?? '');
}
