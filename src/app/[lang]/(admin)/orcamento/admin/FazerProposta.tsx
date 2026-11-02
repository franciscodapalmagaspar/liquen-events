"use client";

import { casaComAProcura } from "@/lib/procura";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { Button, Card, EmptyState } from "./ui";
// `ESTADO` já é, neste ficheiro, a tabela de estados do PEDIDO (Novo, Ganho,
// Perdido…). O primitivo de movimento entra com apelido para os dois poderem
// viver lado a lado sem que nenhum tenha de mudar de nome.
import { ESTADO as MOV_ESTADO, PRESSAO } from "./ui/movimento";
import { ProposalStudio } from "./lazy";
import AvisoDataOcupada from "./AvisoDataOcupada";
import { choquesDeData, gravidade } from "@/lib/orcamento/choque-de-datas";
import { possiveisDuplicados, porqueParece, separar } from "@/lib/orcamento/pedidos-duplicados";
import { useToast } from "./Toast";

/**
 * FAZER PROPOSTA — um ecrã com um trabalho só.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * O estúdio de propostas existia, mas escondido: era preciso ir a Pedidos,
 * abrir o pedido certo, encontrar o separador "Comunicação" e rolar até ele.
 * Quatro passos e três decisões antes de escrever a primeira linha da proposta
 * — para a tarefa que traz o dinheiro a casa.
 *
 * Aqui é o contrário: escolhe-se para QUEM, e o resto do ecrã é o estúdio.
 *
 * ── Porque é que não se começa numa folha em branco ───────────────────────
 * Uma proposta é sempre PARA alguém. O estúdio precisa do nome, do tipo de
 * evento, da data e do sítio para preencher a capa, e precisa do email para
 * saber para onde a enviar — tudo isso vive no pedido. Uma proposta sem pedido
 * não teria destinatário nem forma de ser aceite.
 *
 * Por isso o primeiro passo é escolher a pessoa. E se ela ainda não estiver na
 * lista — o casal que ligou, o casamento que veio por recomendação — há ali o
 * botão para a criar sem sair do ecrã.
 *
 * ── A ordem da lista não é alfabética, é por urgência ─────────────────────
 * À cabeça vêm os pedidos que ainda ESPERAM proposta (novos e em revisão), e
 * dentro desses os de data de evento mais próxima. É a ordem por que o trabalho
 * se faz.
 *
 * ── E SÓ OS QUE AINDA NÃO TÊM PROPOSTA ────────────────────────────────────
 * Palavras dela, com a lista à frente: «quero que aqui o sistema retire as
 * propostas que já foram feitas e fique apenas as que ainda não se fizeram».
 * Quem já tem proposta enviada (ou ganha, ou perdida) NÃO aparece aqui: está em
 * «Propostas», que é onde as feitas se reveem, e continua a abrir-se no estúdio
 * pelo pedido. Uma procura que só encontre um desses di-lo, e leva lá.
 *
 * ── E OS QUE ESTÃO A AGUARDAR RESPOSTA TAMBÉM SAEM ────────────────────────
 * Palavras dela, com um «Aguardar resposta» na captura: «mesmo para as que
 * estão a aguardar resposta retira do fazer proposta». Fica só o que é NOVO —
 * ninguém lhe respondeu ainda. Um pedido em «Aguardar resposta» já teve
 * mensagem nossa e está do lado do cliente.
 *
 * O estado não volta sozinho a «Novo» quando o cliente responde (`ESTADO_APOS`,
 * em `estado-do-pedido.ts`, só sobe). Por isso a procura por um desses não se
 * cala: diz onde ele está e oferece «Fazer a proposta na mesma» — é o caminho
 * daqui para o casal que entretanto respondeu.
 */

