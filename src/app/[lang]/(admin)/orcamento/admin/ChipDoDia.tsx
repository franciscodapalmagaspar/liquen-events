"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { SAIDA, useSaidaDeUmSo } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ETIQUETA DE UM DIA — fase 03 do `docs/APPLE-CALENDARIO.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os pontos 11, 12 e 15 da auditoria dela, os três na mesma peça:
 *
 *   · «O evento trunca para "An". Uma pílula com duas letras não transporta
 *      informação nenhuma.» — o nome vinha `q.name.split(" ")[0]`, ou seja
 *      cortado À PALAVRA e sem reticências. Agora vem inteiro e é o CSS que o
 *      trunca, com reticências, no fim do espaço que houver.
 *   · «Todos os eventos são pílulas cinzentas. A cor não está a fazer trabalho
 *      nenhum.» — cada etiqueta leva o tom do seu tipo: barra de 2 px à
 *      esquerda, e um fundo a 12% da mesma cor (20% ao passar o rato), que são
 *      os números da Parte 4 do documento.
 *   · «Não há horas, num negócio em que a hora de montagem é metade do
 *      trabalho.» — a hora vem ANTES do título, em `tabular-nums`, e num tom
 *      mais calmo do que ele: quem procura as 9:00 varre a coluna das horas, e
 *      números de larguras diferentes desalinham essa coluna.
 *
 * ── A BARRA É UM `rounded-full`, E ISSO NÃO É UM DETALHE DE GOSTO ─────────
 *
 * O `Calendario.estado-nao-e-so-cor.test.tsx` procura, dentro da etiqueta de
 * um pedido, um `span.rounded-full` com `aria-hidden` — é assim que ele prova
 * que a cor é decoração e que o estado vai na PALAVRA, no nome acessível. A
 * barra da Parte 4 é a mesma peça que esse ponto: 2 px de largura, a altura da
 * etiqueta, e `rounded-full` para as pontas não ficarem em bico. Um marcador
 * só, a dizer uma coisa só.
 */

export interface ChipDoDiaProps {
  /** A cor do tipo (ou do estado do pedido), sempre um token. */
  cor: string;
  /** O glifo do tipo, para a cor nunca andar sozinha. */
  marca?: ReactNode;
  /** "09:00", quando a há. Eventos de dia inteiro não a têm. */
  hora?: string;
  titulo: string;
  /** O nome acessível: leva o tipo (ou o estado) por palavras. */
  rotulo: string;
  /** A dica do rato, com o texto completo — a Parte 4 pede-a. */
  dica: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /**
   * O menu do botão direito desta etiqueta, quando o há.
   *
   * O ponto 17 da auditoria dela é uma linha: «Não há menu de contexto no
   * evento nem no dia.» Vive AQUI, na etiqueta, e não num invólucro à volta
   * dela, porque é a etiqueta que é o alvo — um `<div>` a envolver cada uma
   * acrescentava um nó por evento em todas as células de todos os meses para
   * apanhar um gesto que a própria peça já recebe.
   */
  onMenu?: (x: number, y: number) => void;
  /**
   * `Delete` (ou `⌫`) com o foco na etiqueta — fase 10, ponto 18: «`Delete`
   * com Anular». Só as marcações o recebem; um pedido não se apaga daqui. O
   * pedido de confirmação e a Reciclagem são os da casa (`pedirParaRemover`).
   */
  onApagar?: () => void;
  /**
   * Arrastar esta etiqueta para outro dia (fase 09). Só as MARCAÇÕES o
   * recebem — um pedido não muda de data por um gesto de rato. Quem chama
   * escreve a carga e sabe o que fazer à largada (ver `Calendario.tsx`).
   */
  onArrastarInicio?: (e: DragEvent<HTMLButtonElement>) => void;
  onArrastarFim?: () => void;
  /**
   * A MESMA etiqueta, mas a encher a caixa em que está — as vistas de dia e de
   * semana (`VistasDeHoras.tsx`) posicionam-na em absoluto com a altura da
   * DURAÇÃO, e nessas a etiqueta tem de subir ao topo do bloco em vez de se
   * centrar no meio dele: um evento de três horas com o título a meio-caminho
   * lê-se como se começasse às onze e meia.
   *
   * É uma variante e não uma segunda etiqueta porque tudo o resto é igual — a
   * cor por tipo, a barra de 2 px, a hora antes do título, a truncatura, o
   * nome acessível. Uma segunda peça ao lado desta era o defeito que a Parte
   * −1 do `docs/DESIGN-SYSTEM.md` manda evitar.
   *
   * Não se resolve com `className`: o `cn()` desta casa é um juntador simples
   * (não é o `tailwind-merge`), portanto `items-start` passado de fora ficava
   * ao lado do `items-center` daqui e quem decidia era a ordem das regras no
   * CSS compilado — ou seja, ninguém.
   */
  bloco?: boolean;
  className?: string;
}

