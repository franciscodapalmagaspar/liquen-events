/*
 * O documento com que o estúdio abre: o que nasce do pedido, e as fotografias que ele leva.
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`);
 * o componente reexporta o que já exportava, para nenhum chamador mudar.
 */
import type { Quote } from "@/lib/orcamento/types";
import {
  withProposalDefaults,
  totalAmountParaBase,
  normaliseCoverImages,
  DEFAULT_VAT_RATE,
  type VatMode,
} from "@/lib/proposal-doc";
import { dataDoEventoPorExtenso, referenciaDoDocumento } from "@/lib/proposal-doc-textos";
import { linhasDeOrcamento } from "@/lib/orcamento/decoracao";
import { guestRangeLabel, ceremonyTypeLabel, spaceTypeLabel } from "@/lib/orcamento/data";
import { eCasamento, tipoDoEventoDoPedido } from "@/lib/proposal-evento";
import { baseParaOEstudio, type ContextoDoPreco } from "@/lib/preco-do-pedido";

export type StudioDoc = Parameters<typeof withProposalDefaults>[0];

/* ── Os campos que o estúdio semeia a partir do pedido ─────────────────────
 *
 * O tipo, a data e a referência nascem escritos por NÓS, em português — e é
 * exactamente por isso que o gerador do PDF os sabe reescrever na língua do
 * casal quando ninguém lhes mexeu (ver «OS CAMPOS QUE O NOSSO CÓDIGO ESCREVEU»,
 * em `proposal-doc-textos.ts`). Esse reconhecimento é uma COMPARAÇÃO com o que
 * estas três funções produzem: uma cópia local do nome do tipo, dos meses ou da
 * forma da referência divergia um dia da de lá, e a partir desse dia a proposta
 * inglesa voltava a sair com a data em português — sem erro nenhum pelo
 * caminho. Por isso nenhuma delas escreve texto seu: pedem-no a quem o tem. */

/* Nunca «Casamento» por omissão: era o que fazia um pedido «Outro» — um
 * restaurante no Halloween — abrir como um casamento (ver `proposal-evento.ts`). */
function eventTypeLabel(q: Quote): string {
  return tipoDoEventoDoPedido(q);
}

/** yyyy-mm-dd → "12 de setembro de 2026"; passes through anything else. */
function formatEventDate(d?: string): string {
  if (!d) return "";
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(d);
  return iso ? dataDoEventoPorExtenso(iso[0]) : d;
}

export function buildRef(d: StudioDoc): string {
  return referenciaDoDocumento(d);
}

/** "Maria & Zé" a partir dos nomes que o casal deu, ou "" se não deu nenhum.
 *  Com um só nome escrito, devolve esse — meio par continua a ser melhor do que
 *  o nome de quem preencheu o formulário. */
function nomesDoCasal(quote: Quote): string {
  const par = [quote.partnerA, quote.partnerB].map((n) => n?.trim()).filter(Boolean);
  return par.join(" & ");
}

