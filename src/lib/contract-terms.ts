/**
 * Termos & Condições padrão da Líquen Events — texto do "contrato" que o cliente
 * aceita ao confirmar uma proposta pelo link público.
 *
 * Client-safe DE PROPÓSITO: NÃO importa `server-only` nem o store. O componente
 * de resposta ("use client") value-importa `DEFAULT_TERMS` para os mostrar, e o
 * endpoint do servidor usa `termsToPlainText` para congelar um snapshot no
 * momento da aceitação. Sempre que o texto mudar de forma materialmente
 * relevante, incremente `TERMS_VERSION` — as aceitações antigas guardam a versão
 * e o snapshot que viram, por isso ficam intactas.
 */

import { SINAL_POR_OMISSAO } from "./money";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * Versão dos termos. Incrementar quando o texto muda de forma relevante.
 *
 * 2026-08 — o ponto 3 passou a dizer sobre QUE valor o sinal é calculado. Ver
 * a nota do ponto 3: o texto anterior deixava a pergunta em aberto e a resposta
 * que o livro dava (o total COM IVA) era a mais cara das duas.
 */
export const TERMS_VERSION = "2026-08";

export interface TermsSection {
  heading: string;
  body: string;
}

/**
 * Boilerplate profissional para um estúdio de decoração de eventos premium
 * (Líquen Events, Portugal). Conciso mas completo — pensado para ser
 * lido, não para intimidar.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TERMOS PARA UMA DADA PERCENTAGEM DE SINAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O sinal é editável por proposta (`depositPercent`, no estúdio), e o produto
 * inteiro já o respeita: o faseamento do PDF, o livro de facturas, o painel de
 * pagamentos, o portal do cliente e o estúdio leem todos `depositPercentOf`.
 * Estes termos eram o que faltava — diziam «30%» à letra, em duas frases, e é
 * ESTE o documento que o casal aceita ao carregar no botão.
 *
 * Numa proposta a 50%, o casal lia e aceitava um contrato a dizer 30% e recebia
 * a seguir uma factura de 50%: num evento de 12.300 €, 3.690 € escritos contra
 * 6.150 € cobrados. O contrato é a folha que ganha uma discussão, e era a que
 * estava errada.
 *
 * ── O QUE NÃO SE PARAMETRIZA ─────────────────────────────────────────────
 * O «70%» do ponto 4 NÃO é o saldo: é a indemnização por cancelamento tardio
 * («o Estúdio tem direito a receber 70% do valor total estipulado»). É um
 * número de outra natureza, negociado com o advogado dela, e não acompanha o
 * sinal. Fica exactamente onde estava — que é a razão de este ficheiro compor
 * as frases à mão em vez de correr um `replace` por «30%».
 */
export function termosPara(
  percentagemDoSinal: number = SINAL_POR_OMISSAO,
  idioma: IdiomaDaProposta = "pt",
): TermsSection[] {
  const sinal = Math.round(Math.min(99, Math.max(1, percentagemDoSinal)));
  const saldo = 100 - sinal;
  const en = idioma === "en";
  return (en ? DEFAULT_TERMS_EN : DEFAULT_TERMS).map((s) => {
    if (s.heading.startsWith("3.")) {
      return {
        ...s,
        body: en
          ? `The date is confirmed as reserved upon payment of a deposit of ${sinal}% of the amount payable — the final proposal figure, VAT included — due when the proposal is accepted. The remaining ${saldo}%, calculated on the same basis, is settled up to 1 month before the event date. Failure to settle the balance within that period may lead to the suspension of preparations, without prejudice to the amounts already paid.`
          : `A reserva da data fica confirmada com o pagamento de um sinal de ${sinal}% do total a pagar — o valor final da proposta, com IVA incluído —, devido no momento da aceitação da proposta. O restante ${saldo}%, calculado sobre a mesma base, é liquidado até 1 mês antes da data do evento. A não liquidação do saldo dentro do prazo poderá implicar a suspensão dos preparativos, sem prejuízo dos valores já pagos.`,
      };
    }
    if (s.heading.startsWith("4.")) {
      return {
        ...s,
        body: en
          ? s.body.replace("The 30% deposit is intended", `The ${sinal}% deposit is intended`)
          : s.body.replace("O sinal de 30% destina-se", `O sinal de ${sinal}% destina-se`),
      };
    }
    return s;
  });
}

