"use client";
import { useRef, useState } from "react";
import {
  resolveProposalMoney,
  totalAmountParaBase,
  detectVatMode,
  parseMoneyText,
  DEFAULT_VAT_RATE,
  type VatMode,
} from "@/lib/proposal-doc";
import { depositPercentOf } from "@/lib/proposal-doc";
import type { ProposalDoc } from "@/lib/proposal-doc";
import {
  desalinhamento,
  totaisDaProposta,
  dinheiroDaProposta,
  asDuasFormas,
} from "@/lib/proposal-budget";
import { eur, SINAL_POR_OMISSAO } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { precoDoPedidoParaBase, type ContextoDoPreco } from "@/lib/preco-do-pedido";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { mandarPrecoAoPedido } from "@/lib/orcamento/estudio/gravar";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaTotalDaProposta {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  onQuoteUpdated: ((quote: Quote) => void) | undefined;
  quote: Quote;
}

export function useTotalDaProposta({ documento, onQuoteUpdated, quote }: EntradaTotalDaProposta) {
  const { camposTocados, doc, patch } = documento;
  /**
   * O preço da proposta que não chegou ao pedido — ver `mandarPrecoAoPedido`.
   * `null` é o normal: ou nunca falhou, ou a última tentativa passou.
   */
  const [precoPorChegar, setPrecoPorChegar] = useState<{
    base: number | null;
    porque?: string;
    valeTentarDeNovo: boolean;
  } | null>(null);
  const [precoAGravar, setPrecoAGravar] = useState(false);
  // Free-typed mirror of the structured total, so pt-PT formatting ("3.000,00")
  // survives keystrokes. Parsed into `doc.totalAmount` (the money source of truth).
  const [totalInput, setTotalInput] = useState<string>("");
  /** Porque é que o que está escrito no «Valor (sem IVA)» não conta — ver
   *  `onTotalInput`. */
  const [erroDoTotal, setErroDoTotal] = useState<string | null>(null);
  /** O que está escrito na caixa do sinal enquanto não é uma percentagem
   *  válida (achado n.º 17) — `null` mostra a do documento. */
  const [sinalEscrito, setSinalEscrito] = useState<string | null>(null);
  /** A percentagem do sinal quando ela entrou na caixa — é para lá que se volta
   *  se o que escrever deixar de ser válido. */
  const sinalAntes = useRef(SINAL_POR_OMISSAO);

  // ── Total estruturado + IVA ──
  // O modo efetivo: explícito no doc, senão detetado a partir do texto livre
  // (retrocompatibilidade com propostas antigas só com "3.000,00 € + IVA").
  /**
   * ── E UM DOCUMENTO NOVO NASCE EM «ACRESCE» ────────────────────────────
   *
   * O `detectVatMode` devolve "incluido" quando não há texto nenhum para ler —
   * é a retrocompatibilidade com propostas antigas só com «3.000,00 €». Mas um
   * documento ACABADO DE COMEÇAR também não tem texto, e caía nessa mesma
   * porta: nascia em «IVA incluído», que é o modo que a casa deixou de usar.
   *
   * A detecção fica onde serve — havendo texto livre, é ele que manda.
   */
  const vatMode: VatMode =
    doc.totalVatMode ??
    (doc.totalText || doc.totalEstimatedText
      ? detectVatMode(doc.totalText || doc.totalEstimatedText)
      : "acrescer");

  /** Compõe o texto de DISPLAY do PDF a partir do valor + modo estruturados,
   *  no formato do estúdio ("3.000,00 € + IVA" ou "3.000,00 €"). */
  function composeTotalText(amount: number | undefined, mode: VatMode): string {
    if (amount == null || !(amount > 0)) return "";
    return mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  }

  /** Escreve o valor + modo estruturados e sincroniza o texto de display do
   *  template ativo (totalText p/ Decoração, totalEstimatedText p/ Organização). */
  function writeTotal(amount: number | undefined, mode: VatMode) {
    const text = composeTotalText(amount, mode);
    patch(
      doc.template === "organizacao"
        ? { totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { totalAmount: amount, totalVatMode: mode, totalText: text },
    );
  }

  /**
   * O VALOR É UM SÓ, e é o "Preço final (sem IVA)" do pedido.
   *
   * ── O que estava errado ─────────────────────────────────────────────────
   * Havia duas caixas com o mesmo número: aqui e na Gestão do pedido. Pior do
   * que duplicado — podiam DISCORDAR. O estúdio só copiava o preço do pedido
   * quando ainda não havia rascunho (ver `seedDefaults`), e a partir daí
   * alterar o preço na Gestão do pedido não mexia aqui. O PDF seguia para o
   * cliente com o valor antigo, e nada no ecrã o dizia.
   *
   * Agora escrever aqui GRAVA no pedido, e uma alteração feita na Gestão do
   * pedido aparece aqui. É o mesmo número, visto de dois sítios.
   *
   * ── E o IVA ─────────────────────────────────────────────────────────────
   * O número partilhado é sempre a BASE, sem IVA — é o que o pedido diz que é.
   * O modo de IVA muda o que o PDF MOSTRA (e portanto o que o cliente paga),
   * e o `totalAmount` do documento é derivado da base: em "acrescer" é a
   * própria base, em "incluído" é a base já com o IVA somado, porque é assim
   * que `resolveProposalMoney` o lê. Em qualquer dos modos a base continua a
   * ser o número do pedido, que é o que o rótulo "(sem IVA)" promete.
   */
  function amountParaBase(base: number, mode: VatMode): number {
    return totalAmountParaBase(base, mode, money.vatRate);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CAMPO DO ESTÚDIO E O PREÇO DO PEDIDO PODEM NÃO SER O MESMO NÚMERO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Enquanto os adicionais estavam DENTRO do valor escrito, eram o mesmo: ela
   * escrevia 3.000, o pedido guardava 3.000, e a deslocação saía de lá de
   * dentro.
   *
   * Com «estas linhas somam-se», o campo passa a ser SÓ os serviços e o que o
   * casal paga é serviços mais adicionais. O «Preço final (sem IVA)» do pedido
   * tem de continuar a ser o que o casal paga sem IVA — é dele que a Visão
   * Geral, as Estatísticas e o dossier leem o dinheiro dos pedidos que ainda
   * não têm proposta enviada. Guardar lá só os serviços fazia as deslocações
   * DESAPARECEREM desses ecrãs, sem ninguém dar por isso.
   *
   * Por isso há duas conversões, e são inversas uma da outra:
   *   escrito -> pedido   soma os adicionais
   *   pedido  -> escrito  tira-os
   *
   * Quando os adicionais estão dentro do valor, as duas não fazem nada, e o
   * comportamento é exactamente o de sempre.
   */
  /**
   * A INVERSA da de cima, e vive no mesmo ficheiro que ela — ver
   * `lib/preco-do-pedido`.
   *
   * ── O DOCUMENTO É UM ARGUMENTO, E TEM DE SER ────────────────────────────
   *
   * Lia `doc` da closure, e havia três chamadores em que `doc` é precisamente
   * o documento ERRADO: repor uma versão, copiar uma proposta e anular uma
   * limpeza trocam o documento inteiro com um `setDoc` e chamam isto na linha
   * a seguir — quando `doc` ainda é o que se acabou de substituir. Os
   * adicionais somados eram os do documento ANTIGO.
   *
   * Repor a versão que seguiu para o cliente é o caso que dói: a versão traz
   * 1.490,00 € de adicionais, o rascunho no ecrã tinha 895,00 €, e o pedido
   * ficava a 595,00 € de distância do que o casal recebeu — sem nada no ecrã
   * a dizê-lo, e à espera da abertura seguinte para o mostrar.
   */
  function baseDoEcraParaOPedido(base: number, deQue: StudioDoc = doc): number {
    return precoDoPedidoParaBase(base, deQue as unknown as ContextoDoPreco);
  }

  /** O que se grava no pedido, com a mão travada: escrever "3000" são quatro
   *  teclas e não podem ser quatro gravações. */
  const gravarPreco = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O último valor que ESTE ecrã mandou gravar — para a resposta que volta do
   *  servidor não disparar outra vez a sincronização e entrar em ciclo. */
  const precoEnviado = useRef<number | undefined>(quote.quotedPrice);
  /**
   * ── E O QUE CHEGOU NO `quote`, QUE É COISA DIFERENTE ────────────────────
   *
   * O `precoEnviado` diz o que daqui SAIU; este diz o que de lá VEIO. Eram o
   * mesmo ref, e a sincronização de baixo usava-o como detector de mudança do
   * `quote.quotedPrice` — o que quer dizer que quem lhe MEXESSE fabricava uma
   * mudança que nunca houve.
   *
   * E passou a haver quem lhe mexesse: o ramo do «o pedido ainda não tem
   * preço» adopta o valor do rascunho e chama `persistirPreco`, que marca
   * 3.250 como enviado. O PATCH só volta 600 ms depois, portanto a
   * sincronização corre na montagem com `quotedPrice` ainda por preencher, lê
   * `undefined ≠ 3.250`, conclui que o preço foi APAGADO na Gestão do pedido —
   * e limpava o total do ecrã. Medido: o campo ficava em branco até a resposta
   * chegar, e se a rede estivesse em baixo ficava em branco e era assim que o
   * rascunho gravava. O valor dela desaparecia por não haver rede.
   *
   * Com os dois separados, a pergunta que a sincronização faz volta a ser a
   * certa: «o número que veio é diferente do último que veio?». Na montagem
   * não é — a hidratação já aplicou o que havia a aplicar.
   */
  const doPedidoVisto = useRef<number | undefined>(quote.quotedPrice);

  function persistirPreco(
    escrito: number | undefined,
    opcoes?: {
      /** O número já é o que o casal paga: não se lhe somam adicionais nenhuns. */
      jaEfectivo?: boolean;
      /** Contra que documento se faz a conversão. Ver `baseDoEcraParaOPedido`:
       *  quem acabou de trocar o documento tem de o dizer, senão a soma é feita
       *  com os adicionais do que já lá não está. */
      doc?: StudioDoc;
    },
  ) {
    const base =
      escrito == null || opcoes?.jaEfectivo
        ? escrito
        : baseDoEcraParaOPedido(escrito, opcoes?.doc ?? doc);
    precoEnviado.current = base;
    if (gravarPreco.current) clearTimeout(gravarPreco.current);
    gravarPreco.current = setTimeout(() => {
      void tentarGravarOPreco(base ?? null);
    }, 600);
  }

  /**
   * A ida ao servidor, separada do travão das teclas — porque o botão «Tentar
   * de novo» precisa de a chamar sem esperar 600 ms por nada.
   */
  async function tentarGravarOPreco(base: number | null) {
    setPrecoAGravar(true);
    try {
      const r = await mandarPrecoAoPedido(quote.id, base);
      // Auditoria de 13/11 (estúdio, n.º 10): uma resposta ATRASADA — ela já
      // escreveu outro valor, que entretanto partiu — não pode voltar ao ecrã:
      // o pedido com o preço antigo fazia a sincronização saltar o campo a meio
      // da escrita. Só a resposta do último valor enviado conta.
      if (base !== (precoEnviado.current ?? null)) return;
      if (r.estado === "gravado") {
        setPrecoPorChegar(null);
        // `quote` pode faltar num 200 de corpo ilegível — ver `ResultadoDoPreco`.
        if (r.quote) onQuoteUpdated?.(r.quote);
        return;
      }
      /**
       * ── E AQUI DEIXA DE SE CALAR ──────────────────────────────────────
       *
       * O comentário antigo dizia que avisar a cada tecla seria pior do que o
       * problema — e tinha razão. Só que a alternativa que escolheu foi não
       * avisar de todo, e o preço ficava a divergir em silêncio.
       *
       * O aviso não é por tecla: é UM estado, que fica enquanto o pedido tiver
       * um valor diferente do da proposta, e desaparece sozinho assim que uma
       * gravação passe. Enquanto ele estiver de pé, o ecrã mostra os dois
       * números e um botão — que é o que ela precisa de ver para decidir.
       */
      setPrecoPorChegar({
        base,
        porque: r.porque,
        valeTentarDeNovo: r.valeTentarDeNovo,
      });
    } finally {
      setPrecoAGravar(false);
    }
  }

  function onTotalInput(raw: string) {
    // O total não vive no `doc` (é um texto à parte), mas a regra é a mesma:
    // ver `camposTocados`. Sem esta marca, o merge do rascunho reescrevia a
    // caixa do total a meio de ela estar a escrever o valor.
    camposTocados.current.add("__total");
    setTotalInput(raw);
    /**
     * ── O QUE NÃO É UM VALOR DIZ-SE, E NÃO SE GRAVA ─────────────────────────
     *
     * Achado n.º 5: «-500» via-se -500 e contava +500 (o `parseMoneyText` lê
     * os algarismos e deixa o sinal de fora) — e era +500 que ia para o pedido.
     * Achado n.º 16: «0» voltava sozinho ao valor anterior, sem uma palavra.
     * Nos dois casos o campo fica com o que ela escreveu, diz porquê, e nada
     * se grava até haver um valor a sério.
     */
    const negativo = /-\s*[\d.,]/.test(raw);
    const lido = raw.trim() === "" ? undefined : parseMoneyText(raw);
    if (negativo) {
      setErroDoTotal(
        "O valor não pode ser negativo. Um desconto escreve-se como linha do orçamento.",
      );
      return;
    }
    if (lido === 0) {
      setErroDoTotal("Com 0 € não há proposta a enviar — escreve o valor dos serviços.");
      return;
    }
    setErroDoTotal(null);
    const base = lido;
    writeTotal(base == null ? undefined : amountParaBase(base, vatMode), vatMode);
    persistirPreco(base);
  }

  /**
   * O dinheiro EFECTIVO deste documento: já com a regra dos valores adicionais
   * aplicada (dentro do valor escrito, ou a somar-lhe). É o que o casal vai
   * ver e pagar, portanto é o que o estúdio mostra e o que trava o envio.
   *
   * O `escrito` é o outro número, e existe para uma coisa só: o campo «Valor
   * (sem IVA)» e o que se diz ao alinhá-lo com a soma das linhas. Aí o que
   * interessa é o que ELA escreveu, não o total com os adicionais somados.
   */
  const money = dinheiroDaProposta(doc);
  const escrito = resolveProposalMoney(doc);
  // A percentagem do sinal é do DOCUMENTO, e é a mesma que as rotas de
  // facturação leem quando emitem o sinal e o saldo (ver `depositPercentOf`).
  // Sem isso, a proposta dizia 40% e a factura saía a 30% — que é pior do que
  // não a poder mudar de todo.
  const pctSinal = depositPercentOf(doc as ProposalDoc);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS NÚMEROS DO ECRÃ SÃO OS NÚMEROS DO PAPEL — A MESMA FUNÇÃO, UMA VEZ SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «um bloco de totais inequívoco». O ecrã mostrava TRÊS somas
   * ao mesmo tempo — «Soma das linhas: 2.400,00 €», «Somado ao total: 970,00 €»
   * e, na barra do fundo, «Total 2.460,00 € · o cliente paga 3.025,80 € · soma
   * das linhas 2.400,00 €» — e nenhuma delas era o quadro que o casal recebe.
   * Três números a competir pela mesma pergunta ensinam a não confiar em
   * nenhum.
   *
   * Agora há um bloco só, pela ordem do PDF, e sai de `totaisDaProposta` — a
   * MESMA chamada que `proposal-doc-pdf.ts` faz para desenhar o quadro
   * (`totaisDaProposta(doc, depositPercentOf(doc))`). Enquanto o ecrã fizesse
   * as suas contas e o gerador as dele, o dia em que divergissem chegava — foi
   * exactamente assim que a proposta da Tara e do Marty saiu com o sinal e o
   * saldo a somarem 3.025,80 € e o «Valor Total» a dizer 2.950,79 €.
   */
  const totais = totaisDaProposta(doc, pctSinal);
  // O sinal e o saldo saem daí também, e não de uma segunda chamada a
  // `splitSinal`: eram a mesma divisão feita em dois sítios, e duas
  // implementações da mesma divisão podem arredondar para lados diferentes.
  const split = { sinal: totais.sinal, saldo: totais.saldo };
  // O desvio do total escrito à mão. Vive aqui em cima porque é lido em dois
  // sítios: na dica do campo e no aviso com o botão que o arruma.
  const desvio = desalinhamento(doc, money.base);
  const duasFormas = asDuasFormas(money.base, doc.vatRate ?? DEFAULT_VAT_RATE);

  return {
    amountParaBase,
    baseDoEcraParaOPedido,
    composeTotalText,
    desvio,
    doPedidoVisto,
    duasFormas,
    erroDoTotal,
    escrito,
    money,
    onTotalInput,
    pctSinal,
    persistirPreco,
    precoAGravar,
    precoEnviado,
    precoPorChegar,
    setSinalEscrito,
    setTotalInput,
    sinalAntes,
    sinalEscrito,
    split,
    tentarGravarOPreco,
    totais,
    totalInput,
    vatMode,
    writeTotal,
  };
}