export function ChipDoDia({
  cor,
  marca,
  hora,
  titulo,
  rotulo,
  dica,
  onClick,
  onMenu,
  onApagar,
  onArrastarInicio,
  onArrastarFim,
  bloco,
  className,
}: ChipDoDiaProps) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={dica}
      onClick={onClick}
      draggable={onArrastarInicio ? true : undefined}
      onDragStart={onArrastarInicio}
      onDragEnd={onArrastarFim}
      onKeyDown={
        onApagar
          ? (e) => {
              if (e.key !== "Delete" && e.key !== "Backspace") return;
              e.preventDefault();
              e.stopPropagation();
              onApagar();
            }
          : undefined
      }
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              // A célula por baixo tem menu próprio (o do DIA). Sem esta
              // cerca, o botão direito numa etiqueta abria os dois.
              e.stopPropagation();
              onMenu(e.clientX, e.clientY);
            }
          : undefined
      }
      style={{ "--tipo": cor } as CSSProperties}
      className={cn(
        "group/chip flex w-full min-w-0 gap-1 overflow-hidden pe-1 text-start",
        /* 20 px visuais e 24 px de ALVO no dedo — os números da Parte 8 do
           `docs/APPLE-CALENDARIO.md` («chips com 20 px visuais e 24 px de alvo,
           com 4 px de folga entre eles»). O `pointer-coarse:` cresce só onde o
           dedo é grosso, portanto o desenho no computador fica como está. Não é
           o `.alvo-toque` da casa: esse força 44 px E `display: inline-flex`
           centrado, e numa célula de mês com três etiquetas isso empurrava-as
           para fora da célula. */
        bloco ? "h-full items-start py-0.5" : "min-h-5 pointer-coarse:min-h-6 items-center",
        "rounded-[var(--bo-raio-miudeza)]",
        "bg-[color-mix(in_oklab,var(--tipo)_12%,transparent)] hover:bg-[color-mix(in_oklab,var(--tipo)_20%,transparent)]",
        "text-[11px] leading-none text-[var(--bo-text)]",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sage-600/60",
        ESTADO,
        PRESSAO,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="w-0.5 shrink-0 self-stretch rounded-full bg-[var(--tipo)]"
      />
      {marca}
      {/* ── A HORA E O TÍTULO: EM FILA NO MÊS, EMPILHADOS NO BLOCO ────────
          Na célula do mês a etiqueta tem 20 px de altura e uma linha só, e a
          Parte 4 do documento manda a hora ANTES do título, na mesma linha.

          Num bloco da vista de dia a caixa tem 44 px de altura e cerca de 96
          de largura (ver `LARGURA_MINIMA_DA_COLUNA`): «09:00 Montagem Torre de
          Palma» em fila deixava ~50 px para o título, ou seja quatro
          caracteres e reticências. Isso é a pílula de duas letras que o ponto
          11 da auditoria proíbe, outra vez. Empilhados, a hora fica em cima e
          o título tem a largura toda e duas linhas. */}
      {bloco ? (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {hora && <span className="tabular-nums text-[var(--bo-text-muted)]">{hora}</span>}
          <span className="line-clamp-2 leading-tight">{titulo}</span>
        </span>
      ) : (
        <>
          {hora && (
            <span className="shrink-0 tabular-nums text-[var(--bo-text-muted)]">{hora}</span>
          )}
          <span className="truncate">{titulo}</span>
        </>
      )}
    </button>
  );
}

