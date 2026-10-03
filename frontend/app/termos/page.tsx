import type { Metadata } from "next"
import Link from "next/link"
import { PaginaLegal } from "../../components/legal/PaginaLegal"
import { EMPRESA, VIGENCIA_DOCUMENTOS } from "../../lib/empresa"

export const metadata: Metadata = {
  title: "Termos de uso — Diária",
  description: "Condições de uso do Diária, sistema de gestão de reservas para pousadas.",
}

/** Termos de uso. Texto-base: precisa de revisão jurídica antes de valer como definitivo. */
export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso" vigencia={VIGENCIA_DOCUMENTOS}>
      <p>
        Estes termos regem o uso do Diária, serviço on-line de gestão de reservas para meios de hospedagem,
        oferecido por {EMPRESA.razaoSocial} (CNPJ {EMPRESA.cnpj}). Ao criar uma conta, você concorda com eles e
        com a <Link href="/privacidade" className="underline">Política de privacidade</Link>.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O Diária permite cadastrar pousadas, quartos e reservas, acompanhar a ocupação, convidar a equipe com
        diferentes permissões e exportar os dados. Novos recursos podem ser adicionados e recursos existentes
        podem ser alterados para melhorar o serviço.
      </p>

      <h2>2. Conta e equipe</h2>
      <ul>
        <li>Você é responsável pela veracidade dos dados da conta e pela guarda da sua senha.</li>
        <li>O dono da pousada responde pelos acessos que concede à equipe e pode revogá-los a qualquer momento.</li>
        <li>É proibido usar o serviço para fins ilícitos, tentar acessar dados de outras pousadas ou sobrecarregar o sistema.</li>
      </ul>

      <h2>3. Teste grátis, planos e pagamento</h2>
      <ul>
        <li>Toda pousada nova tem um período de teste gratuito, sem necessidade de cartão.</li>
        <li>Depois do teste, o uso depende de um plano pago, cobrado de forma recorrente (mensal ou anual) pela Stripe.</li>
        <li>Os limites de cada plano (quartos, usuários e propriedades) estão descritos na página de planos.</li>
        <li>Trocas de plano são calculadas proporcionalmente ao período restante.</li>
        <li>Se um pagamento falhar, o acesso continua por alguns dias de tolerância; depois disso, a operação fica pausada até a regularização. Os dados não são apagados por isso.</li>
      </ul>

      <h2>4. Cancelamento</h2>
      <p>
        Não há fidelidade. Você pode cancelar a qualquer momento pela área de assinatura; o acesso continua até o
        fim do período já pago. Antes de encerrar a conta, você pode exportar suas reservas em planilha.
      </p>

      <h2>5. Dados da pousada e dos hóspedes</h2>
      <ul>
        <li>Os dados que você insere são seus. O Diária os trata apenas para prestar o serviço, como operador (LGPD).</li>
        <li>A pousada é responsável por informar aos hóspedes sobre o tratamento dos dados deles e por ter base legal para isso.</li>
        <li>Se a assinatura terminar, os dados continuam guardados e disponíveis para exportação até que você peça a exclusão.</li>
        <li>Ao excluir a pousada (em Configurações), os dados dela e dos hóspedes são eliminados de forma definitiva — exporte antes. Registros de cobrança da assinatura são mantidos pelo prazo exigido em lei.</li>
        <li>A pousada pode definir em quantos meses após a estadia os dados pessoais dos hóspedes são anonimizados automaticamente.</li>
      </ul>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o serviço disponível e os dados protegidos, com cópias de segurança e
        monitoramento, mas não garantimos funcionamento ininterrupto. Paradas programadas serão avisadas sempre
        que possível. A responsabilidade do Diária por danos diretos fica limitada ao valor pago nos 12 meses
        anteriores ao evento, exceto nos casos em que a lei não permite essa limitação.
      </p>

      <h2>7. Alterações destes termos</h2>
      <p>
        Mudanças relevantes serão comunicadas com antecedência por e-mail ou no sistema. Continuar usando o
        serviço após a vigência significa concordar com a nova versão.
      </p>

      <h2>8. Lei e foro</h2>
      <p>
        Estes termos seguem a lei brasileira. Fica eleito o foro de {EMPRESA.foro}, ressalvado o direito do
        consumidor de propor ação no seu domicílio.
      </p>

      <h2>9. Contato</h2>
      <p>{EMPRESA.razaoSocial} — {EMPRESA.endereco} — {EMPRESA.emailContato}</p>
    </PaginaLegal>
  )
}