/**
 * UM SÓ SISTEMA DE ESTADOS.
 *
 * Os mesmos rótulos do resto do back office, e uma rampa de cor só: o mesmo
 * verde da casa a ganhar corpo à medida que o pedido avança no funil — Novo,
 * Aguardar resposta, Proposta enviada, Ganho. «Perdido» sai da rampa e fica
 * cinzento, que é o que ele é: fora do funil.
 *
 * «Novo» era o único cinzento no meio de quatro verdes, o que o lia como
 * "apagado" quando é precisamente o que ainda está todo por fazer. Passa a ser
 * o primeiro degrau da rampa, com um anel fino a marcá-lo como o que espera
 * por ela.
 */
const ESTADO: Record<QuoteStatus, { label: string; classe: string }> = {
  pendente: {
    label: "Novo",
    classe: "bg-sage-600/10 text-sage-600 ring-1 ring-inset ring-sage-600/30",
  },
  em_revisao: { label: "Aguardar resposta", classe: "bg-sage-600/18 text-sage-600" },
  // A tinta do texto e não o verde: sobre o fundo verde mais carregado destas
  // duas, o verde dava 3,4 e 3,9:1 (achado n.º 25).
  cotado: { label: "Proposta enviada", classe: "bg-sage-600/25 text-[var(--bo-text)]" },
  aceite: { label: "Ganho", classe: "bg-sage-600/35 text-[var(--bo-text)]" },
  rejeitado: { label: "Perdido", classe: "bg-[var(--bo-tinta-10)] text-foreground/30" },
};

/**
 * O estado que este ecrã existe para despachar: o pedido NOVO.
 *
 * Eram dois («Novo» e «Aguardar resposta»), com uma fila de pastilhas para
 * escolher entre eles. Com um só, as pastilhas não tinham nada para filtrar e
 * sairam — ver o cabeçalho.
 */
const POR_FAZER: QuoteStatus = "pendente";