export const DEFAULT_TERMS: TermsSection[] = [
  {
    heading: "1. Objeto",
    body: "Estas condições regem a prestação de serviços de conceção, produção e montagem de decoração de eventos pela Líquen Events (“Estúdio”) ao cliente identificado na proposta associada. A proposta aceite — com os seus itens, quantidades e valores — é parte integrante deste contrato.",
  },
  {
    heading: "2. Orçamento e validade",
    body: "Aos valores apresentados acresce o IVA à taxa legal em vigor. Os valores mantêm-se válidos até à data de validade indicada na proposta. Após essa data, o Estúdio poderá rever preços em função da disponibilidade de materiais e fornecedores. Alterações de âmbito solicitadas pelo cliente podem originar um ajuste de orçamento, sempre acordado por escrito antes da execução.",
  },
  {
    /**
     * ── SOBRE QUE VALOR É O SINAL ──────────────────────────────────────────
     *
     * Este ponto dizia «um sinal de 30% do valor total» e mais nada. Duas
     * linhas acima, o ponto 2 diz que «aos valores apresentados acresce o
     * IVA» — de modo que «valor total» tanto podia ser a base como o valor com
     * IVA, e as duas leituras dão números diferentes: numa proposta de
     * 2.460,00 € + IVA, 738,00 € ou 907,74 €.
     *
     * O sistema sempre emitiu a factura do sinal sobre o valor COM IVA
     * (`splitSinal(proposal.total, …)`, e `Proposal.total` é o bruto — ver
     * `resolveProposalMoney`). O contrato é que não o dizia, e era o contrato
     * que o casal assinava. Fica dito, com a mesma palavra que o PDF da
     * proposta usa no faseamento («total a pagar»), para as duas folhas se
     * lerem uma à outra.
     */
    heading: "3. Pagamento",
    body: "A reserva da data fica confirmada com o pagamento de um sinal de 30% do total a pagar — o valor final da proposta, com IVA incluído —, devido no momento da aceitação da proposta. O restante 70%, calculado sobre a mesma base, é liquidado até 1 mês antes da data do evento. A não liquidação do saldo dentro do prazo poderá implicar a suspensão dos preparativos, sem prejuízo dos valores já pagos.",
  },
  {
    heading: "4. Cancelamento e alterações",
    body: "O sinal de 30% destina-se a garantir a reserva da data e não é reembolsável em caso de cancelamento por parte do cliente. Em caso de cancelamento efetuado entre o 30.º dia anterior e até às 14h do 8.º dia útil anterior à data do evento, o Estúdio tem direito a receber 70% do valor total estipulado, acrescido de IVA; após esse momento, tem direito ao valor total estipulado, acrescido de IVA. A denúncia só é válida se efetuada por escrito, por email, valendo a data e a hora de receção do mesmo. Alterações de data ficam sujeitas à disponibilidade do Estúdio e à confirmação dos fornecedores envolvidos.",
  },
  {
    heading: "5. Responsabilidades das partes",
    body: "O Estúdio compromete-se a executar a decoração com o cuidado e o padrão de qualidade acordados, cumprindo os prazos de montagem e desmontagem combinados. O cliente compromete-se a garantir o acesso atempado ao espaço, as condições necessárias à montagem e o cumprimento das normas do local. O Estúdio não se responsabiliza por atrasos ou impedimentos imputáveis ao espaço, a terceiros ou ao próprio cliente.",
  },
  {
    heading: "6. Materiais e adereços",
    body: "Salvo indicação expressa em contrário, todos os materiais, estruturas e adereços utilizados são propriedade da Líquen Events e são cedidos apenas em regime de aluguer para o evento. Danos, extravios ou perdas causados a estes bens durante o período de cedência são da responsabilidade do cliente, sendo faturados ao valor de reposição.",
  },
  {
    heading: "7. Força maior",
    body: "Nenhuma das partes será responsável pelo incumprimento resultante de circunstâncias imprevisíveis e alheias à sua vontade (fenómenos naturais, restrições legais, indisponibilidade grave de fornecedores, entre outras). Nessas situações, as partes procurarão de boa-fé reagendar o evento ou encontrar uma solução equitativa.",
  },
  {
    heading: "8. Proteção de dados (RGPD)",
    body: "Os dados pessoais do cliente são tratados exclusivamente para a gestão da proposta, do evento e das obrigações legais e fiscais associadas, ao abrigo do Regulamento Geral sobre a Proteção de Dados. Não são cedidos a terceiros para fins de marketing. O cliente pode exercer os direitos de acesso, retificação e eliminação contactando o Estúdio.",
  },
  {
    heading: "9. Foro",
    body: "Estas condições regem-se pela lei portuguesa. Para a resolução de qualquer litígio emergente deste contrato, e não sendo possível um acordo amigável, as partes recorrem ao Centro de Arbitragem de Conflitos de Consumo de Lisboa.",
  },
];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MESMOS TERMOS EM INGLÊS — COM O PORTUGUÊS A MANDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «o contrato quer que exista também em inglês». A proposta, o
 * email, o portal e o PDF já eram bilingues; os Termos & Condições eram a
 * única peça que não. Um casal estrangeiro aceitava um documento legal que não
 * lia — e é a folha que ganha uma discussão.
 *
 * ── A REGRA QUE TORNA ISTO SEGURO: A VERSÃO PORTUGUESA PREVALECE ──────────
 *
 * Estes termos foram escritos em português, com o advogado dela, e há números
 * neles que foram negociados (o 70% do ponto 4, os prazos do cancelamento).
 * Uma tradução é sempre uma leitura, e numa divergência a leitura que vale tem
 * de ser UMA — senão o contrato tem duas respostas para a mesma pergunta, que
 * é o pior sítio possível para uma ambiguidade.
 *
 * Por isso o ponto 9 inglês diz, com todas as letras, que o texto português
 * prevalece. É a cláusula normal em contratos bilingues, e é o que permite
 * traduzir sem transformar a tradução num segundo contrato.
 *
 * ⚠ ISTO NÃO É UMA TRADUÇÃO JURAMENTADA. É uma tradução fiel feita por quem
 * escreve este software, e vale a pena ser lida por quem redigiu o original
 * antes de sair para o primeiro casal estrangeiro. O que a torna aceitável
 * hoje é exactamente a cláusula de prevalência.
 *
 * ── OS NÚMEROS DOS PONTOS SÃO OS MESMOS NAS DUAS LÍNGUAS ─────────────────
 *
 * De propósito, e não por simetria: o resto do produto fala de «ponto 3» e
 * «ponto 4» (o sinal, o cancelamento), e o `termosPara` faz a substituição da
 * percentagem por `heading.startsWith("3.")`. Uma numeração diferente em
 * inglês partia a substituição em silêncio — e o contrato inglês saía a dizer
 * 30% numa proposta a 50%.
 */
