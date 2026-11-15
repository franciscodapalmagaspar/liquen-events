"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { custosDe, margemTotal, margensPorLinha } from "@/lib/orcamento/margem";
import { normalizarValor } from "@/lib/proposal-budget";
import { kmSugerido, sugerirDeslocacao } from "@/lib/orcamento/deslocacao";
import { lerNumero } from "@/lib/numero-escrito";
import { useDefinicoesDaProposta } from "./definicoes-da-proposta";
import { foraDoPadrao, padraoPara, paxDaProposta } from "@/lib/orcamento/padrao-de-preco";
import { chaveDoServico, type Historico, type Omissao } from "@/lib/orcamento/memoria-de-precos";
import { Button } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL QUE O CLIENTE NUNCA VÊ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três coisas que só interessam a quem decide se o negócio se faz:
 *
 *   • O CUSTO de cada linha, e a margem que dele sai. O estúdio sabia o que se
 *     cobra e não sabia o que se gasta.
 *   • A DESLOCAÇÃO calculada a partir do local — quilómetros de ida e volta
 *     vezes o custo por quilómetro, com o preço do gasóleo que ela definiu.
 *   • Se o TOTAL está dentro do que ela costuma cobrar para um casamento assim.
 *   • O que JÁ COBROU por cada linha em eventos parecidos, e o que costuma
 *     incluir e falta aqui.
 *
 * ── NADA DAQUI ENTRA NO PDF ────────────────────────────────────────────────
 * Os custos vivem em `budgetCosts`, que o desenhador do PDF não lê — e há um
 * teste em `proposal-doc-pdf.test.ts` que compara as instruções de desenho com
 * e sem custos para garantir que continua assim. A única coisa que ATRAVESSA
 * para o lado do cliente é a linha da deslocação, e só quando ela carrega no
 * botão: aí passa a ser um valor adicional como os outros.
 *
 * ── PORQUE É UM PAINEL E NÃO UMA COLUNA NA TABELA DE CIMA ──────────────────
 * A tabela de cima é a que se lê a preparar a proposta para o cliente. Meter
 * lá o custo interno punha o número mais sensível da casa no meio do ecrã que
 * se roda para o lado quando alguém passa — e, com o tempo, num screenshot.
 */

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

/**
 * Os limites do campo dos quilómetros.
 *
 * INTEIRO porque a distância a um casamento não se discute às centenas de
 * metros — e porque um "180,5" ia escrito com ponto para dentro da fórmula que
 * ela lê no ecrã. TECTO em 3000 porque é um erro de dedo que se apanha aqui ou
 * se explica ao cliente depois: à volta de 3000 km ainda cabe uma viagem a
 * Espanha ou França; 18000 é um zero a mais que multiplicava a deslocação por
 * dez. VAZIO VALE, e é a peça central: um campo em branco não é zero — é «não
 * decidi», e devolve a palavra à tabela.
 */
const LIMITES_KM = {
  min: 0,
  max: 3000,
  inteiro: true,
  vazioVale: true,
  nome: "número de quilómetros",
  exemplo: "180",
} as const;

/**
 * Carrinhas: pelo menos uma, e um tecto que é uma rede contra o dedo escorregar
 * e não uma opinião sobre a frota. Seis carrinhas num evento é absurdo; 60,
 * escrito por engano, multiplicava a deslocação por sessenta numa proposta que
 * segue para um cliente.
 *
 * `vazioVale`: apagar o campo é «uma», que é a omissão — e não um erro a pintar
 * a caixa de vermelho enquanto ela apaga para escrever outro número.
 */