export interface MaisDoDiaProps {
  /** Quantas entradas ficaram de fora da célula. */
  quantos: number;
  /** O nome acessível do popover ("Sexta-feira, 10 de setembro de 2026"). */
  dia: string;
  /**
   * A célula está nas colunas da direita da semana? Então o popover abre-se
   * para dentro. O `body` desta casa tem `overflow-x: clip` — o que sair pela
   * borda direita não se recupera com o dedo nem com a barra de rolagem.
   */
  aoFim: boolean;
  children: ReactNode;
}

/**
 * O «+N mais», e o popover que ele abre.
 *
 * A Parte 4 do documento manda que o resto de um dia cheio abra num POPOVER
 * ancorado à célula — não numa folha, não noutro ecrã: «Fecha com `Esc` ou
 * clique fora». É o mesmo mecanismo do `ui/MenuDeAccoes` (o `pointerdown` e
 * não o `click`, senão o menu fecha depois de a acção de baixo já ter
 * disparado), com a saída da casa por cima.
 *
 * ── E NÃO LEVA DESFOQUE, QUE É UMA DECISÃO ────────────────────────────────
 *
 * A `.bo-material` dá-lhe o fio, o raio e a superfície; a
 * `.bo-material-desfoque` fica de fora. O `CLAUDE.md` manda contar as camadas
 * de vidro que um ecrã já tem antes de lhe pôr outra, e este já tem a cápsula
 * da navegação a flutuar no fundo em todas as larguras. Além disso o que este
 * popover tapa são células brancas de uma grelha: não há nada por baixo que
 * valha a pena dobrar, e um desfoque sobre branco é custo sem imagem.
 */
export function MaisDoDia({ quantos, dia, aoFim, children }: MaisDoDiaProps) {
  const [aberto, setAberto] = useState(false);
  const aSair = useSaidaDeUmSo(aberto);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const abridorRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // O `Esc` fecha a camada de topo E devolve o foco a quem a abriu — numa
      // grelha de trinta e cinco dias, perder o foco é percorrê-la outra vez.
      e.stopPropagation();
      setAberto(false);
      abridorRef.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  return (
    <div ref={caixaRef} className="contents">
      <button
        ref={abridorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Ver os outros ${quantos} de ${dia}`}
        onClick={(e) => {
          // A célula por baixo abre o painel do dia; este botão abre o
          // popover. Sem isto, um toque fazia as duas coisas.
          e.stopPropagation();
          setAberto((v) => !v);
        }}
        className={cn(
          "flex min-h-5 w-full items-center rounded-[var(--bo-raio-miudeza)] px-1 text-start",
          "text-[11px] leading-none text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] hover:bg-[var(--bo-tinta-3)]",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sage-600/60",
          ESTADO,
          PRESSAO,
        )}
      >
        <span className="tabular-nums">+{quantos}</span>
        <span className="ms-1">mais</span>
      </button>

      {(aberto || aSair) && (
        <div
          /* A sair já não é um diálogo: sem `role`, sem nome e fora do fio do
             teclado no INSTANTE do gesto. O que fica é uma imagem a apagar-se
             — o mesmo contrato do `ui/MenuDeAccoes`. */
          role={aSair ? undefined : "dialog"}
          aria-label={aSair ? undefined : `${dia} — tudo o que está marcado`}
          aria-hidden={aSair || undefined}
          inert={aSair}
          /* A marca que a célula por baixo lê para NÃO tratar como seu um
             clique que aconteceu aqui dentro. Um `onClick` com
             `stopPropagation` fazia o mesmo e era pior: uma cerca contra a
             bolha não é um comando, e a varredura do toque
             (`resposta-ao-toque.test.ts`) teria de a perdoar por escrito. */
          data-mais-do-dia=""
          className={cn(
            "absolute top-full z-30 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden",
            aoFim ? "end-0" : "start-0",
            "bo-material shadow-[var(--bo-sombra-suspensa)]",
            aSair ? SAIDA : "bo-entrada",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
