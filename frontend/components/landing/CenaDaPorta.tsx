import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MapaOcupacao, type QuartoDoMapa, type ReservaDoMapa } from "../mapa/MapaOcupacao"
import { DIAS_DE_TRIAL } from "../../lib/planos-publicos"

/**
 * Abertura da página: a pergunta que a recepção ouve o dia todo, pintada numa
 * porta. Rolar abre a porta e mostra a resposta no mapa de ocupação de verdade
 * (o mesmo componente do painel, com dados de exemplo).
 *
 * Tudo é CSS: o `animation-timeline` roda fora da thread principal e o HTML vem
 * pronto do servidor. Sem suporte, ou com movimento reduzido, a página mostra a
 * porta, o mapa completo e os textos em sequência.
 */

const quartos: QuartoDoMapa[] = [
  { numero: 1, nome: "Suíte Mar", capacidade: 2, ativo: true },
  { numero: 2, nome: "Suíte Coqueiro", capacidade: 2, ativo: true },
  { numero: 3, nome: "Chalé Ipê", capacidade: 4, ativo: true },
  { numero: 4, nome: "Chalé Jabuticaba", capacidade: 4, ativo: true },
  { numero: 5, nome: "Quarto Varanda", capacidade: 3, ativo: true },
  { numero: 6, nome: "Quarto Jardim", capacidade: 2, ativo: true },
]

function reserva(id: number, quarto: number, nome: string, data_entrada: string, data_saida: string, status: string, pago = true): ReservaDoMapa {
  return { id, quarto, nome, data_entrada, data_saida, status, pago, adultos: 2, criancas: 0, canal: "direto" }
}

/** Dezembro de 2026: datas fixas porque a página é estática. */
const INICIO = "2026-12-14"
const HOJE = "2026-12-16"

const reservas: ReservaDoMapa[] = [
  reserva(1, 1, "Helena Prado", "2026-12-13", "2026-12-17", "hospedada"),
  reserva(2, 1, "Otávio e Rita", "2026-12-17", "2026-12-21", "confirmada"),
  reserva(3, 2, "Família Nogueira", "2026-12-15", "2026-12-19", "hospedada"),
  reserva(4, 3, "Cauã Medeiros", "2026-12-16", "2026-12-20", "confirmada"),
  reserva(5, 5, "Iara Fontes", "2026-12-14", "2026-12-16", "hospedada"),
  reserva(6, 5, "Bruno Tavares", "2026-12-18", "2026-12-23", "confirmada", false),
  reserva(7, 6, "Lívia e Tomás", "2026-12-16", "2026-12-18", "confirmada"),
  // Chega durante a rolagem
  reserva(20, 4, "Marina Albuquerque", "2026-12-17", "2026-12-20", "pre_reserva", false),
  reserva(21, 4, "Marina Albuquerque", "2026-12-17", "2026-12-20", "confirmada"),
  reserva(22, 4, "Quarto ocupado", "2026-12-18", "2026-12-21", "cancelada"),
  reserva(23, 2, "Booking: Rafael S.", "2026-12-20", "2026-12-24", "confirmada"),
  reserva(24, 6, "Airbnb: Ana C.", "2026-12-19", "2026-12-22", "confirmada"),
]

const CLASSE_DA_CENA: Record<number, string> = {
  20: "cena-pre",
  21: "cena-pix",
  22: "cena-choque",
  23: "cena-ota",
  24: "cena-ota cena-ota-2",
}

const passos = [
  ["Todo quarto, todo dia, numa tela só.", "Clique no espaço livre e a reserva já nasce com quarto e data."],
  ["A pré-reserva segura o quarto.", "Se o sinal não vier no prazo, ela se cancela sozinha e a vaga volta."],
  ["O Pix caiu, a reserva confirma.", "Na sua chave ou na sua conta Asaas. O saldo de cada hóspede fica à vista."],
  ["Duas reservas no mesmo quarto? O banco recusa.", "Mesmo lançadas no mesmo segundo, por duas pessoas da equipe."],
  ["Booking e Airbnb entram pelo calendário.", "Sincronização iCal de cada quarto. As OTAs levam horas para atualizar, então vale fechar as datas críticas à mão."],
]

export function CenaDaPorta() {
  return (
    <section className="cena" aria-label="Apresentação">
      <div className="palco">
        <div className="interior">
          <div className="interior-mapa">
            <div className="so-desktop moldura-mapa bezel">
              <MapaOcupacao inicio={INICIO} dias={12} hoje={HOJE} quartos={quartos} reservas={reservas} podeCriar={false} classeDaReserva={(r) => CLASSE_DA_CENA[r.id]} estatico />
            </div>
            <div className="so-celular moldura-mapa bezel">
              <MapaOcupacao inicio="2026-12-16" dias={5} hoje={HOJE} quartos={quartos} reservas={reservas} podeCriar={false} classeDaReserva={(r) => CLASSE_DA_CENA[r.id]} estatico />
            </div>
            <p className="interior-nota">Mapa do Diária com dados de exemplo.</p>
          </div>
          <ol className="passos">
            {passos.map(([titulo, texto]) => (
              <li key={titulo} className="passo">
                <h2>{titulo}</h2>
                <p>{texto}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="fachada">
          <div className="vao">
            <div className="folha folha-esquerda">
              <div className="folha-face">
                <div className="almofadas" aria-hidden><i /><i /><i /><i /></div>
                <h1 className="pergunta"><span>Tem</span> <span>vaga?</span></h1>
              </div>
            </div>
            <div className="folha folha-direita" aria-hidden>
              <div className="folha-face">
                <div className="almofadas"><i /><i /><i /><i /></div>
                <p className="pergunta"><span>Tem</span> <span>vaga?</span></p>
              </div>
            </div>
            <div className="porta-texto">
              <p>O mapa da sua pousada responde em segundos. Reservas, Pix do sinal e equipe num lugar só.</p>
              <div className="porta-acoes">
                <Link href="/cadastro" className="botao botao-sobre-realce">Testar {DIAS_DE_TRIAL} dias grátis<span className="botao-seta"><ArrowRight strokeWidth={2.5} aria-hidden /></span></Link>
                <a href="#planos" className="link-porta">Ver planos</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