export function initialDoc(quote: Quote): StudioDoc {
  const base: StudioDoc = {
    template: "decoracao",
    ref: "",
    // Se o casal escreveu os dois nomes no pedido, a proposta abre dirigida a
    // ELES. O `quote.name` é de quem escreveu — pode ser a mãe da noiva ou uma
    // planner, e uma proposta endereçada a quem preencheu o formulário em vez
    // de a quem casa lê-se como um erro de quem a mandou.
    clientNames: nomesDoCasal(quote) || (quote.name ?? ""),
    eventType: eventTypeLabel(quote),
    eventDate: formatEventDate(quote.date),
    /**
     * ── O LOCAL LEVA O ESPAÇO ATRÁS ──────────────────────────────────────────
     *
     * «Quero que o sistema coloque logo isto no back office, nos espaços a
     * fazer a proposta.» Fui contar o que o pedido responde contra o que a
     * proposta recebia: das sete respostas, SEIS já chegavam sozinhas — o
     * casal, a data, os convidados, o local, a cerimónia, e os pontos de
     * decoração, que viram as linhas do orçamento.
     *
     * Faltava o ESPAÇO. O casal responde «Exterior», «Interior» ou «Interior e
     * exterior», e essa resposta morria no pedido: quem escrevia a proposta
     * tinha de voltar lá para se lembrar se era ao ar livre.
     *
     * Vai junto ao local, com um ponto a separar — «Setúbal Alentejo ·
     * Exterior» — e não num campo novo. Uma linha a mais no documento do casal
     * é uma decisão sobre o papel que sai; um local mais completo é a mesma
     * linha a dizer mais. E o casal, ao ler, vê que percebemos o que respondeu.
     *
     * Como tudo o resto aqui, é uma SEMENTE: o campo continua editável, e o
     * local da proposta acaba quase sempre mais preciso do que o do pedido
     * («Herdade da Malhadinha» em vez de «Alentejo»). Quando ela o reescrever,
     * reescreve a linha inteira, que é o que já fazia.
     *
     * Sem espaço respondido, fica só o local — nunca um ponto pendurado no fim.
     */
    location: [quote.location ?? "", spaceTypeLabel(quote.spaceType)]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" · "),
    // Sem número exacto, vale a ordem de grandeza que o casal deu ("100 a 150").
    // Escrever "0 pax" era pior do que não escrever nada.
    guests: quote.guests ? `${quote.guests} pax` : guestRangeLabel(quote.guestsRange),
    // A cerimónia que o casal escolheu no pedido, já escrita no documento.
    // O campo existe desde sempre («Civil, simbólica») e abria vazio, para ela
    // preencher à mão a partir do que estivesse no pedido — que era exactamente
    // onde a resposta se perdia. Continua editável: isto é uma semente, não uma
    // trave, e um casal que muda de ideias muda-se aqui.
    //
    // Em português mesmo quando o pedido veio em inglês: o documento do estúdio
    // é escrito em português.
    // Só num casamento: «Cerimónia» numa proposta para um restaurante é um
    // campo de outro evento.
    ceremony: eCasamento(eventTypeLabel(quote)) ? ceremonyTypeLabel(quote.ceremonyType) : "",
    time: "",
    serviceGroups: [],
    moodBoards: [],
    cronograma: [],
    budgetItems: [],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: normaliseCoverImages(),
  };
  base.ref = buildRef(base);
  return base;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO DO PEDIDO NÃO É O NÚMERO QUE ELA ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com «estes valores somam-se», estes dois números são DIFERENTES:
 *
 *   · o que ela escreve em «Valor (sem IVA)» — só os serviços;
 *   · o «Preço final (sem IVA)» do pedido — o que o casal paga, ou seja os
 *     serviços MAIS os adicionais. É de lá que a Visão Geral, as Estatísticas
 *     e o dossier leem o dinheiro, e guardar lá só os serviços fazia as
 *     deslocações desaparecerem desses ecrãs em silêncio.
 *
 * Há portanto duas conversões, inversas uma da outra:
 *
 *   escrito → pedido   soma os adicionais   (`baseDoEcraParaOPedido`)
 *   pedido  → escrito  tira-os              (esta)
 *
 * ── O DEFEITO QUE ISTO VEIO FECHAR ────────────────────────────────────────
 *
 * Palavras dela: «ao voltar à mesma proposta, o valor total está diferente».
 * Numa proposta observada: 3.000 → 3.140 → 3.280 → 3.420, com uma deslocação
 * de 140 €. Três visitas, três somas.
 *
 * A causa era esta função existir e NÃO ser usada na abertura. A montagem
 * fazia `setTotalInput(textoDoTotal(quote.quotedPrice))` — punha no campo do
 * ESCRITO um número que já trazia os adicionais lá dentro. A partir daí tudo
 * o que lesse esse campo como «os serviços» voltava a somar-lhes a deslocação:
 * a gravação seguinte punha 3.140 + 140 no pedido, e a visita seguinte
 * começava daí.
 *
 * Vive no topo do módulo, e não dentro do componente, por causa disso mesmo:
 * era uma função interna que dois caminhos deviam usar e só um usava. Aqui
 * fora, os dois vêem-na e o teste também.
 */
