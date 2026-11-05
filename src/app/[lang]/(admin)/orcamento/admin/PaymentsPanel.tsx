"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DesistirDaEdicao } from "./ui/DesistirDaEdicao";
import type { FormEvent } from "react";
import { parseMoney, randomId, eur2, todayKey, isDateKey } from "./util";
import { Button } from "./ui";
import { Segmented } from "./ui/Segmented";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import type { Quote, Payment, PaymentKind } from "@/lib/orcamento/types";
import { splitSinal } from "@/lib/money";
import { useDinheiroAceite, usePercentagemDoSinal } from "./percentagem-do-sinal";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { computeEventMetrics, paidTotal, type DossierData } from "@/lib/orcamento/dossier";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { MEIOS_HABITUAIS, meioDoTexto } from "@/lib/orcamento/meios-de-pagamento";
import { IconeDoMeio } from "./ui/IconeDoMeio";

const KIND_LABEL: Record<PaymentKind, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};
const KIND_ORDER: PaymentKind[] = ["sinal", "pagamento", "saldo"];

/** Métodos habituais — juntam-se aos usados neste evento, que vêm primeiro. */
const METHOD_SUGGESTIONS = MEIOS_HABITUAIS.map((m) => m.nome);

/**
 * Colunas partilhadas pelo cabeçalho, pela linha de registo e por cada linha de
 * pagamento — é isto que faz o formulário ficar alinhado com a tabela por baixo.
 *
 * Larguras próprias por campo, não `flex flex-wrap`: a linha em flex empilhava
 * em coluna assim que o contentor apertava (painel do estúdio, tablet), que era
 * exactamente onde precisava de continuar uma linha. O limiar é uma *container
 * query* (`@min-[36rem]`), não um breakpoint de ecrã: o que manda é a largura do
 * painel, não a da janela.
 */
/** O rótulo visível de cada campo do «Registar pagamento». */
const ROTULO_CAMPO = "text-xs font-medium text-[var(--bo-text-muted)]";

/**
 * Os atalhos que preenchem o formulário: «Sinal 30% · 450 €», «50% · …»,
 * «Hoje», «Ontem». Mostram-se carregados quando o campo já tem esse valor.
 *
 * O verde do texto é o `--bo-accent` e não `text-sage-600`: a regra que o
 * clareia no escuro (admin.css, «O VERDE DO TEXTO NO ESCURO») só apanha a
 * classe simples, não a variante `aria-pressed:` — no escuro ficava a 2:1.
 *
 * MEDIDO a 375 px, na versão antiga: 45×28 e 56×28 — abaixo dos 44 das
 * guidelines. Errar o toque aqui não é inócuo: entre «Hoje» e «Ontem» está a
 * diferença entre datar um recebimento no dia certo e no dia errado, e entre
 * «Sinal» e «50%» está o dobro do valor. `alvo-toque` só cresce sob
 * `(pointer: coarse)`; com rato a fila mantém a densidade.
 */
const ATALHO =
  "alvo-toque inline-flex items-center rounded-full border px-2.5 py-1 text-xs tabular-nums " +
  "border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-sage-600/50 hover:text-[var(--bo-accent)] " +
  "aria-pressed:border-sage-600 aria-pressed:bg-sage-600/10 aria-pressed:text-[var(--bo-accent)] " +
  `${ESTADO} ${PRESSAO}`;

/** Os botões dos meios — o mesmo desenho do «Recebido» da área Pagamentos. */
const MEIO =
  "alvo-toque inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs " +
  "border-[var(--bo-hairline-strong)] text-[var(--bo-tinta-72)] hover:border-sage-600/50 " +
  "aria-pressed:border-sage-600 aria-pressed:bg-sage-600/10 aria-pressed:text-[var(--bo-accent)] " +
  `${ESTADO} ${PRESSAO}`;

/** O campo do valor já diz este número? (para mostrar o atalho carregado) */
function mesmoValor(campo: string, valor: number): boolean {
  const n = parseMoney(campo);
  return n !== undefined && Math.abs(n - valor) < 0.005;
}

const GRID =
  "grid items-center gap-x-2 gap-y-1.5 grid-cols-2 " +
  "@min-[36rem]:gap-y-0 " +
  "@min-[36rem]:grid-cols-[6.25rem_5.5rem_7.25rem_minmax(3.5rem,1fr)_5rem_5.5rem]";

/**
 * As peças de um quadrado de número — a caixa, o valor, o rótulo e a nota.
 *
 * Em constantes porque os três têm de mudar de forma AO MESMO TEMPO: abaixo dos
 * 26 rem de painel são três linhas de uma caixa só, acima são três cartões. Um
 * deles ficar para trás é a leitura do dinheiro partir-se a meio.
 *
 * O `EventCosts` tem o mesmo bloco, com os mesmos limiares e as mesmas razões —
 * os dois painéis vivem lado a lado no dossier e não podem divergir.
 */
const QUADRADO =
  "flex flex-wrap items-baseline gap-x-3 p-3 text-left " +
  "@min-[26rem]:block @min-[26rem]:rounded-xl @min-[26rem]:border @min-[26rem]:text-center";

/**
 * O tom do quadrado, escrito à parte da forma.
 *
 * Separado do `QUADRADO` de propósito: o terceiro tem tom próprio quando há
 * dinheiro em falta, e duas classes de cor no MESMO variante (`@min-[26rem]:`)
 * resolvem-se pela ordem da FOLHA DE ESTILOS, não pela ordem em que se
 * escreveram — é a armadilha que o `globals.css` conta por extenso a propósito
 * do `.alvo-toque`. Assim cada quadrado traz UMA cor, e não há empate a desfazer.
 */
const NEUTRO = "@min-[26rem]:border-[var(--bo-hairline)] @min-[26rem]:bg-[var(--bo-tinta-3)]";

/** O número. `whitespace-nowrap` é o que impede «202 889,00 €» de partir em duas. */
const VALOR =
  "order-2 ml-auto whitespace-nowrap font-semibold tabular-nums " +
  "@min-[26rem]:order-none @min-[26rem]:ml-0";

/** O rótulo, que abre a linha no telemóvel e volta para baixo do número a 26 rem. */
const ROTULO = "order-1 text-[9px] uppercase tracking-[0.2em] @min-[26rem]:mt-1";

/** A linha de apoio (o s/ IVA e o IVA): sempre por baixo, sempre a largura toda. */
const NOTA =
  "order-3 mt-1 w-full text-[9px] leading-tight tabular-nums text-foreground/35 @min-[26rem]:w-auto";