export const DEFAULT_TERMS_EN: TermsSection[] = [
  {
    heading: "1. Scope",
    body: "These conditions govern the provision of event decoration design, production and installation services by Líquen Events (the “Studio”) to the client identified in the associated proposal. The accepted proposal — with its items, quantities and amounts — forms an integral part of this contract.",
  },
  {
    heading: "2. Quotation and validity",
    body: "VAT at the legal rate in force is added to the amounts presented. The amounts remain valid until the validity date stated in the proposal. After that date, the Studio may review prices in line with the availability of materials and suppliers. Changes of scope requested by the client may give rise to an adjustment of the quotation, always agreed in writing before execution.",
  },
  {
    /**
     * O ponto 3 é composto pelo `termosPara` nas duas línguas — o corpo que
     * aqui está é o de {@link SINAL_POR_OMISSAO}, e serve de recurso para quem
     * leia a lista crua. Ver a nota no ponto 3 português sobre QUE valor é o
     * sinal: «the amount payable, VAT included» é a mesma frase que o
     * faseamento do PDF usa, e é o que o sistema sempre facturou.
     */
    heading: "3. Payment",
    body: "The date is confirmed as reserved upon payment of a deposit of 30% of the amount payable — the final proposal figure, VAT included — due when the proposal is accepted. The remaining 70%, calculated on the same basis, is settled up to 1 month before the event date. Failure to settle the balance within that period may lead to the suspension of preparations, without prejudice to the amounts already paid.",
  },
  {
    /**
     * O «70%» desta secção NÃO é o saldo: é a indemnização por cancelamento
     * tardio, negociada com o advogado dela, e não acompanha o sinal. Ver a
     * nota igual no `termosPara`.
     */
    heading: "4. Cancellation and changes",
    body: "The 30% deposit is intended to secure the reservation of the date and is non-refundable in the event of cancellation by the client. Where cancellation is made between the 30th day before the event and up to 2 p.m. on the 8th working day before the event date, the Studio is entitled to receive 70% of the total amount stipulated, plus VAT; after that moment, it is entitled to the full amount stipulated, plus VAT. Notice of termination is only valid if given in writing, by email, the date and time of receipt being the ones that count. Changes of date are subject to the Studio’s availability and to confirmation by the suppliers involved.",
  },
  {
    heading: "5. Responsibilities of the parties",
    body: "The Studio undertakes to carry out the decoration with the care and standard of quality agreed, meeting the installation and removal times agreed. The client undertakes to ensure timely access to the venue, the conditions necessary for installation, and compliance with the venue’s rules. The Studio is not liable for delays or impediments attributable to the venue, to third parties, or to the client.",
  },
  {
    heading: "6. Materials and props",
    body: "Unless expressly stated otherwise, all materials, structures and props used are the property of Líquen Events and are provided on a rental basis for the event only. Damage to, or loss of, these goods during the rental period is the responsibility of the client and is invoiced at replacement value.",
  },
  {
    heading: "7. Force majeure",
    body: "Neither party shall be liable for failure to perform arising from unforeseeable circumstances beyond its control (natural events, legal restrictions, serious unavailability of suppliers, among others). In such situations, the parties shall seek in good faith to reschedule the event or to find an equitable solution.",
  },
  {
    heading: "8. Data protection (GDPR)",
    body: "The client’s personal data is processed exclusively for the management of the proposal, the event and the associated legal and tax obligations, under the General Data Protection Regulation. It is not passed to third parties for marketing purposes. The client may exercise the rights of access, rectification and erasure by contacting the Studio.",
  },
  {
    /**
     * A CLÁUSULA QUE TORNA A TRADUÇÃO SEGURA. Ver o cabeçalho deste bloco: sem
     * ela, o contrato passava a ter duas respostas para a mesma pergunta.
     */
    heading: "9. Governing law and jurisdiction",
    body: "These conditions are governed by Portuguese law. For the resolution of any dispute arising from this contract, and where an amicable agreement is not possible, the parties shall refer the matter to the Lisbon Consumer Dispute Arbitration Centre (Centro de Arbitragem de Conflitos de Consumo de Lisboa). These conditions were drawn up in Portuguese and this English text is a translation provided for convenience: in the event of any divergence between the two versions, the Portuguese version prevails.",
  },
];

/**
 * Serializa as secções num texto simples estável — usado como snapshot imutável
 * do que o cliente aceitou (guardado em `Contract.termsSnapshot`). Formato:
 * cabeçalho, corpo, linha em branco entre secções.
 */
export function termsToPlainText(sections: TermsSection[] = DEFAULT_TERMS): string {
  return sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n");
}