/**
 * A conta vive agora em `lib/preco-do-pedido`, ao lado da sua INVERSA.
 *
 * Estavam separadas — a ida aqui, a volta dentro do componente — e nada as
 * obrigava a concordar. Quando não concordam, o preço da proposta desloca-se a
 * cada abertura, e a deslocação acumula: 3.000 → 3.140 → 3.280 → 3.420, com
 * uma deslocação de 140 €. O que estava errado não era a conta; era haver duas.
 *
 * E devolve `null` — não zero — quando o preço do pedido é MENOR do que os
 * adicionais escritos. Zero era uma mentira com consequências: a volta mandava
 * 0 + 140 = 140 € para o pedido, e um pedido de 100 € passava a 140 € sem
 * ninguém lhe ter tocado. Ver o cabeçalho de lá.
 */
export function baseDoPedidoParaOEcra(base: number, d: StudioDoc): number | null {
  return baseParaOEstudio(base, d as unknown as ContextoDoPreco);
}

/** Numa proposta nova/vazia, semeia um grupo de serviços com um item — para que
 *  o estúdio não abra como uma parede de botões "+ Adicionar" vazios. Nunca
 *  toca num rascunho que já tenha conteúdo. */

export function seedDefaults(d: StudioDoc, quote: Quote): StudioDoc {
  const quotedPrice = quote.quotedPrice;
  // O que o casal marcou no pedido de orçamento. É a razão de ser desta
  // funcionalidade: a proposta da Catarina Martins saiu com cinco pontos, ela
  // pediu para refazer com três, e o trabalho teve de ser todo repetido. Se o
  // casal já disse o que quer, a proposta abre com esses pontos e mais nenhum.
  const linhas = linhasDeOrcamento(quote.decorPoints ?? []);
  let next = d;
  if (next.serviceGroups.length === 0) {
    next = {
      ...next,
      serviceGroups: [
        linhas.length > 0
          ? {
              letter: "a)",
              title: "Decoração Floral e Decoração",
              items: linhas.map((label) => ({ label, desc: "" })),
            }
          : { letter: "a)", title: "", items: [{ label: "", desc: "" }] },
      ],
    };
  }
  // O quadro "3. Orçamento Proposto" com as mesmas linhas. Sem preços: o valor
  // continua a ser um só, no total, tal como nas propostas dela.
  if (next.budgetItems.length === 0 && linhas.length > 0) {
    next = { ...next, budgetItems: [...linhas] };
  }
  /**
   * ── OS ADICIONAIS SOMAM, NAS PROPOSTAS NOVAS ─────────────────────────────
   *
   * Palavras dela, a olhar para o quadro que dizia «Subtotal 2.860 +
   * Deslocação 140 = Total 3.000»: «não quero que a parte dos serviços apareça
   * como base somada à deslocação; quero que seja três mil mais a deslocação da
   * equipa, que dá três mil e cento e quarenta».
   *
   * O selector por proposta continua a existir, e continua a poder ser mudado
   * nos dois sentidos. O que muda é o lado para que ele nasce virado, porque
   * ter de o trocar em cada proposta transforma a decisão dela num passo que se
   * esquece — e um passo esquecido aqui é uma deslocação que a casa não cobra.
   *
   * ── E AS PROPOSTAS QUE JÁ EXISTEM ────────────────────────────────────────
   * Não mudam. Isto só escreve quando o campo AINDA NÃO EXISTE no documento, e
   * o `seedDefaults` só corre quando não há rascunho gravado. Uma proposta já
   * enviada continua a ler-se exactamente como o casal a recebeu, e um rascunho
   * a meio mantém a regra com que nasceu — quem a quiser mudar tem o selector.
   */
  if (next.budgetExtrasSomam === undefined) {
    next = { ...next, budgetExtrasSomam: true };
  }
  // O valor vem do "Preço final (sem IVA)" do pedido, e é o mesmo número —
  // não há aqui um segundo. A condição `== null` que aqui estava era a origem
  // do defeito: uma vez semeado, o estúdio deixava de acompanhar o pedido e os
  // dois números separavam-se em silêncio. Agora semeia-se SEMPRE, e o efeito
  // de sincronização trata das alterações posteriores.
  if (typeof quotedPrice === "number" && quotedPrice > 0) {
    // `totalAmount` NÃO é o preço do pedido: é a base em «acrescer» e o BRUTO
    // em «IVA incluído». Escrever aqui o líquido cru fazia uma proposta já em
    // «IVA incluído» perder 23% em silêncio — o número do pedido passava a ser
    // lido como se já trouxesse o imposto dentro.
    const modo: VatMode = next.totalVatMode ?? "acrescer";
    // Pela mesma razão da abertura: o preço do pedido traz os adicionais lá
    // dentro e este campo significa só os serviços. Num pedido virgem não há
    // adicionais e a conversão não faz nada — mas um pedido cujo rascunho foi
    // limpo TEM preço com adicionais somados, e sem isto voltava a nascer
    // inflacionado.
    const escrito = baseDoPedidoParaOEcra(quotedPrice, next);
    // `null` = a conta não dá (o preço do pedido é menor do que os adicionais).
    // Deixa-se o documento como está: o aviso de desalinhamento já diz o que se
    // passa, e inventar um zero aqui fazia o preço do PEDIDO subir na gravação
    // seguinte.
    if (escrito != null) {
      next = {
        ...next,
        totalAmount: totalAmountParaBase(escrito, modo, next.vatRate ?? DEFAULT_VAT_RATE),
        totalVatMode: modo,
      };
    }
  }
  return next;
}

