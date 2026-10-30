"use client";

import { useMemo, useState, useDeferredValue } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { downloadCsv, dateStamp } from "./export";
import {
  Button,
  Card,
  EmptyState,
  Segmented,
  TabelaOuCartoes,
  Toolbar,
  useAdaptativo,
  type Coluna,
} from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import { eur0 as eur } from "@/lib/money";
import {
  propostasPorPedido,
  valorDoPedido,
  type PropostaParaContas,
} from "@/lib/orcamento/dinheiro-dos-pedidos";
import { metaFor, tintaDoRotulo } from "./status-meta";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { linkDaConversa } from "@/lib/whatsapp";

// Unified status vocabulary (Novo / Aguardar resposta / Proposta enviada / Ganho / Perdido).
const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Novo", color: "#8a8a82" },
  em_revisao: { label: "Aguardar resposta", color: "#9aa36a" },
  cotado: { label: "Proposta enviada", color: "#7c854b" },
  aceite: { label: "Ganho", color: "#525a2f" },
  rejeitado: { label: "Perdido", color: "#5a5a55" },
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

/** Meio-dia LOCAL do dia civil desta data — a âncora que faz a subtração dar
 *  dias de calendário inteiros mesmo com uma mudança de hora pelo meio. */
function localNoon(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

/**
 * Há quanto tempo, em DIAS DO CALENDÁRIO — não em blocos de 24 horas.
 *
 * Dividir o intervalo em milissegundos por 86 400 000 responde a outra
 * pergunta: um pedido de ontem às 21h, visto hoje às 00h30, tem três horas e
 * meia e dizia "hoje"; um de terça à noite visto na sexta de manhã tem 2,4
 * intervalos e dizia "há 2d" quando já iam três noites sem contacto. Esta
 * coluna é o que decide a quem se liga a seguir, por isso conta-se como uma
 * pessoa conta: pelos dias que viraram (ver `eventCountdown` em util.ts).
 */
function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.round((localNoon(new Date()) - localNoon(d)) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  const months = Math.round(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

interface Client {
  /**
   * A identidade por que os pedidos foram juntos — `email || telefone || nome`,
   * em minúsculas. Guardada, e não reconstruída no sítio onde é precisa: a
   * lista identificava as linhas por `email || nome`, que é outra identidade.
   * Duas "Ana Silva" sem e-mail (metade dos pedidos que entram por telefone não
   * trazem) ficavam bem separadas em dois clientes e mal identificadas com a
   * mesma chave — o React avisava, e abrir uma sanfona abria as duas.
   */
  key: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  quotes: Quote[];
  /** O valor de cada pedido deste cliente, com IVA — a conta única (`valorDoPedido`). */
  valores: Map<string, number>;
  totalWon: number;
  totalPipeline: number;
  wonCount: number;
  rejectedCount: number;
  lastAt: string;
  /** `lastAt` em milissegundos — para ordenar sem construir um `Date` por comparação. */
  lastMs: number;
  /** Nome + email + telefone + empresa, em minúsculas, para a procura. */
  haystack: string;
  vip: boolean;
}

interface Props {
  quotes: Quote[];
  /**
   * As propostas, para a conta do dinheiro (`dinheiro-dos-pedidos.ts`): a taxa
   * de IVA que o cliente viu. Sem elas, conta-se como antes.
   */
  propostas?: PropostaParaContas[];
  onOpen: (q: Quote) => void;
  /**
   * ── «SEM CLIENTES AINDA» É UMA AFIRMAÇÃO, E ESTE ECRÃ NÃO A SABE FAZER ──
   *
   * Os clientes não são lidos aqui: formam-se a partir dos `quotes` que vêm
   * de cima, e esses vêm do desenho do servidor (`getQuotes` em page.tsx),
   * que engole a falha e devolve uma lista vazia. Vista daqui, uma leitura
   * que rebentou é indistinguível de uma agenda em branco — e o vazio diz,
   * com toda a confiança, que ela ainda não tem clientes nenhuns, quando o
   * que se passou foi a base de dados não ter respondido.
   *
   * A distinção só pode vir de quem fez a leitura. Quando vier, é este vazio
   * que sai da frente e dá lugar à razão e a uma saída; sem ela, o ecrã
   * comporta-se exactamente como antes.
   */
  falhaDeLeitura?: LeituraFalhada | null;
  /** Volta a pedir a lista de pedidos, quando quem lê sabe repeti-la. */
  aoTentarDeNovo?: () => void;
}

export default function Clientes({
  quotes,
  propostas,
  onOpen,
  falhaDeLeitura,
  aoTentarDeNovo,
}: Props) {
  const [search, setSearch] = useState("");
  // Defer the search term so the O(n) aggregate-and-filter over the full lead
  // history (and the row reconcile) runs off the keystroke: the input stays
  // instant, the list catches up a tick later. Same pattern as the main
  // AdminClient quote search.
  const dSearch = useDeferredValue(search);
  const [sort, setSort] = useState<"recent" | "value" | "pipeline">("recent");
  const [vipOnly, setVipOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // A AGREGAÇÃO (varrer todos os pedidos e juntá-los por cliente) só depende dos
  // pedidos. Estava no mesmo `useMemo` do filtro e da ordenação, por isso mudar
  // de ordenação, ligar o VIP ou escrever mais uma letra na procura obrigava a
  // refazer o varrimento inteiro — trabalho O(n) sobre centenas de pedidos para
  // chegar exactamente ao mesmo resultado. Agora são dois passos: este é caro e
  // raro; o de baixo é barato e frequente.
  //
  // De passagem, guarda-se o texto de procura já em minúsculas por cliente: era
  // um `toLowerCase()` por campo, por cliente, POR TECLA.
  const aggregated = useMemo(() => {
    const map = new Map<string, Client>();
    const porPedido = propostasPorPedido(propostas);
    for (const q of quotes) {
      const key = (q.email || q.phone || q.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          email: q.email,
          name: q.name,
          phone: q.phone,
          company: q.company,
          quotes: [],
          valores: new Map(),
          totalWon: 0,
          totalPipeline: 0,
          wonCount: 0,
          rejectedCount: 0,
          lastAt: q.submittedAt,
          lastMs: 0,
          haystack: "",
          vip: false,
        });
      }
      const c = map.get(key)!;
      c.quotes.push(q);
      /**
       * ── OS DOIS RAMOS NÃO ESTÃO NA MESMA UNIDADE ─────────────────────────
       * `q.quotedPrice` é o campo «Preço final (SEM IVA)». Somá-lo directo
       * desalinhava «Ganho» e «Pipeline» dos clientes com a «Receita
       * contratada» das Estatísticas (sempre COM IVA) em ~23%, o IVA inteiro.
       * Mesma cascata já usada em `Reminders.tsx`, `PaymentsPanel.tsx`,
       * `Overview.tsx`, `StatsDashboard.tsx` e `Kanban.tsx` — desde 14/10, a
       * conta única de `dinheiro-dos-pedidos.ts`, que é a dos outros ecrãs.
       */
      const contratado = valorDoPedido(q, porPedido.get(q.id)).comIva;
      c.valores.set(q.id, contratado);
      if (q.status === "aceite" && contratado > 0) {
        c.totalWon += contratado;
        c.wonCount++;
      }
      if (q.status === "rejeitado") c.rejectedCount++;
      if (q.status === "cotado") c.totalPipeline += contratado;
      const latestAt = q.lastUpdated ?? q.submittedAt;
      if (+new Date(latestAt) > +new Date(c.lastAt)) {
        c.lastAt = latestAt;
        c.name = q.name;
        c.phone = q.phone;
        c.company = q.company;
      }
    }
    const list = Array.from(map.values());
    for (const c of list) {
      c.lastMs = +new Date(c.lastAt);
      c.vip = c.totalWon >= 10000 || c.wonCount >= 2;
      c.haystack = [c.name, c.email, c.phone, c.company].filter(Boolean).join(" ").toLowerCase();
    }
    return list;
  }, [quotes, propostas]);

  const clients = useMemo(() => {
    let list = aggregated;
    if (vipOnly) list = list.filter((c) => c.vip);
    const s = dSearch.trim().toLowerCase();
    if (s) list = list.filter((c) => c.haystack.includes(s));
    // `sort` muta em sítio, por isso copiamos antes — `aggregated` é partilhado.
    return [...list].sort(
      sort === "value"
        ? (a, b) => b.totalWon - a.totalWon || b.lastMs - a.lastMs
        : sort === "pipeline"
          ? (a, b) => b.totalPipeline - a.totalPipeline || b.lastMs - a.lastMs
          : (a, b) => b.lastMs - a.lastMs,
    );
  }, [aggregated, dSearch, sort, vipOnly]);

  function exportCsv() {
    const rows: (string | number)[][] = [
      [
        "Nome",
        "Empresa",
        "Email",
        "Telefone",
        "Pedidos",
        "Ganho (€, com IVA)",
        "Pipeline (€, com IVA)",
        "Taxa conversão",
        "Último contacto",
      ],
      ...clients.map((c) => {
        const decided = c.wonCount + c.rejectedCount;
        const rate = decided > 0 ? `${Math.round((c.wonCount / decided) * 100)}%` : "—";
        return [
          c.name,
          c.company ?? "",
          c.email,
          c.phone ?? "",
          c.quotes.length,
          c.totalWon || "",
          c.totalPipeline || "",
          rate,
          new Date(c.lastAt).toLocaleDateString("pt-PT"),
        ];
      }),
    ];
    downloadCsv(`clientes-${dateStamp()}`, rows);
  }

  /**
   * A MESMA PERGUNTA QUE O `TabelaOuCartoes` FAZ POR DENTRO.
   *
   * A ficha aberta vive dentro do cartão no telemóvel e num painel a seguir à
   * tabela no computador — e tem de ser montada UMA vez, não duas com um
   * `hidden` pelo meio (ver `useMedida.ts`). O `montado &&` é o que impede o
   * primeiro desenho de discordar do servidor.
   */
  const { desktop, montado } = useAdaptativo();
  const emTabela = montado && desktop;
  /** Abrir a ficha deste cliente, ou fechá-la se já era ela que estava aberta. */
  const alternarFicha = (c: Client) => setOpen((o) => (o === c.key ? null : c.key));
  const aberta = open ? (clients.find((c) => c.key === open) ?? null) : null;

  return (
    <div>
      {/* Controls */}
      <Toolbar
        className="mb-6"
        start={
          <>
            <div className="relative w-full sm:w-72">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/30"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar cliente…"
                aria-label="Procurar cliente"
                className="bo-input w-full pl-10 pr-3 py-2.5 text-sm text-[var(--bo-text)] placeholder-foreground/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setVipOnly((v) => !v)}
              aria-pressed={vipOnly}
              // ── `pointer-coarse:h-11`, E É O MESMO QUE O VIZINHO JÁ FAZ ───
              // MEDIDO a 375×667 e a 320×667, com toque emulado: **69×36 px**.
              // Oito abaixo do mínimo de 44 — e, pior, oito abaixo do
              // `Segmented` que está ENCOSTADO a ele nesta mesma linha, que
              // serve `h-9 pointer-coarse:h-11` e portanto já cresce para 44
              // no dedo. Um filtro e a ordenação lado a lado, com alturas
              // diferentes: o dedo que falha o VIP acerta no «Recentes».
              //
              // A correcção é copiar a regra do vizinho em vez de inventar
              // outra — assim os dois sobem juntos e não voltam a divergir.
              // Com rato ficam ambos em 36 px, que é a densidade calma que
              // esta barra quer no portátil.
              className={`inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium ${ESTADO} ${PRESSAO} ${
                vipOnly
                  ? "bg-[var(--bo-aviso-tom)]/15 text-[var(--bo-aviso)] "
                  : /* Mesmo defeito das pastilhas de filtro: o fundo sob o rato
                       repetia o fundo em repouso. Um degrau acima. */
                    "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-10)] hover:text-[var(--bo-tinta-72)]"
              }`}
            >
              <span aria-hidden="true">★</span>
              VIP
            </button>
            <Segmented
              ariaLabel="Ordenar clientes"
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "recent", label: "Recentes" },
                { value: "value", label: "Valor ganho" },
                { value: "pipeline", label: "Pipeline" },
              ]}
            />
          </>
        }
        end={
          <>
            <span className="hidden text-xs tabular-nums text-foreground/45 sm:inline">
              {clients.length} cliente{clients.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              iconLeft={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            >
              Exportar
            </Button>
          </>
        }
      />

      {/* ── A LISTA, EM DUAS FORMAS ──────────────────────────────────────────
          Era uma linha `flex` só, igual em todas as larguras, e o bloco dos
          números estava `hidden md:flex`: ABAIXO DE 768 px a lista de clientes
          não tinha um único número — nem o ganho, nem o pipeline, nem quantos
          pedidos, nem a taxa de conversão. A empresa e a última actividade
          eram `hidden sm:inline` sem substituto nenhum, e a última actividade é
          o que ORDENA a lista por omissão: no telemóvel a ordem ficava sem
          explicação nenhuma.

          Passa a ser o `TabelaOuCartoes`: a tabela com as dez coisas a partir
          de `CORTES.desktop` (1024), e abaixo disso um cartão ESCRITO À MÃO com
          as quatro que decidem — nome (+ ★VIP), email, o que este cliente já
          rendeu, e quantos pedidos há quanto tempo. De caminho o corte deixa de
          ser os 768 px do `md:`, que este back office não usa (ver
          `ui/adaptativo.ts:53-60`) e que é exactamente a largura de um iPad em
          retrato, onde os quatro achados Críticos do MOBILE-AUDIT apareceram.

          A ORDEM É A DA BARRA DE CIMA, e por isso nenhuma coluna é ordenável:
          o `Segmented` «Recentes / Valor ganho / Pipeline» já decide a ordem da
          lista, e uma seta no cabeçalho a dizer outra coisa dava duas verdades
          para a mesma pergunta. */}
      <TabelaOuCartoes
        itens={clients}
        chaveDe={(c) => c.key}
        legenda="Clientes"
        // O cartão traz a sua própria moldura (é um `Card`) e o seu próprio
        // botão de abrir a ficha: embrulhá-lo dava duas bordas e um botão
        // dentro de outro botão.
        semMoldura
        cartao={(c) => (
          <CartaoDeCliente
            c={c}
            aberto={open === c.key}
            onAlternar={() => alternarFicha(c)}
            onOpen={onOpen}
          />
        )}
        aoAbrir={alternarFicha}
        colunas={colunasDeClientes(open, alternarFicha)}
        vazio={
          falhaDeLeitura ? (
            /* A leitura não voltou: aqui não se afirma nada sobre os clientes
               dela — nem que não há nenhum, nem que a procura não encontrou.
               Diz-se o que se passou e o passo a dar. */
            <AvisoDeFalha
              titulo="Não foi possível ler os pedidos"
              falha={falhaDeLeitura}
              aoTentarDeNovo={aoTentarDeNovo}
            />
          ) : (
            <Card padding="none">
              <EmptyState
                icon={
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                    <path
                      d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.5-1.8-4.3-4-4.8"
                      strokeLinecap="round"
                    />
                  </svg>
                }
                title={
                  search.trim() || vipOnly ? "Nenhum cliente encontrado" : "Sem clientes ainda"
                }
                description={
                  search.trim()
                    ? "Tenta procurar por outro nome, email ou empresa."
                    : vipOnly
                      ? "Ainda não há clientes VIP."
                      : "Os clientes formam-se automaticamente a partir dos pedidos recebidos."
                }
              />
            </Card>
          )
        }
      />

      {/* ── A FICHA ABERTA, NO COMPUTADOR ────────────────────────────────────
          Uma tabela não tem onde abrir uma linha sem se montar uma segunda
          árvore para a mesma lista — que é exactamente o defeito que o
          `useMedida.ts:16-21` descreve. Por isso a ficha desenha-se num sítio
          de cada vez: dentro do cartão no telemóvel, aqui a seguir à tabela no
          computador, com o nome de quem se está a ver por cima. É a MESMA
          `FichaDoCliente`, montada uma vez. */}
      {emTabela && aberta && (
        <Card padding="none" className="mt-3 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--bo-hairline)] px-5 py-3">
            <p className="truncate text-sm font-semibold text-[var(--bo-text)]">{aberta.name}</p>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
              Fechar
            </Button>
          </div>
          <FichaDoCliente c={aberta} onOpen={onOpen} />
        </Card>
      )}
    </div>
  );
}

/** A inicial do cliente — dourada quando é VIP, musgo nos outros. */
function Avatar({ c }: { c: Client }) {
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ring-2 ${c.vip ? "bg-[var(--bo-aviso-tom)]/20 text-[var(--bo-aviso)] ring-[var(--bo-aviso-tom)]/20" : "bg-sage-600 text-white ring-sage-600/10"}`}
    >
      {c.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/**
 * O QUE ESTE CLIENTE JÁ RENDEU — e é isto que faltava por inteiro no telemóvel.
 *
 * Um número só, e o que ele é: o ganho quando já há ganho, senão o pipeline
 * (dito por extenso, «pipeline», porque um número sozinho não diz se já entrou
 * ou se ainda é esperança). Os dois vêm COM IVA, como o resto da casa — ver a
 * conta única em `dinheiro-dos-pedidos.ts`.
 */
function Dinheiro({ c }: { c: Client }) {
  if (c.totalWon > 0)
    return (
      <span className="text-sage-600 text-sm font-semibold tabular-nums">{eur(c.totalWon)}</span>
    );
  if (c.totalPipeline > 0)
    return (
      <span className="text-foreground/45 text-xs tabular-nums">
        {eur(c.totalPipeline)} pipeline
      </span>
    );
  return <span className="text-foreground/25 text-xs">—</span>;
}

function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <span
      className={`text-foreground/25 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0,0,0.2,1)] ${aberto ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** A taxa de conversão, ou −1 quando ainda não há nada decidido. */
function conversao(c: Client): number {
  const decididos = c.wonCount + c.rejectedCount;
  return decididos > 0 ? Math.round((c.wonCount / decididos) * 100) : -1;
}

/**
 * O CARTÃO DO TELEMÓVEL — quatro coisas, não dez.
 *
 * nome (+ ★VIP) · email · o que já rendeu · quantos pedidos e há quanto tempo.
 * A última actividade está aqui e não escondida atrás de um `sm:` porque é ela
 * que ordena a lista por omissão: sem ela a ordem dos cartões não tem
 * explicação nenhuma.
 *
 * O que fica de fora — empresa, pipeline ao lado do ganho, taxa de conversão,
 * referência — está na tabela do computador e na ficha, a um toque daqui. Um
 * cartão que mostra tudo deixa de se poder varrer com os olhos, que é a única
 * coisa que uma lista faz bem.
 */
function CartaoDeCliente({
  c,
  aberto,
  onAlternar,
  onOpen,
}: {
  c: Client;
  aberto: boolean;
  onAlternar: () => void;
  onOpen: (q: Quote) => void;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        onClick={onAlternar}
        aria-expanded={aberto}
        className={`w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO}`}
      >
        <Avatar c={c} />

        <div className="min-w-0 flex-1">
          <p className="text-[var(--bo-text)] text-sm font-semibold truncate flex items-center gap-2">
            <span className="truncate">{c.name}</span>
            {c.vip && (
              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--bo-aviso-tom)]/15 text-[var(--bo-aviso)] text-[8px] tracking-[0.12em] uppercase font-bold">
                ★ VIP
              </span>
            )}
          </p>
          <p className="text-foreground/35 text-xs truncate mt-0.5">{c.email}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-foreground/40">
            <span>
              {c.quotes.length} pedido{c.quotes.length !== 1 ? "s" : ""}
            </span>
            <span aria-hidden="true">·</span>
            <span>{timeAgo(c.lastAt)}</span>
          </p>
        </div>

        <span className="shrink-0 flex flex-col items-end gap-1.5 text-right">
          <Dinheiro c={c} />
          <Chevron aberto={aberto} />
        </span>
      </button>

      {aberto && (
        <div className="border-t border-[var(--bo-hairline)]">
          <FichaDoCliente c={c} onOpen={onOpen} />
        </div>
      )}
    </Card>
  );
}