const LIMITES_CARRINHAS = {
  min: 1,
  max: 6,
  inteiro: true,
  vazioVale: true,
  nome: "número de carrinhas",
  exemplo: "2",
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CAMPO QUE FAZ A CONTA VALER PARA QUALQUER SÍTIO DO PAÍS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A deslocação só se calculava para as terras de uma tabela de cem nomes.
 * Fora delas o painel dizia «não reconheço o local» e não havia mais nada a
 * fazer ali: ou se escrevia a cidade grande mais próxima (e a conta ficava
 * errada, para menos), ou se punha o valor à mão nos valores adicionais (e
 * deixava de haver conta nenhuma para mostrar ao cliente).
 *
 * Aqui escrevem-se os quilómetros. A tabela continua a servir — enche o campo
 * com o que sabe, para os casos habituais não darem trabalho nenhum —, mas o
 * que fica gravado é o que ela deixar escrito.
 *
 * ── O TEXTO É LOCAL, E RE-SINCRONIZA-SE QUANDO O NÚMERO VEM DE FORA ────────
 * Mesmo problema, mesma solução do campo do gasóleo nas Definições: guardar o
 * último número que este campo EMITIU distingue o eco da própria escrita (não
 * se toca no texto, senão apagar um algarismo era impossível) de um número que
 * veio de fora — a sede a chegar das definições, ou o local a mudar —, que é a
 * única altura em que o campo tem de ser reescrito. Assim o que está no campo é
 * sempre o número que a conta está a usar.
 */
function CampoKm({
  km,
  sugerido,
  base,
  onKm,
}: {
  /** O que está gravado no documento. `undefined` = ainda nada. */
  km: number | undefined;
  /** O que a tabela sugere a partir da sede. `null` = não sabe. */
  sugerido: number | null;
  base: string;
  onKm: (km: number | null) => void;
}) {
  const idErro = useId();
  const externo = km ?? sugerido;
  const [texto, setTexto] = useState(() => (externo === null ? "" : String(externo)));
  const [erro, setErro] = useState<string | null>(null);
  const emitido = useRef<number | null>(externo);
  useEffect(() => {
    if (externo === emitido.current) return;
    emitido.current = externo;
    setTexto(externo === null ? "" : String(externo));
    setErro(null);
  }, [externo]);

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--bo-text-muted)]">Quilómetros até ao local</span>
        <input
          type="text"
          inputMode="numeric"
          value={texto}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            const escrito = e.target.value;
            setTexto(escrito);
            const leitura = lerNumero(escrito, LIMITES_KM);
            if (!leitura.ok) {
              // Não sai daqui um número que não serve. O documento fica com o
              // que tinha, e a frase diz o que fazer — em vez de o painel
              // calcular em silêncio sobre um `NaN`.
              setErro(leitura.porque);
              return;
            }
            setErro(null);
            emitido.current = leitura.valor;
            onKm(leitura.valor);
          }}
          className={`bo-input w-20 px-2 py-1.5 text-xs${erro ? " border-[var(--bo-perigo)]" : ""}`}
        />
        <span className="text-[11px] text-foreground/45">km, num sentido</span>
      </label>
      {erro ? (
        <span id={idErro} className="text-[10px] leading-relaxed text-[var(--bo-perigo)]">
          {erro}
        </span>
      ) : (
        <span className="text-[10px] leading-relaxed text-foreground/40">
          {km !== undefined
            ? "Quilómetros escritos por ti — é este número que fica na proposta."
            : sugerido !== null
              ? `≈ sugestão a partir de ${base}, medida em linha recta com folga. Corrige se souberes melhor.`
              : `Não conheço este sítio nem ${base} na tabela de distâncias. Escreve os quilómetros e a conta faz-se na mesma.`}
        </span>
      )}
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUANTAS CARRINHAS FAZEM ESTA VIAGEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «nós temos duas carrinhas para os eventos. ou seja se forem duas
 * ou se forem uma ou mais carrinhas».
 *
 * Fica ao LADO dos quilómetros, e não numa linha sua: são as duas metades da
 * mesma pergunta — «que estrada é» e «quantas vezes se faz». Separá-las punha
 * a segunda longe do número que ela muda.
 *
 * Vazio é UMA, e é por isso que não há sugestão nenhuma a preencher: uma
 * carrinha é o que acontece quase sempre, e um campo pré-cheio com «2» fazia
 * subir o preço de todas as propostas sem ninguém decidir.
 */