function tipoDeEvento(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

/** O pedido bate com a procura `t` (já em minúsculas)? Vazia, bate tudo. */
function bate(t: string, q: Quote): boolean {
  return !t || casaComAProcura(t, [q.name, q.email, q.location, q.id, tipoDeEvento(q)]);
}

/** "12 de Setembro de 2026", ou o que lá estiver escrito se não for uma data
 *  (o formulário aceita "a definir"). */
function dataLegivel(iso?: string): string {
  if (!iso) return "Sem data";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
}

interface Props {
  quotes: Quote[];
  /** Pedido escolhido, guardado no pai para não se perder ao mudar de vista. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Abre o diálogo de criar um pedido à mão. */
  onNovoPedido: () => void;
  /** A proposta seguiu — o pai actualiza o estado do pedido para "cotado". */
  onSent: (quote: Quote) => void;
  /** O valor mudou no estúdio, que o grava no pedido — o pai actualiza a sua
   *  cópia para o cartão do cliente aqui em cima mostrar o mesmo. */
  onQuoteUpdated: (quote: Quote) => void;
  /**
   * Abrir o pedido deste cliente no painel de detalhe (Produção, Financeiro,
   * mensagens).
   *
   * Existe porque carregar num cliente na lista de Pedidos passou a trazer para
   * aqui: sem esta porta, as outras três ferramentas do pedido ficavam a duas
   * voltas de distância para quem entrou por ali.
   */
  onAbrirPedido: (quote: Quote) => void;
  /**
   * «Abrir esse», no aviso de possível duplicado: abre o OUTRO pedido pela
   * porta de todos (`abrirCliente`, no `AdminClient`) — a página dele, ou o
   * Dossier se já foi ganho. Sem ela, cai no `onAbrirPedido`.
   */
  onAbrirOutro?: (quote: Quote) => void;
  /** Ir para «Propostas», onde vivem as que já foram feitas. Ver a procura. */
  onIrParaPropostas?: (procura?: string) => void;
}

export default function FazerProposta({
  quotes,
  selectedId,
  onSelect,
  onNovoPedido,
  onSent,
  onQuoteUpdated,
  onAbrirPedido,
  onAbrirOutro,
  onIrParaPropostas,
}: Props) {
  const [procura, setProcura] = useState("");
  // O mesmo padrão do resto do back office: a escrita responde já, e o
  // filtro sobre a lista toda corre com prioridade mais baixa.
  const procuraAdiada = useDeferredValue(procura);

  const escolhido = useMemo(
    () => quotes.find((q) => q.id === selectedId) ?? null,
    [quotes, selectedId],
  );

  /**
   * Os pedidos novos que batem com a procura, o evento mais próximo primeiro.
   * Sem data vão para o fim: não se pode dizer que é urgente o que não tem
   * quando.
   */
  const lista = useMemo(() => {
    const t = procuraAdiada.trim().toLowerCase();
    return quotes
      .filter((q) => !q.archived && q.status === POR_FAZER && bate(t, q))
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  }, [quotes, procuraAdiada]);

  /**
   * A procura que só encontra pedidos FORA desta lista.
   *
   * Sem isto, procurar um casal com proposta enviada — ou à espera da nossa
   * mensagem — dava «Ninguém com esse nome», e o casal existe. Diz-se onde
   * está, e leva-se lá.
   */
  const foraDaLista = useMemo(() => {
    const t = procuraAdiada.trim().toLowerCase();
    if (!t) return { aAguardar: [] as Quote[], comProposta: [] as Quote[] };
    const fora = quotes.filter((q) => !q.archived && q.status !== POR_FAZER && bate(t, q));
    return {
      aAguardar: fora.filter((q) => q.status === "em_revisao"),
      comProposta: fora.filter((q) => q.status !== "em_revisao"),
    };
  }, [quotes, procuraAdiada]);
  const { aAguardar, comProposta: jaComProposta } = foraDaLista;

  /**
   * ── D1: «POSSÍVEL DUPLICADO» ──────────────────────────────────────────────
   * Sobre TODOS os pedidos e não só sobre a lista: o gémeo de um «Novo» pode
   * estar em «Aguardar resposta» (era assim o da Ana), e é precisamente esse
   * que ela não está a ver. Só aponta — juntar é sempre dela.
   */
  const duplicados = useMemo(() => possiveisDuplicados(quotes), [quotes]);
  const { toast } = useToast();
  const [aSeparar, setASeparar] = useState<string | null>(null);
  const naoSaoOMesmo = useCallback(
    async (a: Quote, b: Quote) => {
      setASeparar(a.id);
      try {
        const gravar = async (q: Quote, outro: string) => {
          const res = await fetch(`/api/orcamento/${q.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ naoDuplicados: separar(q, outro) }),
          });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as Quote;
        };
        // Nos dois: a etiqueta tem de sair dos dois cartões, e um «não» dito
        // num lado não pode voltar a acender pelo outro.
        const [na, nb] = await Promise.all([gravar(a, b.id), gravar(b, a.id)]);
        onQuoteUpdated(na);
        onQuoteUpdated(nb);
        toast("Fica registado: não são o mesmo pedido.");
      } catch {
        toast("Não foi possível guardar. Tenta outra vez daqui a pouco.", "error");
      } finally {
        setASeparar(null);
      }
    },
    [onQuoteUpdated, toast],
  );

  const porFazer = useMemo(
    () => quotes.filter((q) => !q.archived && q.status === POR_FAZER).length,
    [quotes],
  );

  /**
   * Que pedidos da lista caem em cima de um dia já comprometido.
   *
   * O aviso a sério aparece depois de escolher, com o outro evento e a
   * distância. Aqui é só uma pastilha, para a escolha não ser às cegas: se dois
   * pedidos servem igualmente bem para começar a manhã, é melhor começar pelo
   * que não vai dar problema.
   *
   * Corre sobre a lista já filtrada, não sobre as centenas todas.
   */
  const comChoque = useMemo(() => {
    const por = new Map<string, "aviso" | "grave">();
    for (const q of lista) {
      const cs = choquesDeData(q, quotes);
      if (cs.length === 0) continue;
      // A pior das colisões manda na cor. Um dia com dois eventos, um deles
      // difícil de conciliar, não é «amarelo» só porque o outro era fácil.
      por.set(q.id, cs.some((c) => gravidade(c) === "grave") ? "grave" : "aviso");
    }
    return por;
  }, [lista, quotes]);

  // ── Com cliente escolhido: o ecrã é o estúdio ────────────────────────────
  if (escolhido) {
    return (
      /**
       * ── A PÁGINA APRESENTA-SE, E EM DOIS TEMPOS ──────────────────────────
       *
       * Palavras dela: «que haja uma animação super fluida que coloca a página
       * para fazer a proposta na página toda».
       *
       * A escada é a da casa (`.bo-cena`, 600 ms, degraus de 20 ms, no máximo
       * seis) e não uma cópia nova: primeiro chega o «Proposta para ‹nome›» —
       * a resposta a «para quem é isto» —, e logo a seguir o estúdio. É a
       * ordem por que se lê, e é a mesma escada da Visão Geral e das Propostas.
       *
       * O que NÃO se fez, e porquê: um `document.startViewTransition` a
       * transformar a linha da lista no cabeçalho desta página. A casa já mediu
       * essa via e desligou-a («o snapshot da página inteira colidia com a nova
       * rota a hidratar, e a transição gaguejava» — `PageTransition.tsx`); o
       * estúdio é a superfície mais pesada do back office, e é exactamente onde
       * isso voltaria a acontecer. Uma animação que trava é o contrário de
       * fluida.
       *
       * Só `opacity` e `transform`, com `backwards` — não fica transform
       * nenhum depois, que é o que quebraria o `position: fixed` de uma folha
       * aberta aqui dentro. E `prefers-reduced-motion` desliga-a no
       * `globals.css`.
       */
      <div className="flex flex-col gap-4">
        <Card padding="md" className="bo-cena">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {/* O EVENTO, A DATA E O LOCAL SAÍRAM DAQUI.
                  Estavam escritos aqui e outra vez, duzentos pixels abaixo, nos
                  campos "Data" e "Local" da secção Evento — e eram esses que
                  saem na proposta. Duas cópias adjacentes do mesmo dado, sem
                  nada a dizer qual manda, é pior do que uma: quando divergem
                  (porque a data da proposta se escreve por extenso, ou porque o
                  espaço mudou), não há maneira de saber qual está certa. Fica o
                  nome, que é a âncora do "para quem é isto", e o botão de
                  trocar. */}
              {/* ── ISTO É CONTEÚDO, E POR ISSO NÃO LEVA VIDRO ───────────────
                  Palavras dela, com uma captura deste cartão: «e isto também»,
                  a seguir a pedir vidro na barra de acção do estúdio.

                  A barra levou; este NÃO leva, e a razão está no documento que
                  ela mandou. O sistema tem duas camadas — a FUNCIONAL
                  (navegação e controlos) e a de CONTEÚDO (dados) — e o material
                  vive só na primeira. A lista de proibições da Parte 18 abre
                  com «vidro em cartões, linhas, formulários ou fundo de
                  página»: um cartão de vidro por cima de conteúdo faz
                  desaparecer a única pista que diz o que é dado e o que é
                  comando, e o teste do documento é literal — «num screenshot,
                  consegues dizer instantaneamente o que é navegação e o que é
                  dados?».

                  O que este cartão levou foi o tratamento de CONTEÚDO da mesma
                  casa, que é onde ele estava mesmo errado: a sobrancelha em
                  caixa alta com 0,14em de tracking. O sistema novo abandonou a
                  caixa alta em cabeçalhos (Parte 6.4) — passa a legenda em
                  capitalização normal, e o nome do casal, que é a âncora do
                  «para quem é isto», sobe de `text-base` para o `title3` que o
                  mapeamento fixo dá a um título de secção. */}
              <p className="mb-0.5 text-caption text-[var(--bo-text-muted)]">Proposta para</p>
              <p className="truncate text-title3 font-semibold text-[var(--bo-text)]">
                {escolhido.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* O pedido inteiro — Produção, Financeiro, mensagens — a UMA
                  tecla. Ver `onAbrirPedido`. */}
              <Button variant="secondary" size="sm" onClick={() => onAbrirPedido(escolhido)}>
                Abrir o pedido
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
                Trocar de cliente
              </Button>
            </div>
          </div>
        </Card>

        {/* ANTES do estúdio, de propósito. Saber que o dia já está ocupado
            depois de escrever a proposta toda é saber tarde de mais. */}
        <div style={{ "--cena": 1 } as React.CSSProperties} className="bo-cena empty:hidden">
          <AvisoDataOcupada quote={escolhido} quotes={quotes} onAbrir={onSelect} />
        </div>

        {/* `key` pelo id: trocar de cliente TEM de recomeçar o estúdio do zero.
            Sem isto o React reaproveitava a instância e o rascunho de um casal
            aparecia no ecrã do seguinte. */}
        <div style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena">
          <ProposalStudio
            key={`fazer-proposta-${escolhido.id}`}
            quote={escolhido}
            quotes={quotes}
            onQuoteUpdated={onQuoteUpdated}
            onSent={() => onSent(escolhido)}
          />
        </div>
      </div>
    );
  }

  // ── Sem cliente escolhido: escolher para quem ────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <Card padding="md">
        <div className="flex flex-col gap-3">
          <div>
            {/* Sem «Passo 1 de 2»: o estúdio tem cinco passos (A2), e escolher o
                cliente fica ANTES deles — contá-lo como um passo dava duas
                contagens a discordar no mesmo fluxo. */}
            <p className="text-sm text-[var(--bo-tinta-72)]">
              Para quem é a proposta?{" "}
              {porFazer > 0 && (
                <span className="text-foreground/45">
                  {porFazer === 1 ? "1 pedido à espera" : `${porFazer} pedidos à espera`}.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Procurar por nome, email, local…"
              aria-label="Procurar cliente"
              className="bo-input min-w-[14rem] flex-1 px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            />
            <Button variant="secondary" onClick={onNovoPedido}>
              Cliente novo
            </Button>
          </div>
        </div>
      </Card>

      {lista.length === 0 && aAguardar.length > 0 ? (
        // Encontrou-se — mas está à espera do cliente, e por isso não está
        // nesta lista. Não volta sozinho a «Novo» quando o cliente responde:
        // daqui, o caminho é o botão.
        <EmptyState
          title={
            aAguardar.length === 1
              ? `${aAguardar[0].name} está a aguardar resposta`
              : `${aAguardar.length} pedidos com esse nome estão a aguardar resposta`
          }
          description="Já lhes respondeste por mensagem, e por isso não estão nesta lista. Se o cliente já respondeu, a proposta faz-se na mesma — o pedido não volta sozinho a «Novo»."
          action={
            aAguardar.length === 1
              ? { label: "Fazer a proposta na mesma", onClick: () => onSelect(aAguardar[0].id) }
              : undefined
          }
        />
      ) : lista.length === 0 && jaComProposta.length > 0 ? (
        // Encontrou-se — mas já tem proposta, e por isso não está nesta lista.
        <EmptyState
          title={
            jaComProposta.length === 1
              ? `${jaComProposta[0].name} já tem proposta`
              : `${jaComProposta.length} pedidos com esse nome já têm proposta`
          }
          description={
            jaComProposta.length === 1
              ? `Está em «${ESTADO[jaComProposta[0].status]?.label ?? jaComProposta[0].status}». As propostas já feitas reveem-se em Propostas.`
              : "As propostas já feitas reveem-se em Propostas."
          }
          action={
            onIrParaPropostas
              ? // Com a procura que ela fez: chegar à lista inteira e ter de
                // procurar outra vez era a mesma pergunta duas vezes.
                { label: "Ver em Propostas", onClick: () => onIrParaPropostas(procura.trim()) }
              : undefined
          }
        />
      ) : lista.length === 0 ? (
        <EmptyState
          title={procura ? "Ninguém com esse nome" : "Ainda não há pedidos"}
          description={
            procura
              ? "Tenta outro nome, email ou local — ou cria o cliente de raiz."
              : "Uma proposta é sempre para alguém. Cria o cliente e o estúdio abre a seguir."
          }
          action={{ label: "Cliente novo", onClick: onNovoPedido }}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((q) => {
            const choque = comChoque.get(q.id);
            const gemeos = (duplicados.get(q.id) ?? [])
              .map((d) => ({ ...d, quote: quotes.find((x) => x.id === d.id) }))
              .filter((d): d is typeof d & { quote: Quote } => Boolean(d.quote));
            const e = ESTADO[q.status] ?? {
              // Um estado que não conheçamos mostra-se cru e em cinzento, em vez
              // de rebentar o ecrã inteiro — a razão está em `status-meta.ts`.
              label: q.status,
              classe: "bg-[var(--bo-tinta-10)] text-foreground/40",
            };
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onSelect(q.id)}
                  className={`alvo-toque !justify-start w-full rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-4 text-left hover:border-sage-600/40 ${MOV_ESTADO} ${PRESSAO}`}
                >
                  {/* AS ETIQUETAS VÊM PRIMEIRO, E É DE PROPÓSITO.
                      Estavam à direita do nome, e num ecrã de 390 px «Aguardar
                      resposta» encostado à direita do cartão lia-se como um
                      botão — parecia haver ali uma acção que não existe. E
                      «Data ocupada», que é a informação com mais dinheiro em
                      jogo desta lista, ficava a seguir ao nome, apagada, e
                      muitas vezes na segunda linha depois de quebrar.

                      Passam a uma linha própria no topo do cartão, sempre no
                      mesmo sítio: primeiro o alerta de data, depois o estado. O
                      nome fica com o cartão todo para si — que é também o que
                      lhe devolve os caracteres que o truncar comia. */}
                  <span className="flex w-full flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {choque && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ring-1 ring-inset ${
                            choque === "grave"
                              ? "bg-[var(--bo-perigo)]/15 text-[var(--bo-perigo)] ring-[var(--bo-perigo)]/45"
                              : "bg-[var(--bo-aviso-tom)]/12 text-[var(--bo-aviso)] ring-[var(--bo-aviso-tom)]/45"
                          }`}
                        >
                          Data ocupada
                        </span>
                      )}
                      {gemeos.length > 0 && (
                        <span className="rounded-full bg-[var(--bo-aviso-tom)]/12 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--bo-aviso)] uppercase ring-1 ring-[var(--bo-aviso-tom)]/45 ring-inset">
                          Possível duplicado
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] uppercase ${e.classe}`}
                      >
                        {e.label}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--bo-text)]">
                        {q.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/45">
                        {tipoDeEvento(q)} · {dataLegivel(q.date)}
                        {q.location ? ` · ${q.location}` : ""}
                      </span>
                    </span>
                  </span>
                </button>
                {/* Fora do botão do cartão: um botão dentro de outro não se
                    carrega com o teclado nem se lê bem com o leitor de ecrã. */}
                {gemeos.map((g) => (
                  <div
                    key={g.id}
                    className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 text-xs text-[var(--bo-tinta-72)]"
                  >
                    <span className="min-w-0">
                      Parece o mesmo pedido que{" "}
                      <strong className="font-medium">{g.quote.name}</strong> (
                      {ESTADO[g.quote.status]?.label ?? g.quote.status}, {dataLegivel(g.quote.date)}
                      ) — {porqueParece(g.motivo)}.
                    </span>
                    <span className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => (onAbrirOutro ?? onAbrirPedido)(g.quote)}
                      >
                        Abrir esse
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={aSeparar === q.id}
                        onClick={() => void naoSaoOMesmo(q, g.quote)}
                      >
                        Não são o mesmo
                      </Button>
                    </span>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
