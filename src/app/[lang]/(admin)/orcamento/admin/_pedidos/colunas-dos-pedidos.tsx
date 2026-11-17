import { dataCurta } from "@/lib/data-curta";
import {
  faltaADataDoEvento,
  AVISO_SEM_DATA,
  PORQUE_FALTA_A_DATA,
} from "@/lib/orcamento/data-em-falta";
import { faltaODesfecho } from "@/lib/orcamento/desfecho";
import { diasAEsperar, pedidoParado } from "@/lib/orcamento/pedidos/espera-na-lista";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import PerguntaDeDesfecho from "../PerguntaDeDesfecho";
import type { Coluna } from "../ui";
import { eventCountdown } from "../util";
import { PastilhaDoEstado } from "./estado-do-pedido";
import { EtiquetaPossivelSpam } from "../EtiquetaPossivelSpam";

/**
 * AS COLUNAS DOS PEDIDOS — a forma de computador da mesma lista.
 *
 * A lista de pedidos é o ecrã onde ela passa mais tempo, e num monitor uma
 * pilha de cartões grandes mostra oito pedidos onde cabiam vinte e cinco. A
 * tabela existe para isso: ver muitos ao mesmo tempo, ordenar por quem espera
 * há mais tempo, e varrer com os olhos.
 *
 * O CARTÃO continua a ser o do telemóvel, intacto — foi desenhado para o
 * polegar e auditado ao toque. Isto não o substitui; convive com ele.
 */