function CampoCarrinhas({
  carrinhas,
  onCarrinhas,
}: {
  /** O que está gravado no documento. `undefined` = uma. */
  carrinhas: number | undefined;
  onCarrinhas: (n: number | null) => void;
}) {
  const idErro = useId();
  const [texto, setTexto] = useState(() => (carrinhas === undefined ? "" : String(carrinhas)));
  const [erro, setErro] = useState<string | null>(null);
  const emitido = useRef<number | null>(carrinhas ?? null);
  useEffect(() => {
    const externo = carrinhas ?? null;
    if (externo === emitido.current) return;
    emitido.current = externo;
    setTexto(externo === null ? "" : String(externo));
    setErro(null);
  }, [carrinhas]);

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--bo-text-muted)]">Carrinhas</span>
        <input
          type="text"
          inputMode="numeric"
          value={texto}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            const escrito = e.target.value;
            setTexto(escrito);
            const leitura = lerNumero(escrito, LIMITES_CARRINHAS);
            if (!leitura.ok) {
              setErro(leitura.porque);
              return;
            }
            setErro(null);
            emitido.current = leitura.valor;
            onCarrinhas(leitura.valor);
          }}
          className={`bo-input w-14 px-2 py-1.5 text-xs${erro ? " border-[var(--bo-perigo)]" : ""}`}
        />
        <span className="text-[11px] text-foreground/45">
          {(carrinhas ?? 1) > 1 ? "carrinhas" : "carrinha"}
        </span>
      </label>
      {erro ? (
        <span id={idErro} className="text-[10px] leading-relaxed text-[var(--bo-perigo)]">
          {erro}
        </span>
      ) : (
        <span className="text-[10px] leading-relaxed text-foreground/40">
          {carrinhas === undefined
            ? "Vazio conta como uma. Escreve 2 quando saírem as duas — o gasóleo, as portagens e o desgaste são a dobrar."
            : "O custo por quilómetro é multiplicado por este número."}
        </span>
      )}
    </div>
  );
}

interface Props {
  doc: ProposalDoc;
  /** O pedido a que a proposta responde — dá o local e o nº de convidados. */
  quote: Quote;
  /** Todos os pedidos, para o padrão de preço. Vazio = sem comparação. */
  quotes?: Quote[];
  /** O total bruto que a proposta mostra. */
  totalBruto: number;
  onCusto: (i: number, custo: number | null) => void;
  /** Acrescenta a deslocação aos valores adicionais da proposta. */
  onDeslocacao: (label: string, valueText: string) => void;
  /**
   * Escreve (ou apaga) quantas carrinhas vão a este evento, NO DOCUMENTO.
   *
   * `null` apaga o campo — e apagado quer dizer UMA, que é a omissão. Não há
   * aqui a distinção entre «não decidi» e um valor: uma viagem faz-se sempre
   * com pelo menos uma carrinha.
   */
  onCarrinhas: (n: number | null) => void;
  /**
   * Escreve (ou apaga) os quilómetros até ao local NO DOCUMENTO.
   *
   * `null` quer dizer «não decidi» e devolve a palavra à tabela — não é zero,
   * que quer dizer «é aqui». Ver `ProposalDoc.kmDeslocacao`.
   */
  onKm: (km: number | null) => void;
}