/**
 * Reescreve TODAS as posições de foto do documento (capas + mood boards) com
 * `f`, que devolve o caminho novo ou `null` para a foto sair.
 *
 * Um só sítio a andar por dentro do documento à procura de fotos, porque as
 * duas operações do estado provisório — trocar o marcador pelo caminho
 * definitivo e tirar o marcador que ficou sem foto — têm de tratar os DOIS
 * sítios da mesma maneira, e falhar um deles deixaria um `pending:` para trás.
 *
 * Numa capa, "sair" é ficar `""` e NÃO encolher o array: é a posição que decide
 * o lado onde a foto é impressa. Num mood board é ordem, e sai mesmo.
 *
 * Devolve o mesmo objeto quando nada muda — uma entrega que já não encontra o
 * seu lugar (a foto foi removida à mão entretanto) não pode marcar o rascunho
 * como alterado.
 */
export function mapImagePaths(d: StudioDoc, f: (path: string) => string | null): StudioDoc {
  let changed = false;
  const cover = normaliseCoverImages(d.coverImages).map((p) => {
    if (!p) return p;
    const next = f(p);
    if (next === p) return p;
    changed = true;
    return next ?? "";
  });
  const boards = d.moodBoards.map((b) => {
    let touched = false;
    const images: string[] = [];
    for (const p of b.images) {
      const next = f(p);
      if (next !== p) touched = true;
      if (next !== null) images.push(next);
    }
    if (!touched) return b;
    changed = true;
    return { ...b, images };
  });
  // As que ela escolheu para as páginas do PDF (`fotosDasPaginas`): como num
  // mood board, a que sai deixa a página com menos uma (e, sem nenhuma, a
  // página volta a escolher sozinha).
  let paginas = d.fotosDasPaginas;
  if (paginas) {
    const novas: NonNullable<StudioDoc["fotosDasPaginas"]> = {};
    for (const [chave, e] of Object.entries(paginas)) {
      const fotos: string[] = [];
      const focos: ({ x: number; y: number } | null)[] = [];
      let mexeu = false;
      e.fotos.forEach((p, k) => {
        const next = f(p);
        if (next !== p) mexeu = true;
        if (next !== null) {
          fotos.push(next);
          focos.push(e.focos?.[k] ?? null);
        }
      });
      if (mexeu) changed = true;
      if (fotos.length) novas[chave] = mexeu ? { fotos, ...(e.focos ? { focos } : {}) } : e;
    }
    paginas = novas;
  }
  return changed ? { ...d, coverImages: cover, moodBoards: boards, fotosDasPaginas: paginas } : d;
}