/** Data curta para a tabela de pagamentos ("12 mai"). */
const fmtRowDate = (d: string) =>
  isDateKey(d)
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : d || "—";

/** Número → texto do campo "Valor €" em hábito pt-PT ("450,00"). */
const fmtAmountInput = (n: number) => n.toFixed(2).replace(".", ",");

/** Dia de ontem como chave LOCAL `YYYY-MM-DD` (mesmo cuidado do `todayKey`). */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Operação que o servidor recusou — a linha fica marcada, com "Repetir". */
interface FailedOp {
  /** Pagamento afectado (marca a linha; se já não existir, mostra o fantasma). */
  id: string;
  /** A lista que deve voltar a ser tentada tal e qual. */
  next: Payment[];
  /** Cópia do pagamento para desenhar a linha que o registo perdeu. */
  ghost: Payment | null;
  label: string;
  /** A acção, nomeada, para o aviso do «Repetir» dizer o mesmo da primeira vez. */
  oQue: string;
}

interface Props {
  quote: Quote;
  onChange: (payments: Payment[]) => void;
  /**
   * Notifica o pai quando o Nº de contrato é gravado, para o estado partilhado
   * (selected/quotes) não ficar velho — o ciclo de vida e o CSV dependem dele.
   */
  onContractRef?: (ref: string) => void;
}

