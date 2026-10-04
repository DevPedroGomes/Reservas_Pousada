import type { Metadata } from "next"
import { PaginaLegal } from "../../components/legal/PaginaLegal"
import { EMPRESA, VIGENCIA_DOCUMENTOS } from "../../lib/empresa"

export const metadata: Metadata = {
  title: "Política de privacidade — Diária",
  description: "Como o Diária trata os dados pessoais de quem usa o sistema e dos hóspedes das pousadas.",
}

/**
 * Política de privacidade. Descreve o que o sistema REALMENTE faz (dados,
 * finalidades, terceiros, retenção). Mudou o tratamento no código, muda aqui.
 * Texto-base: precisa de revisão jurídica antes de valer como definitivo.
 */
export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de privacidade" vigencia={VIGENCIA_DOCUMENTOS}>
      <p>
        Esta política explica como o Diária, serviço de gestão de reservas para pousadas operado por{" "}
        {EMPRESA.razaoSocial} (CNPJ {EMPRESA.cnpj}), trata dados pessoais, nos termos da Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Quem é quem</h2>
      <ul>
        <li>
          <strong>Dados de quem usa o sistema</strong> (donos de pousada e equipe): o Diária é o{" "}
          <em>controlador</em>.
        </li>
        <li>
          <strong>Dados dos hóspedes</strong> cadastrados pela pousada: a pousada é a <em>controladora</em> e o
          Diária atua como <em>operador</em>, tratando esses dados apenas para prestar o serviço contratado e
          conforme as instruções da pousada.
        </li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li><strong>Conta:</strong> nome, e-mail, senha (guardada apenas como hash), foto e identificador do Google quando você entra com o Google.</li>
        <li><strong>Uso e segurança:</strong> endereço IP, navegador, data e hora de acesso, sessões ativas e registro de ações no sistema (trilha de auditoria).</li>
        <li><strong>Pousada:</strong> nome, endereço, telefone, e-mail e configurações.</li>
        <li><strong>Hóspedes</strong> (inseridos pela pousada): nome, CPF, datas da estadia, quarto, valores, situação de pagamento e observações.</li>
        <li><strong>Cobrança:</strong> plano contratado e situação da assinatura. Dados de cartão são tratados diretamente pela Stripe; o Diária não os recebe nem armazena.</li>
        <li><strong>WhatsApp da pousada</strong> (quando ela conecta o número): número e nome de perfil de quem escreve e o texto das mensagens trocadas, guardados cifrados por até 90 dias.</li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>Prestar o serviço (contas, reservas, equipe, painel) — execução de contrato (art. 7º, V).</li>
        <li>Segurança, prevenção a fraude e trilha de auditoria — legítimo interesse (art. 7º, IX) e exercício regular de direitos.</li>
        <li>Cobrança da assinatura — execução de contrato.</li>
        <li>E-mails de serviço (confirmação de conta, redefinição de senha, convites) — execução de contrato.</li>
        <li>Atendimento pelo WhatsApp da pousada, inclusive pelo atendente virtual (consultar vagas e preços, fazer pré-reserva, passar a conversa para a equipe) — em nome da pousada, para os procedimentos preliminares do contrato de hospedagem que o hóspede pediu (art. 7º, V). O hóspede pode pedir uma pessoa a qualquer momento escrevendo “atendente”, e parar as mensagens automáticas escrevendo “parar”.</li>
        <li>Medição de audiência e anúncios — somente com o seu consentimento (art. 7º, I), que pode ser retirado a qualquer momento.</li>
      </ul>

      <h2>4. Como protegemos</h2>
      <ul>
        <li>CPF dos hóspedes cifrado no banco de dados (AES-256-GCM), com chave guardada fora do banco.</li>
        <li>Cada pessoa da equipe acessa apenas o que o papel dela permite; listagens mostram o CPF mascarado.</li>
        <li>Visualizações do CPF completo, alterações de reservas e exportações ficam registradas.</li>
        <li>Conexão sempre cifrada (HTTPS), cookies de sessão protegidos e limites de tentativas de acesso.</li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>
      <p>Não vendemos dados. Compartilhamos apenas com fornecedores necessários ao serviço:</p>
      <ul>
        <li><strong>Hospedagem e banco de dados</strong> — infraestrutura em servidor contratado pelo Diária.</li>
        <li><strong>Resend</strong> — envio de e-mails do sistema (Estados Unidos).</li>
        <li><strong>Stripe</strong> — processamento de pagamentos da assinatura (Estados Unidos).</li>
        <li><strong>Google</strong> — apenas se você escolher entrar com a conta Google.</li>
        <li><strong>Meta (WhatsApp Business)</strong> — apenas para pousadas que conectam o próprio WhatsApp: entrega das mensagens entre a pousada e o hóspede.</li>
        <li><strong>Provedor do modelo de linguagem do atendente virtual</strong> — apenas quando a pousada liga o atendente: recebe o texto da conversa para redigir a resposta, sem uso para treinar modelos.</li>
        <li><strong>Asaas</strong> — apenas para pousadas que ligam a confirmação automática do Pix: geração e consulta da cobrança do sinal, na conta da própria pousada.</li>
        <li><strong>Sentry</strong> — quando habilitado, recebe relatórios de erro técnico, sem conteúdo de reservas, cookies ou dados de hóspedes.</li>
      </ul>
      <p>
        Fornecedores no exterior são contratados com cláusulas e garantias de proteção compatíveis com a LGPD
        (art. 33).
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta: enquanto a conta existir. Após a exclusão, são apagados ou anonimizados, salvo o que a lei obrigue a manter.</li>
        <li>Dados de hóspedes: pelo prazo definido pela pousada e pelas obrigações legais aplicáveis a ela; ao fim do contrato, são devolvidos ou eliminados conforme instrução da pousada.</li>
        <li>Registros de acesso: pelo prazo do Marco Civil da Internet (6 meses) ou mais, quando necessário à segurança.</li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir confirmação, acesso, correção, portabilidade, anonimização ou eliminação dos seus dados,
        informações sobre compartilhamento e a revogação do consentimento (art. 18). Parte disso está disponível
        no próprio sistema, em Configurações (exportar e excluir a conta). Para o restante, escreva para{" "}
        {EMPRESA.emailPrivacidade}. Hóspedes devem procurar primeiro a pousada, que é a controladora dos dados
        deles; o Diária apoia a pousada no atendimento.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Usamos cookies essenciais para manter você conectado com segurança. Cookies de medição ou de anúncios só
        são ativados se você consentir no aviso exibido na primeira visita, e podem ser recusados sem prejuízo ao
        uso do sistema.
      </p>

      <h2>9. Encarregado e contato</h2>
      <p>
        Encarregado pelo tratamento de dados: {EMPRESA.encarregado} — {EMPRESA.emailPrivacidade}.
        <br />
        {EMPRESA.razaoSocial}, {EMPRESA.endereco}.
      </p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Avisaremos por e-mail ou no sistema sobre mudanças relevantes. A data de vigência no topo indica a
        versão atual.
      </p>
    </PaginaLegal>
  )
}
