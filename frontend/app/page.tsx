import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import "./landing.css"
import { AcessoNoTopo } from "../components/landing/AcessoNoTopo"
import { CenaDaPorta } from "../components/landing/CenaDaPorta"
import { MarcaDiaria } from "../components/landing/MarcaDiaria"
import { PreferenciasDeCookies } from "../components/legal/PreferenciasDeCookies"
import { DIAS_DE_TRIAL, PLANOS_PUBLICOS } from "../lib/planos-publicos"

/**
 * Página pública, renderizada no servidor e sem JavaScript de animação.
 *
 * Só promete o que o produto entrega hoje, com os limites escritos: iCal tem
 * janela de horas e a FNRH é coletada, não enviada ao governo.
 */

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || "https://diaria.gomio.com.br"
const CONTATO = process.env.NEXT_PUBLIC_CONTATO_EMAIL || ""

export const metadata: Metadata = {
  title: "Diária: sistema de reservas para pousadas",
  description:
    "Mapa de ocupação, reservas pelo WhatsApp com Pix do sinal na sua chave e equipe trabalhando junta. Teste grátis por 14 dias, sem cartão.",
  alternates: { canonical: URL_APP },
  openGraph: {
    title: "Diária: tem vaga? O mapa da sua pousada responde.",
    description: "Reservas, Pix do sinal, pré-check-in e equipe num lugar só. 14 dias grátis, sem cartão.",
    url: URL_APP,
    siteName: "Diária",
    locale: "pt_BR",
    type: "website",
  },
}

/** Um dia de exemplo: é a sequência real das tarefas da recepção. */
const dia = [
  {
    hora: "07:12",
    titulo: "O sinal caiu antes do café.",
    texto: "O Pix da Marina confirma a reserva do Chalé Jabuticaba. Com a sua conta Asaas ligada, a baixa é automática. Com a sua chave, um clique em \"Recebi o Pix\".",
  },
  {
    hora: "10:40",
    titulo: "Quem sai, quem chega, quem deve.",
    texto: "A agenda do dia abre na primeira tela, com check-in e check-out em um clique e o saldo de cada hóspede ao lado.",
  },
  {
    hora: "13:25",
    titulo: "A ficha chegou preenchida.",
    texto: "A família preenche o pré-check-in pelo link, com os campos da FNRH, ainda na estrada. A recepção só confere e imprime.",
  },
  {
    hora: "16:05",
    titulo: "Pedido pelo seu site, sem comissão.",
    texto: "O hóspede vê as datas livres e o preço no endereço da sua pousada. O pedido vira pré-reserva e o sinal cai na sua conta.",
  },
  {
    hora: "19:30",
    titulo: "Mensagem pronta no WhatsApp.",
    texto: "Confirmação, instruções de chegada e agradecimento com um toque, do seu próprio número. Com a API oficial ligada, um atendente virtual responde disponibilidade fora de hora e passa o resto para a equipe.",
  },
  {
    hora: "23:10",
    titulo: "A pousada dorme, os números ficam.",
    texto: "Ocupação, diária média, RevPAR, receita por canal e o que falta receber. Cada mudança fica registrada com quem fez e quando.",
  },
]

const faq = [
  ["Preciso de cartão para testar?", `Não. São ${DIAS_DE_TRIAL} dias com tudo liberado. Você só escolhe um plano se quiser continuar.`],
  ["Funciona com Booking e Airbnb?", "Sim, pela sincronização de calendário (iCal) de cada quarto. O Diária busca os calendários a cada 30 minutos, mas as OTAs levam horas para atualizar do lado delas: o Airbnb informa até 3 horas. Nessa janela uma venda dupla é possível. Para fechar esse risco por completo, é preciso um channel manager, que o Diária ainda não é. Cada quarto também precisa existir como unidade separada na OTA."],
  ["O Diária envia a FNRH ao Ministério do Turismo?", "Ainda não. O pré-check-in coleta os campos da ficha e a recepção consulta e imprime, mas o envio ao sistema do governo continua sendo responsabilidade da pousada."],
  ["O sistema impede reserva em dobro?", "Dentro do Diária, sim. O próprio banco de dados recusa duas reservas no mesmo quarto e período, venham da equipe, do site, da planilha ou de um calendário importado."],
  ["Minha equipe pode usar ao mesmo tempo?", "Pode, do computador ou do celular. Cada pessoa vê o que o papel dela permite: recepção, administração ou auditoria."],
  ["Quantos quartos posso cadastrar?", "Até 10 no Essencial, 25 no Pousada e 100 no Rede, em até 3 propriedades."],
  ["Consigo trazer minhas reservas do Excel?", "Sim. Salve a planilha como CSV e importe. O sistema mostra uma prévia, aponta as linhas com problema e só grava depois da sua conferência."],
  ["E os dados dos meus hóspedes?", "CPF e ficha de hóspede ficam cifrados, e cada visualização do documento fica registrada. Você exporta suas reservas ou exclui a conta quando quiser."],
  ["Posso cancelar quando quiser?", "Sim, sem fidelidade. E você exporta suas reservas em planilha a qualquer momento."],
]

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Diária",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "Sistema de reservas e gestão para pousadas.",
  offers: PLANOS_PUBLICOS.map((p) => ({
    "@type": "Offer",
    name: p.nome,
    price: p.mensal,
    priceCurrency: "BRL",
  })),
}