export default function PaymentsPanel({ quote, onChange, onContractRef }: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  const [payments, setPayments] = useState<Payment[]>(quote.payments ?? []);
  const [kind, setKind] = useState<PaymentKind>("sinal");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  // Registar assume, por omissão, que o dinheiro JÁ foi recebido (é o caso comum:
  // "colocar o que já foi pago") — assim "Recebido" sobe logo. Desligar regista
  // um pagamento previsto/por receber.
  const [paidOnAdd, setPaidOnAdd] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [contractRef, setContractRef] = useState(quote.contractRef ?? "");
  const [savingRef, setSavingRef] = useState(false);
  // Edição inline do valor de uma linha (sem modal): clico, altero, Enter.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [failed, setFailed] = useState<FailedOp | null>(null);

  // Depois de registar, o foco volta ao VALOR: o tipo e o meio ficam, e o
  // pagamento seguinte é escrever o número e carregar Enter (5/11 — com o tipo
  // em três botões à vista, o primeiro campo a escrever passou a ser o valor).
  const amountRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // Evita que o `blur` provocado pelo Enter grave a mesma edição duas vezes.
  const committing = useRef(false);
  // Ela já mexeu no valor (escreveu, limpou, ou escolheu um atalho)? A partir
  // daí o campo é dela e nada lhe volta a escrever por cima.
  const valorTocado = useRef(false);

  // Dossier "sintético" só com o que as funções puras precisam; usa os
  // pagamentos *vivos* (state) para o topo reagir aos toggles sem esperar
  // pela gravação.
  //
  // A proposta ACEITE entra, quando há: é o total que o cliente aceitou que se
  // cobra (ver `useDinheiroAceite`). Sem ela, as contas caem no «Preço final»
  // do pedido, como sempre. Só os três números do dinheiro vão no objecto —
  // `contractedAmounts` não lê mais nada da proposta.
  const aceite = useDinheiroAceite(quote.id);
  const dossier: DossierData = useMemo(
    () => ({
      quote: { ...quote, payments },
      proposal: aceite
        ? ({
            total: aceite.total,
            subtotal: aceite.subtotal,
            vatRate: aceite.vatRate,
          } as DossierData["proposal"])
        : null,
      contract: null,
    }),
    [quote, payments, aceite],
  );
  const metrics = useMemo(() => computeEventMetrics(dossier), [dossier]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UM PEDIDO, E UMA FRASE QUE DIZ QUE DINHEIRO
   * ══════════════════════════════════════════════════════════════════════
   *
   * As duas escritas deste painel diziam «Não foi possível guardar o nº de
   * contrato. Tenta novamente.» e «Não foi possível guardar. Usa o Repetir na
   * linha marcada.» — a mesma frase para a rede em baixo, a sessão expirada e
   * o servidor em baixo, e num painel onde cada linha é uma quantia. Sem o
   * valor lá dentro, o aviso não diz que pagamento é que não ficou registado.
   *
   * Este devolve a resposta e a frase em vez de a dizer, porque quem chama
   * ainda tem de decidir o que fazer: o 409 tem tratamento próprio (adopta a
   * versão do servidor), e o resto marca a linha antes de avisar.
   */
  async function pedir(
    oQue: string,
    init: RequestInit,
  ): Promise<{ res: Response | null; corpo: unknown; aviso: string }> {
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}`, init);
    } catch {
      return { res: null, corpo: null, aviso: porqueRebentou(oQue).mensagem };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) return { res, corpo, aviso: porqueFalhou(oQue, res, corpo).mensagem };
    return { res, corpo, aviso: "" };
  }

  async function saveContractRef() {
    const next = contractRef.trim();
    if (next === (quote.contractRef ?? "")) return;
    setSavingRef(true);
    const { res, aviso } = await pedir(
      next ? `guardar o nº de contrato «${next}»` : "apagar o nº de contrato",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // null (não undefined): limpar o campo tem de chegar ao servidor —
        // undefined desaparece no JSON e o valor antigo voltava sozinho.
        body: JSON.stringify({ contractRef: next || null }),
      },
    );
    setSavingRef(false);
    if (!res?.ok) {
      toast(aviso, "error");
      return;
    }
    onContractRef?.(next);
    toast("Nº de contrato guardado", "success");
  }

  // Total COM IVA (o que o cliente paga): a mesma base dos pagamentos, que são
  // com IVA. Antes usava-se `contracted`, que para um preço manual (quotedPrice,
  // sem IVA) deixava o "Em falta" errado em ~23%.
  const total = metrics.contractedGross; // proposta > preço cotado > estimativa
  const totalNet = metrics.contractedNet;
  const totalIva = metrics.contractedIva;
  // ── "RECEBIDO" É O QUE ESTÁ REGISTADO COMO RECEBIDO ──────────────────────
  //
  // Este número já foi de tudo. Foi o livro de faturas sozinho, e só mexia ao
  // emitir uma factura («registo um pagamento e nada muda»). Depois passou a
  // somar as duas fontes espécie a espécie, para não perder o dinheiro que
  // entrava por um lado e não pelo outro.
  //
  // Agora há uma fonte só — a facturação saiu desta casa — e é a que ela
  // alimenta: as linhas de pagamento deste painel, mesmo aqui em baixo. Sobe ao
  // vivo à medida que se marcam como recebidas, que é o comportamento que ela
  // conhece e o que este ecrã sempre prometeu.
  const headlinePaid = useMemo(() => paidTotal(dossier.quote), [dossier]);
  const outstanding = Math.max(0, total - headlinePaid);
  // Estado "tudo recebido" só faz sentido quando há um total contratado.
  const allReceived = total > 0 && outstanding === 0;
  // Aviso suave: registaram-se recebimentos acima do total contratado.
  const overReceived = total > 0 && headlinePaid > total;
  // Faseamento sobre o total com IVA — alimenta os atalhos de registo.
  //
  // A percentagem é a da PROPOSTA deste pedido, não 30% fixos: é ela que as
  // rotas de facturação usam para emitir o sinal e o saldo. Enquanto isto
  // dividia sempre 30/70, o atalho oferecia 369 € numa proposta de 50% cuja
  // factura de sinal era de 615 € — ela registava o que o botão dizia e o «Em
  // falta» ficava errado a partir daí, sem nada no ecrã a denunciá-lo.
  const pctSinal = usePercentagemDoSinal(quote.id);
  const split = useMemo(() => splitSinal(total, pctSinal), [total, pctSinal]);
  const today = todayKey();
  const yesterday = useMemo(() => yesterdayKey(), []);

  // ── Pré-visualização ao vivo (só apresentação; não mexe em nada gravado) ──
  // Enquanto se escreve o valor, o topo mostra onde Recebido/Em falta vão ficar.
  const draft = parseMoney(amount) ?? 0;
  const draftValid = draft > 0;
  const previewPaid = headlinePaid + (draftValid && paidOnAdd ? draft : 0);
  const previewOutstanding = Math.max(0, total - previewPaid);
  const pct = total > 0 ? Math.min(100, (headlinePaid / total) * 100) : 0;
  const pctDraft =
    total > 0 && draftValid && paidOnAdd
      ? Math.max(0, Math.min(100 - pct, (draft / total) * 100))
      : 0;

  // Os métodos usados neste evento ficam à cabeça — é o que se repete no dia-a-dia.
  const methodOptions = useMemo(() => {
    const used: string[] = [];
    for (let i = payments.length - 1; i >= 0; i--) {
      const n = payments[i].note?.trim();
      if (n && !used.some((u) => u.toLowerCase() === n.toLowerCase())) used.push(n);
    }
    return [
      ...used,
      ...METHOD_SUGGESTIONS.filter((m) => !used.some((u) => u.toLowerCase() === m.toLowerCase())),
    ];
  }, [payments]);

  // Ecrã vazio útil: em vez de uma caixa a dizer que não há nada, a linha de
  // registo já vem com o sinal da proposta preenchido — falta carregar em Registar.
  //
  // ── E ACOMPANHA A PERCENTAGEM ATÉ ELA MEXER ─────────────────────────────
  // A percentagem do sinal vem da lista leve de propostas, por rede: no
  // primeiro desenho vale ainda a da casa (30%). Enquanto isto se preenchia
  // UMA só vez, o campo ficava com os 369,00 € dos 30% e o atalho ao lado, já
  // com a resposta, dizia «Sinal 50% · 615,00 €» — dois números para a mesma
  // coisa, e o botão Registar grava o do campo.
  //
  // Por isso a condição não é "já preenchi", é "ela ainda não mexeu": enquanto
  // o valor for uma sugestão nossa, é nosso dever mantê-lo certo; a partir do
  // momento em que é dela, não se lhe toca (ver `valorTocado`).
  useEffect(() => {
    if (valorTocado.current || payments.length > 0 || total <= 0) return;
    setKind("sinal");
    setAmount(fmtAmountInput(split.sinal));
  }, [payments.length, total, split.sinal]);

  // Foco (e seleção) no campo de edição inline assim que ele aparece.
  useEffect(() => {
    if (!editingId) return;
    editRef.current?.focus();
    editRef.current?.select();
  }, [editingId]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * DE ONDE ESTA LISTA FOI COPIADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este painel copia `quote.payments` UMA vez, quando monta (`useState`, lá em
   * cima), e está preso por `key` ao id do pedido — não volta a ler a
   * propriedade quando ela mudar. Ao gravar manda a lista INTEIRA, portanto a
   * gravação não é «marca este pagamento como recebido»: é «substitui a lista
   * de pagamentos por esta».
   *
   * O que isso fazia, sem corrida nenhuma: painel aberto de manhã no telemóvel,
   * um pagamento dado por recebido no portátil ao meio-dia, um toque no
   * telemóvel à tarde — e o `paid: true` voltava a `false`, com as duas
   * gravações a responder 200. É dinheiro a mudar de estado sozinho, e muda a
   * coluna do Quadro e a margem do evento.
   *
   * `base` é a versão de que esta lista partiu. Vai no pedido, o servidor
   * compara-a com a que tem guardada e recusa com 409 se alguém lhe mexeu no
   * meio.
   *
   * ── PORQUE É QUE AVANÇA AO ENVIAR E NÃO AO CONFIRMAR ────────────────────
   *
   * Dois cliques seguidos dela põem dois PATCH no ar, e o segundo leva a lista
   * inteira JÁ COM o primeiro lá dentro. Se a base só avançasse na confirmação,
   * o segundo pedido declarava a versão de antes do primeiro e o servidor
   * recusava-o — uma colisão inventada, dela consigo própria, no meio de um
   * gesto normal. Avança ao enviar, e volta atrás se a gravação falhar.
   */
  const base = useRef<Payment[]>(quote.payments ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A QUE FALHA NÃO PODE DESFAZER A QUE PASSOU
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A reversão guardava `const snapshot = payments` ANTES do pedido e repunha
   * esse instante no erro. Um instante que já passou: entre o envio e a
   * resposta cabe outra gravação inteira, e neste painel cabe mesmo — registar
   * um pagamento e dar o anterior por recebido são dois toques seguidos, e o
   * segundo PATCH leva a lista INTEIRA já com o primeiro lá dentro.
   *
   * O CENÁRIO, com duas pessoas e dinheiro: ela dá o sinal de 3 000 € por
   * recebido no telemóvel e, sem esperar, regista o saldo de 7 000 €. O
   * segundo pedido chega primeiro e é aceite — o servidor fica com o sinal
   * recebido E o saldo. O primeiro volta com um 503 do balanceador e repunha o
   * snapshot: o saldo de 7 000 € desaparecia do ecrã apesar de estar gravado,
   * e o «Em falta» passava a mentir. O toque seguinte dela gravava esse ecrã
   * por cima da verdade e o saldo morria também na base de dados.
   *
   * A correcção são duas referências (a mesma da checklist, do guião, do plano
   * e dos custos — este painel era o último por fazer):
   *
   *   · `gravacoes` — o contador. Cada gravação leva um número; só a MAIS
   *     RECENTE tem direito a desfazer o ecrã e a avisar. Uma resposta
   *     atrasada de uma gravação já ultrapassada não escreve nada: o que a
   *     mais recente levou CONTÉM o que ela levava.
   *
   *   · `gravado` — o último estado que o SERVIDOR confirmou. É para aqui que
   *     se reverte, e não para o instante anterior ao pedido; assim a reversão
   *     nunca deita fora uma gravação que passou entretanto.
   *
   * Nada se perde na ultrapassagem: a gravação mais recente inclui o que a
   * ultrapassada queria escrever, portanto se ELA falhar é ela que repõe, que
   * marca a linha e que oferece o «Repetir» — com as duas alterações lá dentro.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<Payment[]>(quote.payments ?? []);

  /**
   * Gravação otimista COM REVERSÃO: se o servidor recusar, o dinheiro não pode
   * ficar diferente no ecrã e na base de dados sem ninguém dar por isso. Além de
   * reverter, marca a linha em causa e guarda a tentativa para o botão "Repetir".
   */
  async function persist(
    next: Payment[],
    op: {
      id: string;
      ghost?: Payment | null;
      label: string;
      oQue: string;
      /**
       * A volta atrás do gesto: a frase do aviso e a lista como estava. Ao
       * «Anular», grava-se essa lista pelo mesmo caminho (com a `base`, para
       * não pisar o que outra pessoa entretanto fez). Palavras dela: «tem que
       * haver no site todo, em tudo aquilo que se faz, uma forma de voltar
       * atrás».
       */
      desfazer?: { texto: string; antes: Payment[] };
    },
  ) {
    const minha = ++gravacoes.current;
    setPayments(next);
    onChange(next);
    setFailed((f) => (f && f.id === op.id ? null : f));
    const baseAnterior = base.current;
    base.current = next;

    const { res, corpo, aviso } = await pedir(op.oQue, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments: next, base: { payments: baseAnterior } }),
    });

    /**
     * 409 NÃO é «tenta outra vez». É «isto mudou noutro sítio», e repetir
     * seria escrever por cima do que a outra pessoa acabou de fazer — que é
     * exactamente o que este guarda existe para impedir. Por isso NÃO se
     * marca a linha para o botão «Repetir»: adopta-se o que o servidor tem,
     * diz-se-lhe, e ela decide o que fazer já a olhar para a verdade.
     */
    if (res?.status === 409) {
      // A lista que o servidor tem AGORA passa a ser a verdade conhecida — e é
      // dela que a próxima gravação parte (`base`) e para onde uma reversão
      // futura reverte (`gravado`). Sem a fallback ser o `gravado`, um 409 sem
      // corpo legível repunha um instante qualquer.
      const doServidor =
        (corpo as { current?: { payments?: Payment[] } } | null)?.current?.payments ??
        gravado.current;
      gravado.current = doServidor;
      base.current = doServidor;
      // Se já há gravação mais recente, é ela que manda no ecrã: ela declarou
      // esta base e vai bater na mesma parede, e é ela que põe a verdade lá.
      if (minha === gravacoes.current) {
        setPayments(doServidor);
        onChange(doServidor);
        setFailed(null);
      }
      toast("Os pagamentos foram alterados noutro sítio. Está aqui a versão guardada.", "error");
      return;
    }

    if (res?.ok) {
      if (minha === gravacoes.current) gravado.current = next;
      if (op.desfazer) {
        const { texto, antes } = op.desfazer;
        anular(texto, () =>
          persist(antes, { id: op.id, ghost: null, label: op.label, oQue: `anular: ${op.oQue}` }),
        );
      }
      return;
    }

    // Ultrapassada por uma gravação mais recente: o que ESSA leva contém o que
    // esta levava, portanto não há ecrã a desfazer, não há linha a marcar (o
    // «Repetir» mandaria uma lista velha, sem o que veio depois) e não há nada
    // a dizer. Se ela também falhar, é ela que repõe — e com as duas dentro.
    if (minha !== gravacoes.current) return;

    // Reverte-se para o último estado CONFIRMADO, não para o instante anterior
    // ao pedido, e a base acompanha o que fica no ecrã — declarar uma versão
    // que nunca foi gravada dava um 409 inventado na gravação seguinte.
    base.current = gravado.current;
    setPayments(gravado.current);
    onChange(gravado.current);
    setFailed({ id: op.id, next, ghost: op.ghost ?? null, label: op.label, oQue: op.oQue });
    // A frase diz o que aconteceu e o que fazer; esta segunda parte diz ONDE —
    // sem ela, o aviso desaparece e a linha marcada fica sem explicação.
    toast(`${aviso} A linha ficou marcada, com «Repetir».`, "error");
  }

  function retryFailed() {
    if (!failed) return;
    void persist(failed.next, {
      id: failed.id,
      ghost: failed.ghost,
      label: failed.label,
      oQue: failed.oQue,
    });
  }

  /** Submissão do formulário — Enter em QUALQUER campo passa por aqui. */
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // parseMoney entende "1.500", "1500,50" e "1 500€" — parseFloat lia 1,5 €.
    const a = parseMoney(amount);
    if (!a || a <= 0) {
      setFormError("Escreve um valor maior que zero.");
      amountRef.current?.focus();
      return;
    }
    const p: Payment = {
      id: randomId(),
      kind,
      amount: a,
      date: isDateKey(date) ? date : todayKey(),
      paid: paidOnAdd,
      note: note.trim() || undefined,
    };
    void persist([...payments, p], {
      id: p.id,
      ghost: p,
      label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}`,
      oQue: `registar o ${KIND_LABEL[p.kind].toLowerCase()} de ${eur2(p.amount)}`,
    });
    setAmount("");
    setNote("");
    setFormError(null);
    // De volta ao valor, pronto para o pagamento seguinte.
    amountRef.current?.focus();
  }

  function togglePaid(p: Payment) {
    void persist(
      payments.map((x) => (x.id === p.id ? { ...x, paid: !x.paid } : x)),
      {
        id: p.id,
        ghost: null,
        label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}`,
        oQue: `dar o ${KIND_LABEL[p.kind].toLowerCase()} de ${eur2(p.amount)} por ${
          p.paid ? "por receber" : "recebido"
        }`,
        desfazer: {
          texto: `${KIND_LABEL[p.kind]} de ${eur2(p.amount)} ${p.paid ? "por receber" : "recebido"}.`,
          antes: payments,
        },
      },
    );
  }
  function remove(p: Payment) {
    void persist(
      payments.filter((x) => x.id !== p.id),
      {
        id: p.id,
        ghost: p,
        label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}`,
        oQue: `apagar o ${KIND_LABEL[p.kind].toLowerCase()} de ${eur2(p.amount)}`,
        // Apagar um pagamento não pedia confirmação nenhuma. Em vez de uma
        // pergunta a cada linha, a volta atrás: «Anular» repõe-no tal e qual.
        desfazer: {
          texto: `${KIND_LABEL[p.kind]} de ${eur2(p.amount)} apagado.`,
          antes: payments,
        },
      },
    );
  }

  function startEdit(p: Payment) {
    committing.current = false;
    setEditingId(p.id);
    setEditValue(fmtAmountInput(p.amount));
  }
  function cancelEdit() {
    committing.current = true;
    setEditingId(null);
    setEditValue("");
  }
  /** Grava a edição inline. Chamada pelo Enter e pelo blur — só corre uma vez. */
  function commitEdit(p: Payment) {
    if (committing.current) return;
    committing.current = true;
    const v = parseMoney(editValue);
    setEditingId(null);
    setEditValue("");
    if (v == null || !(v > 0) || v === p.amount) return;
    void persist(
      payments.map((x) => (x.id === p.id ? { ...x, amount: v } : x)),
      {
        id: p.id,
        ghost: null,
        label: `${KIND_LABEL[p.kind]} ${eur2(v)}`,
        oQue: `mudar o ${KIND_LABEL[p.kind].toLowerCase()} de ${eur2(p.amount)} para ${eur2(v)}`,
        desfazer: {
          texto: `${KIND_LABEL[p.kind]}: ${eur2(p.amount)} → ${eur2(v)}.`,
          antes: payments,
        },
      },
    );
  }

  /** Sugestão de valor: um clique preenche o campo (e o tipo, quando é óbvio). */
  function suggest(value: number, k?: PaymentKind) {
    if (k) setKind(k);
    // Escolha dela, sobre um número que estava no ecrã: o valor passa a ser
    // dela e o pré-preenchimento não volta a mexer-lhe.
    valorTocado.current = true;
    setAmount(fmtAmountInput(value));
    setFormError(null);
    amountRef.current?.focus();
  }

  /** Mudar o tipo no select pré-preenche o valor se o campo estiver vazio. */
  function pickKind(k: PaymentKind) {
    setKind(k);
    if (amount.trim() !== "" || total <= 0) return;
    // O sinal continua a ser sugestão nossa (fica a acompanhar a percentagem da
    // proposta); o saldo é um número que só faz sentido agora, e esse fixa-se.
    if (k === "sinal") setAmount(fmtAmountInput(split.sinal));
    else if (k === "saldo" && outstanding > 0) {
      valorTocado.current = true;
      setAmount(fmtAmountInput(outstanding));
    }
  }

  const ghostFailed = Boolean(failed?.ghost && !payments.some((p) => p.id === failed.id));

  return (
    // `@container`: as colunas do formulário/tabela reagem à largura DESTE painel
    // (que muda entre o estúdio, o separador Financeiro e o tablet), não à janela.
    //
    // O `pt-5` do separador eram 20 px de ar por cima do título a qualquer
    // largura. `--bo-p-vista` (12 → 24) é o token do respiro vertical de uma
    // vista, e é o que os painéis vizinhos desta zona do dossier passaram a
    // ler: um separador que mede o mesmo em todos, e 8 px de volta aqui.
    <div className="@container border-t border-[var(--bo-hairline-strong)] pt-[var(--bo-p-vista)]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Pagamentos</p>
        {/* Contract reference */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="payments-contract-ref"
            className="text-foreground/45 text-[10px] tracking-[0.15em] uppercase"
          >
            Ref.
          </label>
          <input
            id="payments-contract-ref"
            value={contractRef}
            onChange={(e) => setContractRef(e.target.value)}
            onBlur={saveContractRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveContractRef();
            }}
            placeholder="2026-001"
            className={`bo-input w-24 px-2.5 py-1.5 text-xs text-[var(--bo-text)] ${savingRef ? "opacity-50" : ""}`}
            title="Número de referência do contrato"
          />
        </div>
      </div>

      {/* ── Resumo — as três respostas que importam, numa linha ──
          Recebido = pagamentos marcados como pagos (atualiza ao vivo). "Em
          falta" é o herói quando há dinheiro por receber; quando está tudo
          recebido vira um estado calmo de confirmação.

          ── PORQUE É QUE AS TRÊS COLUNAS TÊM UM LIMIAR ─────────────────────
          Três colunas fixas partiam os números no telemóvel. Medido num
          iPhone SE (375 px), com este painel a 343 px de largura: cada célula
          dava 68 px de conteúdo, e "22 650,45 €" precisa de 94 px, o "Em
          falta" (que é maior, `text-lg`) precisa de 106 px, e a linha do IVA
          partia-se em QUATRO. O número transbordava da célula e ia por cima da
          vizinha — e é este o número que ela lê para decidir se já pode
          facturar.

          Duas colunas dão 142 px de conteúdo a cada uma, que chega com folga
          para os dois. As três só voltam quando o PAINEL (não a janela: ele
          vive no dossier, no separador Financeiro e no estúdio) tem 26 rem —
          3 × 130 px de célula mais os intervalos, que é o mínimo em que o "Em
          falta" cabe inteiro.

          O "Em falta" atravessava as duas colunas em baixo, para não ficar meio
          a meio com o "Recebido": é o herói deste bloco. Já não precisa de
          atravessar nada — ver a nota a seguir. */}
      {/* ── E O TERCEIRO NÍVEL DE MOLDURA SAI ──────────────────────────────
          Duas colunas resolveram as três, mas o quadrado continuava a ser uma
          caixa dentro do cartão de zona, que já está dentro de uma coluna.
          Medido a 375 px: 279 px de painel, menos o intervalo, dá 134 px de
          célula — e os `p-3` deixam **110 px** de conteúdo para um número que
          precisa de 109 («202 889,00 €»), com o "Em falta" a `text-lg` a
          precisar de 121. Um pixel de folga não é folga: é o número a partir-se
          em duas linhas assim que o valor sobe de escalão.

          Abaixo dos 26 rem os três perdem a moldura própria e passam a três
          linhas da MESMA caixa, com um risco a separá-las — rótulo à esquerda,
          número à direita. A célula passa de 110 para **255 px**, e o
          `whitespace-nowrap` garante que o valor nunca parte ao meio: se não
          couber ao lado do rótulo, o `flex-wrap` dá-lhe a linha inteira. É o
          padrão do `Overview.tsx` (:1641) e o mesmo que o `EventCosts` faz na
          linha equivalente — os dois painéis vivem lado a lado no dossier.

          Container query e não `sm:`: num iPad a 768 px o `sm:` disparava e o
          painel continuava com os mesmos 279. A partir de 26 rem volta a grelha
          de três cartões, como sempre esteve. */}
      <div className="flex flex-col divide-y divide-[var(--bo-hairline)] rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] mb-1.5 @min-[26rem]:grid @min-[26rem]:grid-cols-3 @min-[26rem]:gap-2.5 @min-[26rem]:divide-y-0 @min-[26rem]:rounded-none @min-[26rem]:border-0 @min-[26rem]:bg-transparent">
        <div className={`${QUADRADO} ${NEUTRO}`}>
          <p className={`${VALOR} text-base text-[var(--bo-text)]`}>{eur2(total)}</p>
          <p className={`${ROTULO} text-foreground/40`}>Total (c/ IVA)</p>
          <p className={NOTA}>
            s/ IVA {eur2(totalNet)} · IVA {eur2(totalIva)}
          </p>
        </div>
        <div className={`${QUADRADO} ${NEUTRO}`}>
          <p className={`${VALOR} text-base text-sage-600`}>{eur2(headlinePaid)}</p>
          <p className={`${ROTULO} text-foreground/40`}>Recebido</p>
        </div>
        {allReceived ? (
          <div
            className={`${QUADRADO} @min-[26rem]:border-sage-600/25 @min-[26rem]:bg-sage-600/[0.05]`}
          >
            <p
              className={`${VALOR} inline-flex items-center gap-1.5 text-sm text-sage-600 @min-[26rem]:justify-center`}
            >
              Tudo recebido
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden="true"
              >
                <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            <p className={`${ROTULO} text-[var(--bo-accent)]`}>Em falta</p>
          </div>
        ) : (
          <div
            className={`${QUADRADO} ${
              outstanding > 0
                ? "@min-[26rem]:border-[var(--bo-perigo)]/35 @min-[26rem]:bg-[var(--bo-perigo)]/[0.05]"
                : NEUTRO
            }`}
          >
            <p
              className={`${VALOR} ${
                outstanding > 0 ? "text-lg text-[var(--bo-perigo)]" : "text-base text-foreground/45"
              }`}
            >
              {eur2(outstanding)}
            </p>
            <p
              className={`${ROTULO} ${outstanding > 0 ? "text-[var(--bo-perigo)]/70" : "text-foreground/40"}`}
            >
              Em falta
            </p>
          </div>
        )}
      </div>

      {/* Barra do recebido face ao total. O segmento claro é o valor que está a
          ser escrito agora — pré-visualização, ainda não gravada. */}
      {total > 0 && (
        <div
          role="progressbar"
          aria-label="Percentagem recebida do total"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${Math.round(pct)}% recebido de ${eur2(total)}`}
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
        >
          <div className="h-full bg-sage-600" style={{ width: `${pct}%` }} />
          <div className="h-full bg-sage-600/35" style={{ width: `${pctDraft}%` }} />
        </div>
      )}
      {/* Linha de altura fixa: alterna entre a nota fixa e a pré-visualização —
          o texto muda enquanto se escreve, a altura nunca (zero saltos). */}
      <p className="text-foreground/35 text-[10px] min-h-[1.1rem] leading-[1.1rem] mt-1.5 mb-3">
        {draftValid && paidOnAdd && total > 0 ? (
          <span className="text-[var(--bo-text-muted)] tabular-nums">
            Com este registo: recebido {eur2(previewPaid)} · em falta {eur2(previewOutstanding)}
          </span>
        ) : (
          "Recebido e Em falta atualizam à medida que marca cada pagamento como pago."
        )}
      </p>

      {/* Aviso suave: recebido acima do total contratado (mesmo estilo do banner
          de reconciliação — algo para verificar, não um erro bloqueante).

          ── E APARECE DE ALGUM SÍTIO ────────────────────────────────────────
          Este aviso nasce de um número que ela acabou de escrever na linha
          logo acima: marcar mais um pagamento como pago faz a soma passar o
          contratado, e a caixa amarela aparecia no fotograma seguinte, do
          nada, a empurrar a lista para baixo.

          `.bo-entrada` — 240 ms e QUATRO píxeis, a distância de um rótulo. É a
          distância certa porque é daqui mesmo que ele vem: do campo em cima, e
          não de fora do ecrã (esses são os oito da `.bo-entrada-folha`).

          Números não pulsam e o aviso não pisca: o que se move é a caixa a
          assentar, uma vez, e a frase está legível quase desde o primeiro
          fotograma — a curva da casa gasta a distância toda no arranque. */}
      {overReceived && (
        <div
          role="alert"
          className="bo-entrada flex items-start gap-2.5 rounded-lg border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.08] px-3.5 py-2.5 mb-4"
        >
          <svg
            className="text-[var(--bo-aviso)] shrink-0 mt-0.5"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-[var(--bo-aviso)] text-xs font-medium leading-snug">
              Recebido excede o total contratado ({eur2(headlinePaid)} de {eur2(total)}).
            </p>
            <p className="text-foreground/45 text-[11px] mt-0.5">
              Verifica os valores registados ou o total do contrato.
            </p>
          </div>
        </div>
      )}

      {/* ── Registar pagamento (redesenhado a 5/11) ─────────────────────────
          Ela, a olhar para a linha antiga: «temos que melhorar isto bastante».
          Era uma linha só de campos sem rótulo (cabeçalhos de 9 px por cima) e,
          por baixo, uma fila que misturava os atalhos do valor, da data e do
          meio, separados por «|». Agora cada atalho vive DEBAIXO do campo que
          preenche, o tipo são três botões à vista, e o meio escolhe-se pelos
          logótipos — o mesmo desenho do «Recebido» da área Pagamentos, para a
          equipa aprender um só.

          Continua um <form> a sério: Enter em qualquer campo regista. */}
      <section
        aria-labelledby="registar-pagamento-titulo"
        className="mb-5 rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-[var(--bo-p-cartao)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="registar-pagamento-titulo" className="text-sm font-medium text-[var(--bo-text)]">
            Registar pagamento
          </h3>
          <Segmented<PaymentKind>
            ariaLabel="Tipo de pagamento"
            size="sm"
            value={kind}
            onChange={pickKind}
            options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </div>

        <form
          onSubmit={submit}
          aria-label="Registar pagamento"
          className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 @min-[36rem]:grid-cols-2"
        >
          {/* Valor, e os atalhos do valor por baixo. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={ROTULO_CAMPO} aria-hidden="true">
              Valor
            </span>
            <div className="relative">
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                aria-label="Valor em euros"
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? "registar-pagamento-erro" : undefined}
                value={amount}
                onChange={(e) => {
                  valorTocado.current = true;
                  setAmount(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="0,00"
                className="bo-input w-full py-2.5 pl-3 pr-8 text-right text-lg tabular-nums text-[var(--bo-text)]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--bo-text-muted)]"
              >
                €
              </span>
            </div>
            {total > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => suggest(outstanding, "saldo")}
                    title="Preencher com o valor em falta"
                    aria-pressed={mesmoValor(amount, outstanding)}
                    className={ATALHO}
                  >
                    Em falta · {eur2(outstanding)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => suggest(split.sinal, "sinal")}
                  title={`Preencher com o sinal de ${pctSinal}% do total`}
                  aria-pressed={mesmoValor(amount, split.sinal)}
                  className={ATALHO}
                >
                  Sinal {pctSinal}% · {eur2(split.sinal)}
                </button>
                <button
                  type="button"
                  onClick={() => suggest(Math.round(total * 50) / 100)}
                  title="Preencher com metade do total"
                  aria-pressed={mesmoValor(amount, Math.round(total * 50) / 100)}
                  className={ATALHO}
                >
                  50% · {eur2(Math.round(total * 50) / 100)}
                </button>
              </div>
            )}
          </div>

          {/* Data, e «Hoje»/«Ontem» por baixo. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={ROTULO_CAMPO} aria-hidden="true">
              Data
            </span>
            <input
              type="date"
              aria-label="Data do pagamento"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bo-input w-full px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDate(today)}
                aria-pressed={date === today}
                className={ATALHO}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setDate(yesterday)}
                aria-pressed={date === yesterday}
                className={ATALHO}
              >
                Ontem
              </button>
            </div>
          </div>

          {/* Como pagou: os logótipos primeiro (pedido dela, 5/11), e o campo
              livre para o resto — outro meio, ou uma nota. */}
          <fieldset className="flex min-w-0 flex-col gap-2 @min-[36rem]:col-span-2">
            <legend className={`${ROTULO_CAMPO} mb-1.5`}>Como pagou</legend>
            <div className="flex flex-wrap gap-2">
              {MEIOS_HABITUAIS.map(({ meio, nome }) => {
                const escolhido = note.trim().toLowerCase() === nome.toLowerCase();
                return (
                  <button
                    key={meio}
                    type="button"
                    onClick={() => setNote(escolhido ? "" : nome)}
                    aria-pressed={escolhido}
                    className={MEIO}
                  >
                    <IconeDoMeio meio={meio} />
                    {nome}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              aria-label="Método ou nota (opcional)"
              list="payments-method-list"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Outro meio ou uma nota (opcional)"
              className="bo-input w-full px-3 py-2 text-sm text-[var(--bo-tinta-72)]"
            />
          </fieldset>

          {/* O fecho: já entrou ou é só previsto, e registar. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bo-hairline)] pt-4 @min-[36rem]:col-span-2">
            {/* ── 163×18 NUM TELEMÓVEL ────────────────────────────────────
                MEDIDO a 375 px: o alvo deste interruptor era 163×18. É o que
                decide se a linha já entrou ou é só um plano — e é essa marca
                que faz o pedido passar a «Ganho» (ver o PATCH em
                `api/orcamento/[id]/route.ts`). Cresce o RÓTULO, não o
                quadrado; `alvo-toque` só age sob `(pointer: coarse)`. */}
            <label className="alvo-toque !justify-start inline-flex select-none items-center gap-2 text-sm text-[var(--bo-tinta-72)]">
              <input
                type="checkbox"
                checked={paidOnAdd}
                onChange={(e) => setPaidOnAdd(e.target.checked)}
                className="h-4 w-4 accent-sage-600"
              />
              Já pago
              <span className="text-xs text-[var(--bo-text-faint)]">
                {paidOnAdd ? "· o dinheiro já entrou" : "· fica previsto, por receber"}
              </span>
            </label>
            {/* Nunca `disabled`: um botão apagado lê-se como avariado. Com o
                valor em falta, carregar aponta o erro e devolve o foco. */}
            <Button type="submit" size="sm">
              Registar
            </Button>
          </div>

          {formError && (
            <p
              id="registar-pagamento-erro"
              role="alert"
              className="text-xs text-[var(--bo-perigo)] @min-[36rem]:col-span-2"
            >
              {formError}
            </p>
          )}
        </form>

        {/* Fora do formulário (é um elemento invisível). Os métodos usados
            neste evento primeiro, depois os habituais. */}
        <datalist id="payments-method-list">
          {methodOptions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </section>

      {/* ── Pagamentos registados (registo interno do dia-a-dia) ── */}
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <p className="text-foreground/45 text-[10px] tracking-[0.2em] uppercase">
          Pagamentos registados
        </p>
        {payments.length > 0 && (
          <span className="text-foreground/40 text-[10px] tabular-nums">
            {eur2(headlinePaid)} recebido
          </span>
        )}
      </div>

      {/* Lista — uma linha por pagamento, nas mesmas colunas do formulário. */}
      <div className="flex flex-col gap-1">
        {payments.length === 0 && !ghostFailed && (
          <p className="text-foreground/35 text-[11px] py-1">
            Ainda sem registos — a linha acima já traz o sinal sugerido.
          </p>
        )}
        {payments.map((p) => {
          const overdue = !p.paid && isDateKey(p.date) && p.date < today;
          const isFailed = failed?.id === p.id;
          return (
            <div
              key={p.id}
              className={`group ${GRID} rounded-lg px-2 py-1.5 ${ESTADO} ${
                isFailed
                  ? "border border-[var(--bo-perigo)]/50 bg-[var(--bo-perigo)]/[0.06]"
                  : "border border-transparent hover:bg-[var(--bo-tinta-3)]"
              }`}
            >
              <span className="text-[var(--bo-tinta-72)] text-xs truncate">
                {KIND_LABEL[p.kind]}
              </span>

              {editingId === p.id ? (
                <span className="flex items-center gap-1">
                  <input
                    ref={editRef}
                    type="text"
                    inputMode="decimal"
                    aria-label={`Valor de ${KIND_LABEL[p.kind]} em euros`}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit(p);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    className="bo-input px-1.5 py-1 text-xs text-right tabular-nums text-[var(--bo-text)]"
                  />
                  {/* Num telemóvel não há Escape, e tudo o que tira o foco
                      GRAVA — ver `DesistirDaEdicao`. */}
                  <DesistirDaEdicao onDesistir={cancelEdit} oQue="o valor" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  aria-label={`Editar valor de ${KIND_LABEL[p.kind]}, ${eur2(p.amount)}`}
                  title="Clica para editar o valor"
                  // `pointer-coarse:min-h-11` e não `alvo-toque`: a classe da
                  // casa põe `justify-content: center`, e este número está
                  // alinhado à DIREITA para bater certo com a coluna do
                  // formulário por cima. Media 137,5 × 24 px no telemóvel — é o
                  // botão que abre a edição do valor, e 24 px é meia polpa de
                  // dedo.
                  className={`rounded-md px-1.5 py-1 pointer-coarse:min-h-11 text-xs font-semibold tabular-nums text-right hover:bg-[var(--bo-tinta-6)] ${
                    p.paid ? "text-sage-600" : "text-[var(--bo-text-muted)]"
                  } ${ESTADO} ${PRESSAO}`}
                >
                  {eur2(p.amount)}
                </button>
              )}

              <span
                className={`text-[11px] tabular-nums truncate ${overdue ? "text-[var(--bo-perigo)]" : "text-foreground/45"}`}
                title={overdue ? "Em atraso" : undefined}
              >
                {fmtRowDate(p.date)}
                {overdue && " · atraso"}
              </span>

              <span
                className="text-foreground/40 text-[11px] inline-flex min-w-0 items-center gap-1.5"
                title={p.note}
              >
                {(() => {
                  const meio = meioDoTexto(p.note);
                  return meio ? <IconeDoMeio meio={meio} /> : null;
                })()}
                <span className="truncate">{p.note || "—"}</span>
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={p.paid}
                aria-label={`Estado de ${KIND_LABEL[p.kind]} ${eur2(p.amount)}`}
                onClick={() => togglePaid(p)}
                title={p.paid ? "Pago — clique para pôr pendente" : "Pendente — clique para pago"}
                // Media 137,5 × 23,2 px no telemóvel. É o interruptor de
                // "Pago/Pendente" — o gesto que muda o Recebido lá em cima — e
                // fica encostado ao × de remover.
                className={`rounded-md px-1.5 py-0.5 pointer-coarse:min-h-11 text-[9px] tracking-[0.1em] uppercase text-center ${ESTADO} ${PRESSAO} ${
                  p.paid
                    ? "bg-sage-600/15 text-sage-600 hover:bg-sage-600/25"
                    : "bg-[var(--bo-tinta-6)] text-foreground/50 hover:bg-[var(--bo-tinta-10)]"
                }`}
              >
                {p.paid ? "Pago" : "Pendente"}
              </button>

              <div className="flex items-center justify-end gap-0.5">
                {isFailed ? (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className={`rounded-md border border-[var(--bo-perigo)]/50 px-1.5 py-0.5 text-[10px] text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/10 ${ESTADO} ${PRESSAO}`}
                  >
                    Repetir
                  </button>
                ) : (
                  <>
                    {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 8 destes botões e
                        ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                        disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                        PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                        há mesmo rato, e a 375 e a 768 com dedo ficam os 8 visíveis.

                        Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                        os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      // 18,4 × 33,6 px medidos no telemóvel, a 2 px do
                      // interruptor de Pago. Apagar um pagamento por engano é
                      // apagar dinheiro do registo, e é o alvo mais pequeno da
                      // linha — aqui a centragem do `alvo-toque` é a certa,
                      // porque o conteúdo é um símbolo.
                      className={`alvo-toque text-foreground/45 hover:text-[var(--bo-perigo)] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 p-1 ${ESTADO} ${PRESSAO}`}
                      aria-label={`Remover ${KIND_LABEL[p.kind]} ${eur2(p.amount)}`}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Fantasma: o registo que o servidor recusou. Fica à vista, marcado e
            com "Repetir" — em vez de desaparecer com um toast. */}
        {ghostFailed && failed?.ghost && (
          <div
            className={`${GRID} rounded-lg border border-[var(--bo-perigo)]/50 bg-[var(--bo-perigo)]/[0.06] px-2 py-1.5`}
          >
            <span className="text-[var(--bo-text-muted)] text-xs truncate">
              {KIND_LABEL[failed.ghost.kind]}
            </span>
            <span className="text-[var(--bo-text-muted)] text-xs font-semibold tabular-nums text-right px-1.5">
              {eur2(failed.ghost.amount)}
            </span>
            <span className="text-foreground/45 text-[11px] tabular-nums truncate">
              {fmtRowDate(failed.ghost.date)}
            </span>
            <span className="text-[var(--bo-perigo)] text-[11px] truncate">Não guardado</span>
            <span className="text-foreground/40 text-[9px] tracking-[0.1em] uppercase">—</span>
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={retryFailed}
                className={`rounded-md border border-[var(--bo-perigo)]/50 px-1.5 py-0.5 text-[10px] text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/10 ${ESTADO} ${PRESSAO}`}
              >
                Repetir
              </button>
              <button
                type="button"
                onClick={() => setFailed(null)}
                aria-label="Descartar registo não guardado"
                className={`text-foreground/45 hover:text-[var(--bo-perigo)] p-1 ${ESTADO} ${PRESSAO}`}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