export function COLUNAS_DE_PEDIDOS(ctx: {
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  todayStr: string;
  atual?: string;
  /** Quem está a marcar — vai para o histórico do pedido. */
  userName: string;
  /** O pedido gravado quando alguém marca o desfecho na própria linha. */
  onDesfecho: (q: Quote) => void;
  /** Mudar o estado na própria pastilha da coluna «Estado». */
  onMudarEstado: (q: Quote, status: QuoteStatus) => void;
  /**
   * Este pedido veio no lote que o «Mostrar mais» acabou de acrescentar?
   *
   * Marca a LINHA, e não anima nada por si: quem anima é o `ENTRADA_DO_LOTE`,
   * pousado no bloco da lista, que alcança o `<tr>` inteiro por `:has()`. Ver
   * a nota da constante — a razão de ser assim e não uma classe na célula.
   */
  ehDoLoteNovo?: (q: Quote) => boolean;
}): Coluna<Quote>[] {
  return [
    {
      chave: "sel",
      cabecalho: "",
      largura: "w-10",
      interactiva: true,
      celula: (q) => (
        <label className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={ctx.selectedIds.has(q.id)}
            onChange={() => ctx.toggleSelect(q.id)}
            className="h-4 w-4 accent-sage-600"
            aria-label={`Selecionar pedido de ${q.name}`}
          />
        </label>
      ),
    },
    {
      chave: "nome",
      cabecalho: "Cliente",
      ordenar: (a, b) => a.name.localeCompare(b.name, "pt"),
      celula: (q) => (
        // A marca do lote novo vai aqui e não numa célula própria: esta é a
        // coluna que existe sempre (as outras escondem-se abaixo de 1440), e
        // um atributo vazio não desenha nada nem é lido por ninguém. Quem a
        // usa é o `:has()` do `ENTRADA_DO_LOTE`, lá em cima.
        //
        // E o mesmo tecto que o «Local» (ver a nota lá): numa tabela de
        // largura automática o `truncate` sozinho não corta. MEDIDO a 1440:
        // um nome de 89 letras pôs a coluna com 630 px e a tabela com 1448
        // numa caixa de 1358 — «À espera» escondida, sem pista de que havia
        // mais. Fica no degrau de 420 da escala (§9.9: «420 — nome, local»),
        // com o nome inteiro no `title`.
        <span
          className="block max-w-105"
          title={q.name}
          data-lote-novo={ctx.ehDoLoteNovo?.(q) ? "" : undefined}
        >
          <span
            className={`block truncate ${
              ctx.atual === q.id ? "font-semibold text-sage-600" : "text-[var(--bo-text)]"
            }`}
          >
            {q.name}
          </span>
          <span className="block truncate text-[11px] text-foreground/45">{q.email}</span>
          <EtiquetaPossivelSpam valor={q.possivelSpam} className="mt-1" />
        </span>
      ),
    },
    {
      /**
       * ── «JÁ RESPONDERAM?» TAMBÉM NO COMPUTADOR ─────────────────────────
       *
       * No telemóvel a lista é uma pilha de cartões e o gesto vive no cartão;
       * no computador é ESTA tabela. Sem isto, o gesto existia no telemóvel e
       * desaparecia no portátil onde ela trabalha o dia inteiro.
       *
       * Vai por baixo do próprio estado, e NÃO numa coluna nova ao fundo: a
       * tabela já pede mais largura do que a caixa tem num portátil de 1440 (é
       * por isso que a caixa rola), e uma coluna nova no fim nascia fora do
       * ecrã — que é o oposto de «à frente dela no momento em que se lembra».
       * A pergunta é sobre o estado; fica colada a ele.
       */
      chave: "estado",
      cabecalho: "Estado",
      // A pastilha é um controlo (muda o estado): o botão que abre a linha
      // pelo teclado vai para outra coluna — ver `interactiva`.
      interactiva: true,
      celula: (q) => (
        // Um `div` e não um `span`: o componente traz a sua própria caixa de
        // bloco, e um `div` dentro de um `span` é HTML inválido — o browser
        // desfaz o aninhamento e a célula parte-se ao meio.
        <div className="min-w-[9rem]">
          <PastilhaDoEstado q={q} onMudar={ctx.onMudarEstado} />
          {faltaODesfecho(q) && (
            <PerguntaDeDesfecho
              key={`desfecho-${q.id}`}
              quote={q}
              quem={ctx.userName}
              onGravado={ctx.onDesfecho}
              variante="linha"
            />
          )}
        </div>
      ),
    },
    {
      chave: "data",
      cabecalho: "Data do evento",
      ordenar: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
      celula: (q) => {
        const cd = eventCountdown(q.date);
        return (
          <span className="whitespace-nowrap">
            {/* Era `q.date` cru: `2028-08-13`, o formato da base de dados, no
                ÚNICO ecrã onde ele chegava à frente de alguém. Em todo o resto
                da aplicação — cartões, calendário, propostas, dossier — a data
                está escrita em português. Ver `dataCurta`. */}
            {/* F-15 da auditoria: aqui estava só «—». Um travessão não é um
                aviso — é um espaço em branco com um caracter dentro. Ver
                `data-em-falta.ts` para a fronteira (só depois de a proposta
                seguir). */}
            {faltaADataDoEvento(q) ? (
              <span
                className="inline-flex items-center rounded-full bg-[var(--bo-aviso-tom)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--bo-aviso)]"
                title={PORQUE_FALTA_A_DATA}
              >
                {AVISO_SEM_DATA}
              </span>
            ) : (
              dataCurta(q.date) || "—"
            )}
            {cd && cd.tone !== "past" && (
              <span
                className={`ml-1.5 text-[10px] ${
                  cd.tone === "today" || cd.tone === "soon"
                    ? "font-medium text-[var(--bo-perigo)]"
                    : "text-foreground/45"
                }`}
              >
                {cd.label}
              </span>
            )}
          </span>
        );
      },
    },
    {
      chave: "local",
      cabecalho: "Local",
      soLargo: true,
      // Numa tabela de largura automática o `truncate` sozinho não corta: o texto
      // inteiro passa a ser a largura MÍNIMA da coluna. MEDIDO a 1440: um local
      // comprido fez a coluna com 479 px e a tabela com 1457 numa caixa de 1358
      // — «Pax» cortado e «À espera» só a deslizar. Fica no degrau de 240 da
      // escala de larguras (DESIGN-SYSTEM §9.9), com o texto inteiro no `title`.
      celula: (q) => (
        <span className="block max-w-60 truncate" title={q.location || undefined}>
          {q.location || "—"}
        </span>
      ),
    },
    {
      chave: "pax",
      cabecalho: "Pax",
      soLargo: true,
      alinharADireita: true,
      ordenar: (a, b) => (a.guests ?? 0) - (b.guests ?? 0),
      celula: (q) => <span className="tabular-nums">{q.guests || "—"}</span>,
    },
    {
      // A coluna que ela pediu, e a que muda o que se faz a seguir: quem está
      // à espera há mais tempo. Ordenar por aqui é a pergunta "a quem devo
      // responder já", que na pilha de cartões não se conseguia fazer.
      chave: "espera",
      cabecalho: "À espera",
      alinharADireita: true,
      // Os fechados vão para o FIM da ordenação, e não para o princípio: ordenar
      // por «à espera» é procurar o que está parado há mais tempo, e um trabalho
      // acabado no topo dessa lista era ruído no sítio de maior atenção.
      ordenar: (a, b) => (diasAEsperar(b) ?? -1) - (diasAEsperar(a) ?? -1),
      celula: (q) => {
        const d = diasAEsperar(q);
        if (d === null) return <span className="text-foreground/40">—</span>;
        const parado = pedidoParado(q.status, d);
        return (
          <span
            className={`tabular-nums whitespace-nowrap ${
              parado ? "font-medium text-amber-600" : "text-[var(--bo-text-muted)]"
            }`}
          >
            {d}d
          </span>
        );
      },
    },
  ];
}
