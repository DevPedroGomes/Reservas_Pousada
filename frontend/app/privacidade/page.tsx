import type { Metadata } from "next"
import { PaginaLegal } from "../../components/legal/PaginaLegal"
import { EMPRESA, VIGENCIA_DOCUMENTOS } from "../../lib/empresa"
import { PreferenciasDeCookies } from "../../components/legal/PreferenciasDeCookies"

export const metadata: Metadata = {
  title: "Política de privacidade | Diária",
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
        Proteção de Dados (Lei nº 13.709/2018, LGPD).
      </p>

      <h2>1. Quem é quem</h2>
      <ul>
        <li>
          <strong>Dados de quem usa o sistema</strong> (donos de pousada e equipe) e de quem visita o site: o
          Diária é o <em>controlador</em>.
        </li>
        <li>
          <strong>Dados dos hóspedes</strong> (cadastrados pela pousada ou enviados pelo próprio hóspede no pedido
          de reserva, no pré-check-in e no WhatsApp dela): a pousada é a <em>controladora</em>, decide por que e
          por quanto tempo trata esses dados e responde ao hóspede por eles. O Diária atua como <em>operador</em>,
          tratando-os apenas para prestar o serviço contratado e conforme as instruções da pousada.
        </li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li><strong>Conta:</strong> nome, e-mail, senha (guardada apenas como hash), foto e identificador do Google quando você entra com o Google.</li>
        <li><strong>Uso e segurança:</strong> endereço IP, navegador, data e hora de acesso, sessões ativas e registro de ações no sistema (trilha de auditoria).</li>
        <li><strong>Pousada:</strong> nome, endereço, telefone, e-mail e configurações.</li>
        <li><strong>Hóspedes</strong> (inseridos pela pousada ou enviados no pedido de reserva): nome, CPF ou outro documento, telefone, e-mail, nacionalidade, data de nascimento, datas da estadia, quarto, número de adultos e crianças, valores, situação de pagamento e observações.</li>
        <li><strong>Ficha de registro de hóspede</strong> (pré-check-in, com os campos da FNRH, quando a pousada envia o link): nome, data de nascimento, gênero, nacionalidade, tipo, número e órgão emissor do documento, e-mail, telefone, profissão, cidade, estado e país de residência, motivo da viagem, meio de transporte, procedência e próximo destino. Dos acompanhantes, inclusive crianças e adolescentes: nome, data de nascimento, documento e parentesco. Também guardamos o IP de envio e a data e a versão desta política no momento da autorização. A ficha é entregue à pousada; o Diária não a envia ao Ministério do Turismo.</li>
        <li><strong>Origem do cadastro:</strong> de onde veio quem criou a conta (parâmetros de campanha, identificadores de clique, site de origem e página de entrada).</li>
        <li><strong>Cobrança:</strong> plano contratado e situação da assinatura. Dados de cartão são tratados diretamente pela Stripe; o Diária não os recebe nem armazena.</li>
        <li><strong>WhatsApp da pousada</strong> (quando ela conecta o número): número e nome de perfil de quem escreve e o texto das mensagens trocadas. O histórico da conversa fica cifrado por até 90 dias; durante o processamento, a mensagem passa por uma fila técnica interna.</li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>Prestar o serviço (contas, reservas, equipe, painel), execução de contrato (art. 7º, V).</li>
        <li>Registro de hóspedes e de acompanhantes, inclusive crianças e adolescentes, em nome da pousada, para o cumprimento da obrigação legal de registro dos meios de hospedagem (art. 7º, II, e art. 14), com a autorização marcada por quem preenche a ficha.</li>
        <li>Segurança, prevenção a fraude e trilha de auditoria, legítimo interesse (art. 7º, IX) e exercício regular de direitos.</li>
        <li>Cobrança da assinatura, execução de contrato.</li>
        <li>E-mails de serviço (confirmação de conta, redefinição de senha, convites), execução de contrato.</li>
        <li>Atendimento pelo WhatsApp da pousada, inclusive pelo atendente virtual (consultar vagas e preços, fazer pré-reserva, passar a conversa para a equipe), em nome da pousada, para os procedimentos preliminares do contrato de hospedagem que o hóspede pediu (art. 7º, V). O hóspede pode pedir uma pessoa a qualquer momento escrevendo “atendente”, e parar as mensagens automáticas escrevendo “parar”.</li>
        <li>Medição de audiência e anúncios, no navegador e na conversão enviada pelo servidor, somente com o seu consentimento (art. 7º, I), que pode ser retirado a qualquer momento. Páginas abertas por link com código de acesso (pré-check-in, convite, redefinição de senha, confirmação de e-mail) não carregam esses rastreadores.</li>
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
        <li><strong>Hospedagem e banco de dados</strong>, infraestrutura em servidor contratado pelo Diária.</li>
        <li><strong>Resend</strong>, envio de e-mails do sistema (Estados Unidos).</li>
        <li><strong>Stripe</strong>, processamento de pagamentos da assinatura (Estados Unidos).</li>
        <li><strong>Google</strong>, apenas se você escolher entrar com a conta Google.</li>
        <li><strong>Meta (WhatsApp Business)</strong>, apenas para pousadas que conectam o próprio WhatsApp: entrega das mensagens entre a pousada e o hóspede (Estados Unidos).</li>
        <li><strong>Anthropic</strong>, provedor padrão do atendente virtual, apenas quando a pousada liga o atendente: recebe o texto da conversa, o nome de perfil do WhatsApp, o que o hóspede escrever nela (como nome completo e CPF) e o resultado das consultas de vagas e reservas, para redigir a resposta (Estados Unidos). O uso desses dados pelo provedor segue os termos comerciais dele. O sistema permite trocar de provedor; se isso acontecer, esta lista será atualizada.</li>
        <li><strong>Google Analytics</strong>, medição de audiência, somente com o seu consentimento (Estados Unidos).</li>
        <li><strong>Meta Ads</strong> (Pixel), medição de anúncios, somente com o seu consentimento (Estados Unidos).</li>
        <li><strong>Conversões pelo servidor</strong> (API de Conversões da Meta e Measurement Protocol do Google Analytics), quando uma assinatura é paga e quem criou a conta consentiu com anúncios no cadastro: enviamos o valor, a moeda, o identificador da fatura, os identificadores de clique e de navegador daquela pessoa e, à Meta, o e-mail em hash SHA-256. Dados de hóspedes não entram nesse envio.</li>
        <li><strong>Asaas</strong>, apenas para pousadas que ligam a confirmação automática do Pix: nome e CPF de quem paga, geração e consulta da cobrança do sinal, na conta da própria pousada.</li>
        <li><strong>Sentry</strong>, quando habilitado, recebe relatórios de erro técnico (mensagem, pilha e rota), sem corpo da requisição, cookies nem o endereço completo da página.</li>
      </ul>
      <p>
        <strong>Transferência internacional de dados:</strong> os fornecedores indicados acima como Estados Unidos
        tratam os dados fora do Brasil, e o Sentry também pode tratá-los no exterior. Essa transferência se apoia
        nas hipóteses do art. 33 da LGPD: execução do contrato e dos procedimentos preliminares a ele e, no caso de
        medição e anúncios, o seu consentimento específico.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta: enquanto a conta existir. Após a exclusão, são apagados ou anonimizados, salvo o que a lei obrigue a manter.</li>
        <li>Dados de hóspedes e fichas de pré-check-in: pelo prazo definido pela pousada e pelas obrigações legais aplicáveis a ela. Se a pousada definir um prazo em Configurações, os dados pessoais são anonimizados e a ficha apagada depois dele; sem prazo definido, ficam até que ela os exclua. Ao fim do contrato, são devolvidos ou eliminados conforme instrução da pousada.</li>
        <li>Mensagens do WhatsApp: até 90 dias.</li>
        <li>Registros de acesso e trilha de auditoria: 6 meses, prazo do Marco Civil da Internet, ou mais, quando necessário à segurança.</li>
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
        Usamos cookies essenciais para manter você conectado com segurança. Cookies de medição (Google Analytics)
        ou de anúncios (Meta Ads) só são ativados se você consentir no aviso exibido na primeira visita, e podem
        ser recusados sem prejuízo ao uso do sistema.
      </p>
      <p>
        <PreferenciasDeCookies />
      </p>

      <h2>9. Encarregado e contato</h2>
      <p>
        Encarregado pelo tratamento de dados: {EMPRESA.encarregado}, {EMPRESA.emailPrivacidade}.
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