export default function PainelInterno({
  doc,
  quote,
  quotes = [],
  totalBruto,
  onCusto,
  onDeslocacao,
  onKm,
  onCarrinhas,
}: Props) {
  /**
   * ── NASCE ABERTO, E FOI ELA QUE O DECIDIU ──────────────────────────────
   *
   * Palavras dela, com uma captura desta barra: «coloca esta barra já aberta
   * por definição».
   *
   * Nascia fechado, e por uma razão escrita: são custos e margem, e não é o
   * que se quer no ecrã quando alguém está ao lado a ver. Essa razão continua
   * a ser verdade — o que mudou é quem decide se vale a troca, e é ela: é o
   * escritório dela e é ela que sabe quem lhe passa por trás.
   *
   * O que se ganha é coerência com o resto do estúdio. Este painel era a ÚNICA
   * excepção ao princípio que o `Section` do `ProposalStudio.tsx` já segue por
   * escrito — «abrir a proposta mostra a proposta». Deixa de haver excepção.
   *
   * O que NÃO muda: o rótulo continua a dizer «nunca sai no PDF», que é a
   * promessa que interessa, e o interruptor continua lá para fechar quando ela
   * quiser. Fechar continua a ser um gesto de um toque.
   */
  const [aberto, setAberto] = useState(true);
  // As definições da casa — o gasóleo e a margem mínima — lidas uma vez por
  // página e partilhadas com o bloco dos totais (ver `definicoes-da-proposta`).
  const { deslocacao: parametros, margemMinima } = useDefinicoesDaProposta();
  const [memoria, setMemoria] = useState<{ historico: Historico[]; habituais: Omissao[] } | null>(
    null,
  );

  // A memória de preços. Vem do servidor porque a conta atravessa TODAS as
  // propostas já enviadas — mandá-las para cá eram três megabytes de números de
  // outros clientes por causa de uma sugestão. Lê-se uma vez por pedido: o que
  // já foi cobrado não muda enquanto se escreve.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${quote.id}/memoria`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j) setMemoria({ historico: j.historico ?? [], habituais: j.habituais ?? [] });
      })
      .catch(() => {
        // Sem memória o painel é o que era. Não se avisa: não haver histórico
        // é o estado normal de quem começou agora.
      });
    return () => {
      vivo = false;
    };
  }, [quote.id]);

  const linhas = useMemo(() => margensPorLinha(doc), [doc]);
  const total = useMemo(() => margemTotal(doc), [doc]);
  const custos = useMemo(() => custosDe(doc), [doc]);

  /**
   * ── OS QUILÓMETROS: O QUE ELA ESCREVEU, OU O QUE A TABELA SUGERE ─────────
   *
   * `doc.kmDeslocacao` é o número gravado NESTA proposta e manda sempre. Só
   * quando ele não existe é que a tabela de geografia dá um palpite a partir
   * da sede — e o campo mostra-o já preenchido, para ela o poder confirmar ou
   * corrigir de uma vez.
   *
   * A comparação com `undefined` é deliberada: zero é uma resposta legítima (o
   * evento na própria casa) e um `??` sobre um `||` trocá-la-ia em silêncio
   * pela sugestão.
   */
  const local = doc.location || quote.location;
  const sugerido = useMemo(() => kmSugerido(local, parametros.base), [local, parametros.base]);
  const kmEscritos = doc.kmDeslocacao;
  /* Ausente quer dizer UMA — ver `ProposalDoc.carrinhasDeslocacao`. Não se
     normaliza aqui para 1: o campo precisa de distinguir «vazio» de «1» para
     saber que frase de ajuda mostrar, e o motor já trata a ausência. */
  const carrinhas = doc.carrinhasDeslocacao;

  const deslocacao = useMemo(
    () => sugerirDeslocacao(local, parametros, { km: kmEscritos, carrinhas }),
    [local, parametros, kmEscritos, carrinhas],
  );

  /**
   * ── OS CONVIDADOS VÊM DA PROPOSTA, NÃO DO PEDIDO ────────────────────────
   *
   * Mesma regra dos quilómetros aqui em cima: o que está escrito NESTA proposta
   * manda, e o pedido é a rede. Se ela corrigiu os convidados aqui — porque o
   * casal mudou de ideias entre o formulário e a proposta, que é o caso normal
   * —, o intervalo habitual tem de ser o de 80 pax e não o de 120. Ver
   * `paxDaProposta`.
   */
  const paxDaqui = paxDaProposta(doc, quote);
  const fora = useMemo(
    () =>
      foraDoPadrao(totalBruto, padraoPara({ guests: paxDaqui, location: quote.location }, quotes)),
    [totalBruto, paxDaqui, quote.location, quotes],
  );

  /** O histórico ao alcance do nome de cada linha. */
  const porChave = useMemo(() => {
    const m = new Map<string, Historico>();
    for (const h of memoria?.historico ?? []) m.set(chaveDoServico(h.nome), h);
    return m;
  }, [memoria]);

  /**
   * O que costuma incluir e NÃO está nesta proposta.
   *
   * A filtragem é aqui e não no servidor porque o que conta é o rascunho que
   * está no ecrã — por gravar, e a mudar a cada linha escrita.
   */
  const esquecidos = useMemo(() => {
    const presentes = new Set(
      (doc.budgetItems ?? []).map((i) => chaveDoServico(i ?? "")).filter(Boolean),
    );
    // Os serviços também podem estar escritos como serviço e não como linha de
    // orçamento — avisar sobre um que está ali em cima, escrito, seria dar-lhe
    // razão para deixar de ler os avisos.
    for (const g of doc.serviceGroups ?? [])
      for (const it of g.items ?? []) {
        const c = chaveDoServico(it.label ?? "");
        if (c) presentes.add(c);
      }
    return (memoria?.habituais ?? []).filter((o) => !presentes.has(chaveDoServico(o.nome)));
  }, [memoria, doc.budgetItems, doc.serviceGroups]);

  const magra = total !== null && total.percentagem < margemMinima;

  return (
    <div className="mt-5 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)]">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        // `flex-wrap`: a 375 px, o título («Só para ti»), a explicação
        // («custos, margem…») e os selos de aviso viviam todos na MESMA linha,
        // sem nenhum marcado `shrink-0` — o flexbox encolhia os três em
        // conjunto, e o título (a peça mais curta) era o primeiro a chegar ao
        // fundo do poço: 45×38 px, «Só para» numa linha e «ti» sozinho na de
        // baixo. Com a quebra ligada e o título protegido (linha a seguir),
        // quem sobra sem espaço é a explicação — que pode dar-se ao luxo de
        // descer para a linha de baixo, e não de se partir a meio.
        className={`alvo-toque !justify-start flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden="true" className="text-foreground/35">
          {aberto ? "▾" : "▸"}
        </span>
        {/* `shrink-0`: três palavras, e é o título da secção — não pode ser o
            que cede espaço quando o resto da linha não cabe. */}
        <span className="shrink-0 text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--bo-text-muted)]">
          Só para ti
        </span>
        <span className="min-w-0 text-[11px] text-foreground/40">
          custos, margem, deslocação — nunca sai no PDF
        </span>
        {/* Os dois sinais que valem um olhar mesmo com o painel fechado. */}
        <span className="ml-auto flex items-center gap-1.5">
          {magra && (
            <span className="rounded-full bg-[var(--bo-perigo)]/15 px-2 py-0.5 text-[10px] tracking-[0.08em] uppercase text-[var(--bo-perigo)]">
              margem {total!.percentagem}%
            </span>
          )}
          {fora && (
            <span className="rounded-full bg-[var(--bo-aviso-tom)]/15 px-2 py-0.5 text-[10px] tracking-[0.08em] uppercase text-[var(--bo-aviso)]">
              valor fora do habitual
            </span>
          )}
        </span>
      </button>

      {/* ── O PAINEL ABRE DE ONDE SE CARREGOU ──────────────────────────────
          «Só para ti» nasce ABERTO desde que ela o pediu (ver o `useState` lá
          em cima, onde está a razão). A entrada continua a valer, e é para o
          gesto de reabrir depois de fechar: sem ela, o painel inteiro aparecia
          num fotograma por baixo do botão e o resto da página saltava para lhe
          dar lugar.

          `.bo-entrada` — 240 ms e QUATRO píxeis, a distância de um rótulo. É a
          medida certa e não os oito de uma folha: este painel não vem de fora
          do ecrã, sai do interruptor logo acima e fica preso a ele. Quatro
          píxeis é o que diz «desdobrei-me daqui» sem parecer que voou.

          NADA DE `key`. As caixas de custo aqui dentro guardam números que ela
          escreveu e ainda não gravou; um `key` remontava-as e deitava-os fora.
          A entrada vem da CLASSE do elemento que monta — e ele já montava, é o
          `{aberto && …}` de sempre. Fechar continua a seco: fechar é ela a
          arrumar o que já viu, e não há nada a apresentar.

          A classe não deixa `transform` pendurado (usa o preenchimento por
          omissão, não `forwards`), portanto não cria bloco de contenção para
          nada que aqui dentro seja `fixed` ou `sticky`. */}
      {aberto && (
        <div className="bo-entrada border-t border-[var(--bo-hairline)] p-4">
          {/* ── Custo e margem por linha ──────────────────────────────── */}
          {(doc.budgetItems ?? []).length === 0 ? (
            <p className="text-xs text-foreground/45">
              Ainda não há linhas de orçamento a que dar custo.
            </p>
          ) : (
            <>
              {/* ══════════════════════════════════════════════════════════
                  O NOME DA LINHA TINHA 13 px
                  ══════════════════════════════════════════════════════════

                  MEDIDO a 375 px, com o painel aberto sobre um orçamento de 15
                  linhas: as três colunas fixas (6rem do preço + 6rem do custo +
                  5rem da margem = 272 px) mais os três intervalos de 8 px comem
                  296 dos 309 px do painel. Ao `minmax(0,1fr)` do NOME sobravam
                  TREZE. Os nomes reais pediam entre 178 e 318 px — ou seja, o
                  que se via do nome era nada, e o que ela tinha à frente era
                  uma coluna de reticências ao lado de caixas de custo.

                  Escrever um custo ao lado de um nome que não se lê é o género
                  de ecrã que produz o custo certo na linha errada.

                  Abaixo de 640 px a linha passa a duas filas: o nome sozinho em
                  cima, com a largura toda, e o preço, o custo e a margem por
                  baixo — que é a ordem por que se lê, e a mesma manobra que as
                  linhas dos valores adicionais já fazem no estúdio. Acima de
                  640 px a grelha das quatro colunas fica exactamente como
                  estava.

                  O cabeçalho acompanha a mesma grelha (o «Linha» também ocupa a
                  fila inteira no telemóvel): um cabeçalho de quatro colunas por
                  cima de linhas de duas filas seria uma legenda para uma tabela
                  que ali não está. */}
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_5rem] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem]">
                <span className="col-span-3 sm:col-span-1">Linha</span>
                <span className="text-right">Preço</span>
                <span className="text-right">Custo</span>
                <span className="text-right">Margem</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {(doc.budgetItems ?? []).map((item, i) => {
                  const l = linhas[i];
                  const h = porChave.get(chaveDoServico(item ?? ""));
                  return (
                    <div key={i}>
                      <div className="grid grid-cols-[minmax(0,1fr)_6rem_5rem] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem]">
                        {/* `col-span-3` no telemóvel: a fila de cima é só o
                            nome, e com 309 px de largura o `truncate` já quase
                            nunca corta — os nomes desta casa pedem 178 a 318. */}
                        <span className="col-span-3 truncate text-xs text-[var(--bo-tinta-72)] sm:col-span-1">
                          {item || <span className="text-foreground/30">(sem nome)</span>}
                        </span>
                        <span className="text-right text-xs text-[var(--bo-text-muted)]">
                          {l?.preco === null ? "—" : eur(l!.preco!)}
                        </span>
                        <input
                          /**
                           * ── A CHAVE TRAZ O CUSTO GRAVADO DE VOLTA AO CAMPO ──
                           * A linha é desenhada com `key={i}`, que é a POSIÇÃO e
                           * não a linha: ao apagar uma linha do meio lá em cima,
                           * o React reaproveita o nó que sobrevive na posição e
                           * o `defaultValue` não se volta a aplicar. O campo
                           * ficava com o custo da linha ANTERIOR ao lado do nome
                           * da linha nova, e o `blur` seguinte gravava-o por
                           * cima do verdadeiro — a margem que daí sai deixava de
                           * ser a desta linha, sem nada a assinalar. Pôr o valor
                           * gravado na chave obriga o campo a nascer de novo
                           * sempre que o documento diz outra coisa; a chave não
                           * muda a cada tecla, por isso continua a poder
                           * escrever-se «1.500» sem reformatar a meio.
                           */
                          key={`custo:${i}:${custos[i]}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={custos[i] === null ? "" : String(custos[i])}
                          onBlur={(e) => onCusto(i, normalizarValor(e.target.value))}
                          placeholder="—"
                          aria-label={`Custo da linha ${i + 1}`}
                          className="bo-input px-2 py-1.5 text-right text-xs"
                        />
                        <span
                          className={`text-right text-xs ${
                            l?.percentagem === null
                              ? "text-foreground/25"
                              : l!.percentagem! < margemMinima
                                ? "text-[var(--bo-perigo)]"
                                : "text-[var(--bo-text-muted)]"
                          }`}
                        >
                          {l?.percentagem === null ? "—" : `${l!.percentagem}%`}
                        </span>
                      </div>
                      {/* ── O QUE JÁ COBROU POR ISTO ─────────────────────
                        Debaixo da linha e não numa coluna: é uma frase, e
                        uma frase espremida em 5rem não se lê. Não escreve
                        preço nenhum — mostra o que houve e ela decide. Um
                        preço posto automaticamente seria a última vez que
                        alguém pensava naquele número. */}
                      {h && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/40">
                          {`Já cobrou entre ${eur(h.min)} e ${eur(h.max)}, mediana ${eur(
                            h.mediana,
                          )}, em ${h.casos} ${h.casos === 1 ? "proposta" : "propostas"}${
                            h.regiao ? ` na zona de ${h.regiao}` : " (média do país)"
                          }`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {total && (
                <p
                  className={`mt-3 text-xs leading-relaxed ${magra ? "text-[var(--bo-perigo)]" : "text-[var(--bo-text-muted)]"}`}
                >
                  Margem de {eur(total.margem)} em {eur(total.precoComparavel)} —{" "}
                  <strong className="font-semibold">{total.percentagem}%</strong>
                  {total.parcial && (
                    <span className="text-foreground/45">
                      {" "}
                      (só {total.linhasComCusto} de {total.linhasTotais} linhas têm custo, por isso
                      é uma margem parcial)
                    </span>
                  )}
                  {magra && (
                    <span className="block mt-0.5">
                      Abaixo dos {margemMinima}% que definiu. Não impede nada.
                    </span>
                  )}
                </p>
              )}
            </>
          )}

          {/* ── O QUE COSTUMA INCLUIR E AQUI FALTA ────────────────────
              Responde à pergunta que só se faz tarde de mais: "esqueci-me de
              alguma coisa?". Só nomeia o que entra na grande maioria das
              propostas comparáveis — um serviço que entra em metade delas não é
              um esquecimento, é uma escolha, e avisar sobre ele ensinava-a a
              ignorar o aviso. */}
          {esquecidos.length > 0 && (
            <div className="mt-5 border-t border-[var(--bo-hairline)] pt-4">
              <span className="bo-eyebrow">Costuma incluir</span>
              <ul className="mt-1.5 flex flex-col gap-1">
                {esquecidos.map((o) => (
                  <li key={o.nome} className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                    <span className="text-[var(--bo-tinta-72)]">{o.nome}</span>
                    <span className="text-foreground/40">{` — em ${o.em} de ${o.de} propostas parecidas`}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/40">
                Pode ser de propósito. Fica aqui só para não ser por esquecimento.
              </p>
            </div>
          )}

          {/* ── Deslocação ───────────────────────────────────────────── */}
          <div className="mt-5 border-t border-[var(--bo-hairline)] pt-4">
            <span className="bo-eyebrow">Deslocação</span>

            {/* Os quilómetros primeiro, porque são o que decide tudo o resto —
                e porque é aqui que um sítio fora da tabela deixa de ser um
                beco sem saída. */}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
              <CampoKm km={kmEscritos} sugerido={sugerido} base={parametros.base} onKm={onKm} />
              <CampoCarrinhas carrinhas={carrinhas} onCarrinhas={onCarrinhas} />
            </div>

            {deslocacao === null ? (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                Não sei a distância a este local — não o encontro na tabela e ainda não há
                quilómetros escritos. Escreve-os aqui em cima e faço a conta.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                  <strong className="font-semibold text-[var(--bo-text)]">
                    {eur(deslocacao.valor)}
                  </strong>{" "}
                  <span className="text-foreground/45">— {deslocacao.formula}</span>
                  {deslocacao.provavelAlojamento && (
                    <span className="block text-[11px] text-[var(--bo-aviso)]">
                      A esta distância conte com dormir fora. O alojamento cobra-se à parte e não
                      está neste número.
                    </span>
                  )}
                </p>
                {!deslocacao.isento && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onDeslocacao(
                        "Deslocação da equipa Líquen",
                        `${new Intl.NumberFormat("pt-PT", {
                          useGrouping: "always",
                          style: "currency",
                          currency: "EUR",
                          minimumFractionDigits: 2,
                        }).format(deslocacao.valor)} + IVA`,
                      )
                    }
                  >
                    Pôr nos valores adicionais
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── O total está dentro do habitual? ─────────────────────── */}
          {fora && (
            <p className="mt-4 rounded-xl border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.06] p-3 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
              {paxDaqui} pax costuma ficar entre {eur(fora.padrao.min)} e {eur(fora.padrao.max)}
              {fora.padrao.regiao ? ` na zona de ${fora.padrao.regiao}` : " (média do país)"}, com
              mediana de {eur(fora.padrao.mediana)} em {fora.padrao.casos} eventos. Esta está{" "}
              {fora.lado === "abaixo" ? "abaixo" : "acima"} — confirma que não é um dígito trocado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