/**
 * AS DEZ COISAS DA TABELA — as mesmas que a linha `flex` já mostrava no
 * computador, agora numa tabela a sério, com cabeçalhos com nome.
 *
 * `soLargo` na empresa e na conversão: são contexto, e a coluna da navegação
 * come 336 px do ecrã. Só aparecem quando há mesmo espaço (≥1440).
 */
function colunasDeClientes(aberto: string | null, alternar: (c: Client) => void): Coluna<Client>[] {
  return [
    {
      chave: "cliente",
      cabecalho: "Cliente",
      celula: (c) => (
        <span className="flex items-center gap-2.5">
          <Avatar c={c} />
          <span className="min-w-0">
            <span className="block truncate text-[var(--bo-text)]">{c.name}</span>
            {c.vip && (
              <span className="mt-0.5 inline-flex items-center rounded-full bg-[var(--bo-aviso-tom)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--bo-aviso)]">
                ★ VIP
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      chave: "email",
      cabecalho: "Email",
      celula: (c) => <span className="block max-w-[220px] truncate bo-text-muted">{c.email}</span>,
    },
    {
      chave: "empresa",
      cabecalho: "Empresa",
      soLargo: true,
      celula: (c) => (
        <span className="block max-w-[180px] truncate text-foreground/45">{c.company || "—"}</span>
      ),
    },
    {
      chave: "ganho",
      cabecalho: "Ganho",
      alinharADireita: true,
      celula: (c) =>
        c.totalWon > 0 ? (
          <span className="font-semibold tabular-nums text-sage-600">{eur(c.totalWon)}</span>
        ) : (
          <span className="text-foreground/25">—</span>
        ),
    },
    {
      chave: "pipeline",
      cabecalho: "Pipeline",
      alinharADireita: true,
      celula: (c) =>
        c.totalPipeline > 0 ? (
          <span className="tabular-nums text-foreground/50">{eur(c.totalPipeline)}</span>
        ) : (
          <span className="text-foreground/25">—</span>
        ),
    },
    {
      chave: "pedidos",
      cabecalho: "Pedidos",
      alinharADireita: true,
      largura: "w-20",
      celula: (c) => (
        <span className="tabular-nums text-[var(--bo-text-muted)]">{c.quotes.length}</span>
      ),
    },
    {
      chave: "conversao",
      cabecalho: "Conversão",
      soLargo: true,
      alinharADireita: true,
      celula: (c) => {
        const taxa = conversao(c);
        return taxa < 0 ? (
          <span className="text-foreground/25">—</span>
        ) : (
          <span
            className={`tabular-nums font-medium ${taxa >= 50 ? "text-sage-600" : taxa >= 25 ? "text-foreground/50" : "text-foreground/35"}`}
          >
            {taxa}%
          </span>
        );
      },
    },
    {
      chave: "ultima",
      cabecalho: "Última atividade",
      celula: (c) => (
        <span className="whitespace-nowrap text-foreground/45">{timeAgo(c.lastAt)}</span>
      ),
    },
    {
      chave: "ficha",
      cabecalho: "",
      largura: "w-28",
      alinharADireita: true,
      celula: (c) => (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={aberto === c.key}
          onClick={(e) => {
            e.stopPropagation();
            alternar(c);
          }}
        >
          {aberto === c.key ? "Fechar" : "Ver ficha"}
        </Button>
      ),
    },
  ];
}

/**
 * A FICHA ABERTA — os contactos e o histórico de pedidos deste cliente.
 *
 * Escrita uma vez e montada num sítio de cada vez (dentro do cartão no
 * telemóvel, num painel a seguir à tabela no computador). Duas cópias com
 * `hidden` davam dois componentes montados a partilhar o mesmo estado — ver
 * `useMedida.ts`.
 */
function FichaDoCliente({ c, onOpen }: { c: Client; onOpen: (q: Quote) => void }) {
  const decided = c.wonCount + c.rejectedCount;
  const convRate = conversao(c);
  // O número que o `wa.me` entende — um antigo «912…» ganha o 351 (ver
  // `numeroParaWhatsApp`).
  const waLink = linkDaConversa(c.phone);

  return (
    <>
      {/* Contact bar */}
      {/* ── OS TRÊS ATALHOS DE CONTACTO LEVAM `alvo-toque` ───────
          MEDIDO a 375×667 e a 320×667, com toque emulado, com o
          cliente aberto: telefone **78×16 px**, email
          **171×16 px**, WhatsApp **75×16 px**. Dezasseis píxeis de
          altura — pouco mais de um terço do mínimo de 44 — em três
          links empilhados a 8 px uns dos outros (`gap-y-2`).

          É a barra mais irónica do back office: ligar, escrever e
          mandar WhatsApp ao cliente são as três coisas que só se
          fazem MESMO com o telemóvel na mão, e eram os três alvos
          mais pequenos de toda a vista. Um deles — o `tel:` — abre
          o marcador do telefone; falhar por um pixel e acertar no
          `mailto:` do lado troca uma chamada por um rascunho de
          email.

          `alvo-toque` cresce só no dedo, portanto a barra fina do
          portátil não muda. A altura de linha do texto continua a
          ser a mesma; o que cresce é a caixa em que se toca. */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs bg-[var(--bo-tinta-3)] border-b border-[var(--bo-hairline)]">
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            className={`alvo-toque text-foreground/45 hover:text-sage-600 flex items-center gap-1 ${ESTADO} ${PRESSAO}`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.07 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {c.phone}
          </a>
        )}
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className={`alvo-toque text-sage-600/80 hover:text-sage-600 flex items-center gap-1 ${ESTADO} ${PRESSAO}`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            {c.email}
          </a>
        )}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`alvo-toque text-sage-600 text-[10px] tracking-[0.08em] uppercase hover:opacity-75 flex items-center gap-1 ${ESTADO} ${PRESSAO}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
            </svg>
            WhatsApp
          </a>
        )}
        {/* Mini stats */}
        <div className="ml-auto flex items-center gap-3">
          {convRate >= 0 && (
            <span className="text-foreground/35">
              {convRate}% taxa de conversão ({c.wonCount}/{decided} decididos)
            </span>
          )}
        </div>
      </div>

      {/* Quote rows */}
      <div className="divide-y divide-[var(--bo-hairline)]">
        {c.quotes
          .slice()
          .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
          .map((q) => (
            <button
              key={q.id}
              onClick={() => onOpen(q)}
              className={`w-full text-left px-5 py-3 hover:bg-[var(--bo-tinta-3)] flex items-center justify-between gap-3 ${ESTADO} ${PRESSAO}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-md font-medium"
                    style={{
                      background: `${metaFor(STATUS_META, q.status).color}18`,
                      color: tintaDoRotulo(metaFor(STATUS_META, q.status).color),
                    }}
                  >
                    {metaFor(STATUS_META, q.status).label}
                  </span>
                  {q.assignedTo && (
                    <span className="text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-md bg-sage-600/10 text-sage-600 font-medium">
                      {q.assignedTo}
                    </span>
                  )}
                </div>
                <p className="text-[var(--bo-text-muted)] text-xs truncate">
                  {eventTypeLabel(q)} · {q.guests} convidados
                  {q.date
                    ? ` · ${new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}`
                    : ""}
                </p>
                {q.lostReason && (
                  <p className="text-[var(--bo-text-faint)] text-[10px] truncate mt-0.5">
                    ↳ {q.lostReason}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                {(c.valores.get(q.id) ?? 0) > 0 ? (
                  // Com IVA — para bater com o «Ganho»/«Pipeline»
                  // do cliente ali em cima, que somam o mesmo valor.
                  <span className="text-sage-600 text-xs font-medium">
                    {eur(c.valores.get(q.id) ?? 0)}
                  </span>
                ) : q.priceBreakdown?.total ? (
                  <span className="text-[var(--bo-text-faint)] text-xs">
                    ≈{eur(q.priceBreakdown.total)}
                  </span>
                ) : null}
                <p className="text-[var(--bo-text-faint)] text-[10px] font-mono">
                  {q.id.slice(-8)}
                </p>
              </div>
            </button>
          ))}
      </div>
    </>
  );
}