export default function Home() {
  return (
    <div className="landing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <a href="#conteudo" className="pular">Ir para o conteúdo</a>
      <header className="topo">
        <div className="topo-linha">
          <Link href="/" aria-label="Diária, início" style={{ textDecoration: "none" }}>
            <MarcaDiaria />
          </Link>
          <nav className="topo-nav" aria-label="Seções">
            <a href="#dia">Como é o dia</a>
            <a href="#planos">Planos</a>
            <a href="#perguntas">Dúvidas</a>
          </nav>
          <AcessoNoTopo />
        </div>
      </header>

      <main id="conteudo">
        <CenaDaPorta />

        <section id="dia" className="dia" aria-labelledby="dia-titulo">
          <div className="dia-palco">
            <div className="dia-sol" aria-hidden />
            <div className="dia-trilho">
              <div className="dia-abertura">
                <h2 id="dia-titulo">Um dia na recepção, sem caderno.</h2>
                <p>Um dia de exemplo, com o que o Diária já faz hoje.</p>
              </div>
              {dia.map((m) => (
                <article key={m.hora} className="momento">
                  <p className="momento-hora"><time>{m.hora}</time></p>
                  <h3>{m.titulo}</h3>
                  <p className="momento-texto">{m.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="planos" aria-labelledby="planos-titulo">
          <div className="conteudo">
            <h2 id="planos-titulo">O preço não muda com a sua temporada.</h2>
            <p className="planos-sub">
              Sem comissão por reserva e sem fidelidade. {DIAS_DE_TRIAL} dias grátis, sem cartão. No anual, 2 meses saem de graça.
            </p>
            <ul className="planos-lista">
              {PLANOS_PUBLICOS.map((p) => (
                <li key={p.codigo} className="plano">
                  <div className="plano-nome">
                    <h3>{p.nome}</h3>
                    <p>{p.resumo}</p>
                  </div>
                  <p className="plano-preco">
                    <span>{p.mensal}</span>
                    <small>reais por mês</small>
                  </p>
                  <ul className="plano-itens">
                    {p.itens.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
            <Link href="/cadastro" className="botao botao-tinta">Testar {DIAS_DE_TRIAL} dias grátis<span className="botao-seta"><ArrowRight strokeWidth={2.5} aria-hidden /></span></Link>
          </div>
        </section>

        <section id="perguntas" className="duvidas" aria-labelledby="duvidas-titulo">
          <div className="conteudo duvidas-grade">
            <h2 id="duvidas-titulo">O que perguntam antes de sair do caderno.</h2>
            <div className="duvidas-lista">
              {faq.map(([q, a]) => (
                <details key={q} className="duvida">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="rodape">
        <div className="conteudo rodape-linha">
          <p className="rodape-frase">Sua primeira reserva pode entrar hoje.</p>
          <Link href="/cadastro" className="botao botao-sobre-realce">Testar {DIAS_DE_TRIAL} dias grátis<span className="botao-seta"><ArrowRight strokeWidth={2.5} aria-hidden /></span></Link>
        </div>
        <p className="rodape-nome" aria-hidden>Diária</p>
        <div className="conteudo rodape-legal">
          <p>© {new Date().getFullYear()} Diária</p>
          <nav aria-label="Legal">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos de uso</Link>
            {CONTATO && <a href={`mailto:${CONTATO}`}>Contato</a>}
            <PreferenciasDeCookies className="" />
          </nav>
        </div>
      </footer>
    </div>
  )
}
