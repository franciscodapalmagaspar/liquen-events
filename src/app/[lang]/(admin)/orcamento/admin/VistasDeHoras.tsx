"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { ChipDoDia } from "./ChipDoDia";
import { DIAS_DA_SEMANA } from "@/lib/orcamento/ano-do-calendario";
import { horaDoMinuto, minutosDe } from "@/lib/orcamento/guiao-do-dia";
import {
  DURACAO_ASSUMIDA,
  FIM_DA_JANELA,
  HORAS_DA_COLUNA,
  INICIO_DA_JANELA,
  LARGURA_MINIMA_DA_COLUNA,
  LARGURA_MINIMA_DA_PISTA,
  PX_POR_HORA,
  dentroDaJanela,
  disporEmPistas,
  minutoDoRelogio,
  type Posicionado,
} from "@/lib/orcamento/dia-do-calendario";
import { MINUTOS_POR_HORA } from "@/lib/orcamento/horario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VISTAS DE DIA E DE SEMANA — fases 06 e 08 do `docs/APPLE-CALENDARIO.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ponto 9 da auditoria dela: «Só existe a vista de mês. […] a **vista de
 * dia** é onde o trabalho acontece — montagem, horários, equipa.» E o ponto
 * 15: «Não há horas. Uma grelha de mês sem uma única hora, num negócio em que
 * a hora de montagem é metade do trabalho.»
 *
 * ── PORQUE É QUE AS DUAS VIVEM NO MESMO COMPONENTE ────────────────────────
 *
 * Porque a semana É a vista de dia sete vezes. A Parte 3 do documento
 * descreve-a assim, letra por letra: «sete colunas com a MESMA escala de
 * horas». Dois componentes seriam duas colunas de horas, duas linhas do agora
 * e duas maneiras de repartir a largura entre eventos sobrepostos — e no dia
 * em que uma delas mudasse, as 14:00 ficavam a alturas diferentes conforme o
 * botão em que se carregou. É o defeito que a Parte −1 do
 * `docs/DESIGN-SYSTEM.md` manda evitar acima de tudo.
 *
 * A conta — a janela, as pistas dos sobrepostos, os minutos do relógio — está
 * toda no `lib/orcamento/dia-do-calendario.ts`, que não sabe o que é um píxel.
 * A coluna de horas em si reutiliza o `horaDoMinuto` e o `MINUTOS_POR_HORA` do
 * motor do guião do dia, pela mesma razão.
 *
 * ── E NÃO LEVA VIDRO NENHUM ───────────────────────────────────────────────
 *
 * O `CLAUDE.md` manda contar as camadas de vidro que um ecrã já tem antes de
 * lhe pôr outra, e este já tem duas coisas a flutuar: a cápsula da navegação
 * no fundo e o popover do «+N mais» da grelha do mês. Estas vistas são
 * CONTEÚDO, e a Parte 5 do `docs/LIQUID-GLASS.md` é explícita: «vidro só no
 * que flutua; listas, tabelas e formulários ficam opacos».
 */

/**
 * As entradas de um dia, já traduzidas para o que se desenha.
 *
 * O componente não sabe o que é um `Quote` nem um `CalendarEvent`: recebe
 * etiquetas prontas. É de propósito — a cor de um pedido vem do ESTADO e a de
 * uma marcação vem do TIPO, e essas duas regras vivem no `Calendario.tsx`, ao
 * lado das outras duas vistas que as usam. Uma segunda tradução aqui era um
 * segundo sítio para elas discordarem.
 */
export interface EntradaDeHoras {
  /** Identidade estável — `q:LIQ-1`, `e:abc`. */
  chave: string;
  /** A cor do tipo ou do estado, sempre um token. */
  cor: string;
  /** O glifo do tipo, para a cor nunca andar sozinha. */
  marca?: ReactNode;
  /** "09:00", quando a há. Sem ela, a entrada é de dia inteiro. */
  hora?: string;
  titulo: string;
  /** O nome acessível — leva o tipo (ou o estado) por palavras. */
  rotulo: string;
  /** A dica do rato, com o texto completo. */
  dica: string;
  onAbrir: () => void;
  /** O menu do botão direito desta entrada, quando o há. */
  onMenu?: (x: number, y: number) => void;
  /** `Delete` com o foco na etiqueta faz o mesmo que o clique (só nas
   *  marcações, cujo clique é a pergunta de remover — ver `ChipDoDia`). */
  apagavel?: boolean;
  /** Rasura ao passar o rato — as marcações abrem a pergunta de remover. */
  riscarNoHover?: boolean;
}

export interface DiaDeHoras {
  /** "yyyy-mm-dd". */
  data: string;
  /** O que cai neste dia, com hora e sem ela. */
  entradas: EntradaDeHoras[];
}

export interface VistaDeHorasProps {
  /** Um dia (vista de dia) ou sete (vista de semana). */
  dias: DiaDeHoras[];
  /** "yyyy-mm-dd" de hoje. */
  hoje: string;
  /** Abrir o «Novo no calendário» num dia — o duplo clique de uma coluna. */
  onAdicionar: (data: string) => void;
  /** O menu do botão direito de um dia. */
  onMenuDoDia?: (data: string, x: number, y: number) => void;
  /** Saltar para a vista de dia a partir do cabeçalho de uma coluna. */
  onAbrirDia?: (data: string) => void;
}

/**
 * A largura da coluna das horas.
 *
 * 48 px é o mesmo número da `GrelhaDoDia.tsx` — «chegam para "02:00" a 11 px
 * com folga dos dois lados, e é o que se pode tirar a um telemóvel sem os
 * blocos deixarem de caber». Fica PRESA à esquerda durante o rolo horizontal
 * da semana: sem ela, a grelha deixa de ser uma grelha e passa a ser uma
 * mancha.
 */
const LARGURA_DAS_HORAS = 48;

/**
 * O tecto da caixa, e porque é que ela tem rolo próprio.
 *
 * Dezassete horas a 44 px são 748 px — não cabem num telemóvel, e num
 * computador comeriam o ecrã inteiro. A caixa rola por dentro, com a fila das
 * horas presa à esquerda e o cabeçalho dos dias preso em cima; é o mesmo
 * contrato da `GrelhaDoDia` e de qualquer vista de dia.
 */
const TECTO = "min(70vh, 640px)";

/** Onde a caixa se abre quando há «agora»: um terço abaixo do topo. */
const FRACAO_DO_AGORA = 1 / 3;

/**
 * A altura mínima de um bloco desenhado, em píxeis.
 *
 * Uma marcação encostada ao fim da janela (23:40, com a hora assumida a
 * terminar às 24:00) tem vinte minutos dentro da caixa — quinze píxeis. 18 é o
 * mínimo para uma linha escrita caber, que é a garantia de que nenhum bloco
 * fica a ser só uma cor. É o mesmo número, e a mesma razão, do
 * `ALTURA_MINIMA_DO_BLOCO` da `GrelhaDoDia.tsx`.
 */
const ALTURA_MINIMA_DO_BLOCO = 18;

/** O nome do dia da semana de uma data "yyyy-mm-dd". Segunda-feira primeiro. */
function diaDaSemana(iso: string): (typeof DIAS_DA_SEMANA)[number] {
  const d = new Date(`${iso}T12:00:00Z`);
  return DIAS_DA_SEMANA[(d.getUTCDay() + 6) % 7];
}

/** O número do dia no mês. */
function numeroDoDia(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Um dia com a geometria já resolvida: o que tem hora, o que não tem, e quantas pistas. */
interface DiaDisposto {
  data: string;
  semHora: EntradaDeHoras[];
  comHora: (EntradaDeHoras & Posicionado & { inicio: number; fim: number })[];
  /** Quantas pistas chega a ter esta coluna — é o que lhe dá o chão de largura. */
  pistas: number;
}

function dispor(dia: DiaDeHoras): DiaDisposto {
  const semHora = dia.entradas.filter((e) => !e.hora);
  const comHoraCrua = dia.entradas.filter((e) => minutosDe(e.hora ?? "") !== null);
  const postos = disporEmPistas(
    comHoraCrua.map((e) => {
      const inicio = minutosDe(e.hora ?? "") ?? 0;
      return { chave: e.chave, inicio, fim: Math.min(inicio + DURACAO_ASSUMIDA, FIM_DA_JANELA) };
    }),
  );
  const porChave = new Map(postos.map((p) => [p.chave, p]));
  const comHora = comHoraCrua.flatMap((e) => {
    const p = porChave.get(e.chave);
    return p ? [{ ...e, ...p }] : [];
  });
  return {
    data: dia.data,
    semHora,
    comHora,
    pistas: comHora.reduce((n, b) => Math.max(n, b.pistas), 1),
  };
}

/** A largura de chão de uma coluna: 96 px, ou o que as pistas exigirem. */
function chaoDaColuna(d: DiaDisposto): number {
  return Math.max(LARGURA_MINIMA_DA_COLUNA, d.pistas * LARGURA_MINIMA_DA_PISTA);
}

/**
 * Um bloco com hora.
 *
 * A altura é a DURAÇÃO e não um mínimo de toque: um chão de 44 px a sério
 * punha os blocos por cima uns dos outros e transformava a grelha numa mentira
 * sobre o dia — é a mesma decisão, e quase a mesma frase, que está escrita na
 * `GrelhaDoDia.tsx`. O que aqui garante o alvo é a duração assumida ser de uma
 * hora (ver `DURACAO_ASSUMIDA`): 44 px por hora dá exactamente os 44 px da
 * régua da casa. A LARGURA tem chão próprio (`LARGURA_MINIMA_DA_PISTA`), que é
 * o que faltava quando dois eventos repartem a mesma coluna.
 */
function Bloco({ entrada }: { entrada: DiaDisposto["comHora"][number] }) {
  const inicio = dentroDaJanela(entrada.inicio);
  const fim = dentroDaJanela(entrada.fim);
  const topo = ((inicio - INICIO_DA_JANELA) / MINUTOS_POR_HORA) * PX_POR_HORA;
  const altura = ((fim - inicio) / MINUTOS_POR_HORA) * PX_POR_HORA;
  return (
    <div
      className="absolute pe-px"
      style={{
        top: `${topo}px`,
        height: `${Math.max(altura, ALTURA_MINIMA_DO_BLOCO)}px`,
        insetInlineStart: `${(entrada.pista / entrada.pistas) * 100}%`,
        width: `${100 / entrada.pistas}%`,
      }}
    >
      <ChipDoDia
        bloco
        cor={entrada.cor}
        marca={entrada.marca}
        hora={entrada.hora}
        titulo={entrada.titulo}
        rotulo={entrada.rotulo}
        dica={entrada.dica}
        onMenu={entrada.onMenu}
        onApagar={entrada.apagavel ? entrada.onAbrir : undefined}
        onClick={(e) => {
          e.stopPropagation();
          entrada.onAbrir();
        }}
        className={entrada.riscarNoHover ? "hover:line-through" : undefined}
      />
    </div>
  );
}

/**
 * O minuto do relógio, começado a `null` e actualizado a cada minuto.
 *
 * ── PORQUE É QUE NÃO É `new Date()` NO DESENHO ────────────────────────────
 *
 * Porque este ecrã é desenhado no servidor: uma hora lida no desenho vem do
 * relógio do servidor no HTML e do relógio do browser na hidratação, e as duas
 * quase nunca dão o mesmo minuto — é um desencontro de hidratação garantido, e
 * desses que só aparecem em produção. A linha nasce a `null` (o servidor não
 * desenha linha nenhuma) e o primeiro efeito põe-na no sítio.
 *
 * O intervalo alinha-se com a VIRADA do minuto (`60 − segundos`) em vez de
 * disparar de sessenta em sessenta a partir da montagem: sem isso, uma vista
 * aberta aos 59 segundos ficava a mostrar o minuto anterior durante quase um
 * minuto inteiro. A Parte 6 do documento pede exactamente isto — «atualiza a
 * cada minuto», e sem animação nenhuma.
 */
function useMinutoDoRelogio(): number | null {
  const [minuto, setMinuto] = useState<number | null>(null);
  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;
    const bater = () => {
      const agora = new Date();
      setMinuto(minutoDoRelogio(agora));
      temporizador = setTimeout(bater, Math.max(1, 60 - agora.getSeconds()) * 1000);
    };
    bater();
    return () => clearTimeout(temporizador);
  }, []);
  return minuto;
}

/**
 * A vista de dia, e a de semana — o mesmo componente com um dia ou com sete.
 */
export function VistaDeHoras({
  dias,
  hoje,
  onAdicionar,
  onMenuDoDia,
  onAbrirDia,
}: VistaDeHorasProps) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const minuto = useMinutoDoRelogio();
  const minutoVisivel =
    minuto !== null && minuto >= INICIO_DA_JANELA && minuto <= FIM_DA_JANELA ? minuto : null;

  const dispostos = useMemo(() => dias.map(dispor), [dias]);
  const umDiaSo = dispostos.length === 1;
  const temDiaInteiro = dispostos.some((d) => d.semHora.length > 0);

  /**
   * ── AS COLUNAS SÃO A MESMA CONTA NAS TRÊS FILAS ───────────────────────────
   *
   * O cabeçalho dos dias, a faixa do dia inteiro e as pistas são três filas
   * diferentes, e as três TÊM de dar as mesmas colunas — senão a segunda-feira
   * do cabeçalho fica por cima da terça das pistas, que é o defeito mais
   * óbvio e mais fácil de deixar passar numa vista destas.
   *
   * Por isso o modelo de colunas é escrito UMA vez e as três filas recebem-no:
   * `minmax(chão, 1fr)`, com o chão a crescer com as pistas do dia. E a
   * largura total é somada à mão em vez de deixada ao `min-content` — o
   * `min-content` de uma grelha com `1fr` não honra o `minmax` de forma
   * previsível através de um `flex`, e o que se ganha em elegância perde-se
   * numa coluna que encolhe abaixo do que se mediu.
   */
  const modeloDeColunas = dispostos.map((d) => `minmax(${chaoDaColuna(d)}px, 1fr)`).join(" ");
  const larguraTotal = LARGURA_DAS_HORAS + dispostos.reduce((s, d) => s + chaoDaColuna(d), 0);

  /**
   * A caixa abre-se com o «agora» a um terço do topo — e não no cimo das
   * 07:00, que é a hora a que ninguém está a olhar às três da tarde. Só quando
   * a linha existe e está dentro da janela; caso contrário fica onde está, que
   * é o princípio do dia de trabalho.
   *
   * `useLayoutEffect` para o salto acontecer antes de pintar. A dependência é
   * a CHAVE DOS DIAS e não o minuto: a cada minuto, a caixa puxaria a página
   * de volta enquanto ela estivesse a ler o fim da tarde.
   */
  const chaveDosDias = dispostos.map((d) => d.data).join(",");
  const temAgora = minutoVisivel !== null;
  useLayoutEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || minutoVisivel === null) return;
    const alvo =
      ((minutoVisivel - INICIO_DA_JANELA) / MINUTOS_POR_HORA) * PX_POR_HORA -
      caixa.clientHeight * FRACAO_DO_AGORA;
    caixa.scrollTop = Math.max(0, alvo);
    // O minuto está de fora de propósito — ver o parágrafo acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosDias, temAgora]);

  return (
    <div
      /* ── O ROLO É DESTA CAIXA, E NÃO DA PÁGINA ───────────────────────────
         Dezassete horas a 44 px são 748 px de altura e sete colunas de 96 são
         672 de largura: nenhuma das duas cabe num telemóvel de 375. A regra da
         casa é que o CORPO nunca rola na horizontal — uma grelha pode, desde
         que dentro do seu próprio contentor, e é o que isto é.

         MEDIDO, a 375 px de janela (a coluna do calendário fica com 343, ver a
         conta da grelha do mês no `Calendario.tsx`):
           · vista de DIA — 48 das horas + 295 da coluna = 343. Sem rolo.
           · vista de SEMANA — 48 + 7×96 = 720. Rola na horizontal, e a fila
             das horas fica presa (`sticky`, à esquerda) para as 14:00 nunca
             saírem do ecrã. */
      ref={caixaRef}
      className="relative overflow-auto rounded-[var(--bo-raio-conteudo)] border border-[var(--bo-hairline)] bg-[var(--bo-surface)]"
      style={{ maxHeight: TECTO }}
    >
      <div style={{ minWidth: `${larguraTotal}px` }}>
        {/* ── O CABEÇALHO ─────────────────────────────────────────────────
            Preso em cima: a meio de um dia de dezassete horas, ninguém sabe de
            que dia é a coluna que está a ler. Leva a faixa do dia inteiro
            dentro, para as duas colarem juntas — e não uma a passar por baixo
            da outra. */}
        <div className="sticky top-0 z-20 bg-[var(--bo-surface)]">
          <div className="flex">
            <div
              className="sticky z-10 shrink-0 border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)]"
              style={{ insetInlineStart: 0, width: `${LARGURA_DAS_HORAS}px` }}
            />
            <div className="grid flex-1" style={{ gridTemplateColumns: modeloDeColunas }}>
              {dispostos.map((d) => {
                const ehHoje = d.data === hoje;
                const nome = diaDaSemana(d.data);
                const conteudo = (
                  <>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--bo-text-faint)]">
                      {umDiaSo ? nome.nome : nome.curto}
                    </span>
                    {/* Hoje é o disco cheio, exactamente como na grelha do mês
                        — e o `aria-current` diz o mesmo sem depender de o ver.
                        A cor nunca é a única via (Parte 10). */}
                    <span
                      className={cn(
                        "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] tabular-nums",
                        ehHoje
                          ? "bg-[var(--bo-accent)] font-semibold text-[var(--bo-sobre-acento)]"
                          : "text-[var(--bo-text)]",
                      )}
                    >
                      {numeroDoDia(d.data)}
                    </span>
                  </>
                );
                return (
                  <div
                    key={d.data}
                    aria-current={ehHoje ? "date" : undefined}
                    className="border-b border-s border-[var(--bo-hairline)]"
                  >
                    {onAbrirDia && !umDiaSo ? (
                      /* Sem `alvo-toque`: essa classe força `display:
                         inline-flex` com centragem no dedo, e isto é uma
                         pilha de duas linhas. Os 44 px vêm do `min-h-11`, que
                         é a mesma régua sem partir o desenho. */
                      <button
                        type="button"
                        onClick={() => onAbrirDia(d.data)}
                        aria-label={`${nome.nome}, ${numeroDoDia(d.data)} — abrir na vista de dia`}
                        className={cn(
                          "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 py-1.5",
                          "hover:bg-[var(--bo-tinta-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bo-accent)]",
                          ESTADO,
                          PRESSAO,
                        )}
                      >
                        {conteudo}
                      </button>
                    ) : (
                      <div className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 py-1.5">
                        {conteudo}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── A FAIXA DO DIA INTEIRO ───────────────────────────────────
              «eventos de dia inteiro numa faixa fixa no topo» (Parte 3). É
              onde caem os PEDIDOS — um casamento tem data e não tem hora de
              início na ficha — e as marcações sem hora.

              Só existe quando há o que lá pôr: uma faixa vazia permanente
              roubava altura à coluna de horas em todos os dias em que não
              serve para nada. */}
          {temDiaInteiro && (
            <div className="flex">
              <div
                className="sticky z-10 flex shrink-0 items-start justify-end border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)] pe-1.5 pt-1.5"
                style={{ insetInlineStart: 0, width: `${LARGURA_DAS_HORAS}px` }}
              >
                <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--bo-text-faint)]">
                  Dia
                </span>
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: modeloDeColunas }}>
                {dispostos.map((d) => (
                  <div
                    key={d.data}
                    className={cn(
                      // `gap-1` são os 4 px de folga entre etiquetas que a
                      // Parte 8 do documento pede — é a folga que impede um
                      // toque de acertar na de baixo.
                      "flex min-w-0 flex-col gap-1 border-b border-s border-[var(--bo-hairline)] p-1",
                      d.data === hoje &&
                        "bg-[color-mix(in_oklab,var(--bo-accent-lavagem)_40%,transparent)]",
                    )}
                  >
                    {d.semHora.map((e) => (
                      <ChipDoDia
                        key={e.chave}
                        cor={e.cor}
                        marca={e.marca}
                        titulo={e.titulo}
                        rotulo={e.rotulo}
                        dica={e.dica}
                        onMenu={e.onMenu}
                        onApagar={e.apagavel ? e.onAbrir : undefined}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          e.onAbrir();
                        }}
                        className={e.riscarNoHover ? "hover:line-through" : undefined}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── AS HORAS, E AS COLUNAS DOS DIAS ─────────────────────────────
            A fila das horas é um item de FLEX e não de grelha, e isso é o que
            a faz colar à esquerda: o bloco de contenção de um item de grelha é
            a célula dele (48 px de largura), e um `sticky` lá dentro não tem
            para onde se mover. Num item de flex, o bloco de contenção é a fila
            inteira — e a coluna acompanha o rolo horizontal da semana. */}
        <div className="flex">
          <div
            className="sticky z-10 shrink-0 bg-[var(--bo-surface)]"
            style={{
              insetInlineStart: 0,
              width: `${LARGURA_DAS_HORAS}px`,
              height: `${HORAS_DA_COLUNA.length * PX_POR_HORA}px`,
            }}
          >
            {HORAS_DA_COLUNA.map((h, i) => (
              <div key={h} className="relative" style={{ height: `${PX_POR_HORA}px` }}>
                {/* A hora assenta NA linha e não dentro da faixa: é onde ela
                    diz a verdade. A primeira fica dentro, senão saía pelo topo
                    da caixa. `tabular-nums` porque quem procura as 14:00 varre
                    esta coluna de cima a baixo, e números de larguras
                    diferentes desalinham essa varredura. */}
                <span
                  className={cn(
                    "absolute end-1.5 text-[10px] tabular-nums text-[var(--bo-text-faint)]",
                    i === 0 ? "top-0" : "-top-[7px]",
                  )}
                >
                  {horaDoMinuto(h)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid flex-1" style={{ gridTemplateColumns: modeloDeColunas }}>
            {dispostos.map((d) => {
              const ehHoje = d.data === hoje;
              const nome = diaDaSemana(d.data);
              return (
                <div
                  key={d.data}
                  /* A coluna de hoje leva a lavagem do acento a 40%, que é o
                     que a Parte 3 pede. É um fundo, e nunca a única via: o
                     número do cabeçalho é um disco cheio e há `aria-current`. */
                  className={cn(
                    "relative border-s border-[var(--bo-hairline)]",
                    ehHoje && "bg-[color-mix(in_oklab,var(--bo-accent-lavagem)_40%,transparent)]",
                  )}
                  style={{ height: `${HORAS_DA_COLUNA.length * PX_POR_HORA}px` }}
                  /* Duplo clique cria nesse dia — a mesma afordância que a
                     célula da grelha do mês já tem (Parte 4 do documento), e é
                     a razão de não haver aqui texto nenhum a explicá-la. */
                  onDoubleClick={() => onAdicionar(d.data)}
                  onContextMenu={
                    onMenuDoDia
                      ? (e) => {
                          e.preventDefault();
                          onMenuDoDia(d.data, e.clientX, e.clientY);
                        }
                      : undefined
                  }
                >
                  {/* As faixas das horas. `aria-hidden` porque a coluna da
                      esquerda já as nomeia — repetir dezassete horas por cada
                      um dos sete dias era ler o mesmo número cento e dezanove
                      vezes. */}
                  {HORAS_DA_COLUNA.map((h, i) => (
                    <div
                      key={h}
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-0",
                        i > 0 && "border-t border-[var(--bo-hairline)]",
                      )}
                      style={{ top: `${i * PX_POR_HORA}px`, height: `${PX_POR_HORA}px` }}
                    />
                  ))}

                  {d.comHora.map((e) => (
                    <Bloco key={e.chave} entrada={e} />
                  ))}

                  {/* ── A LINHA DO MOMENTO ATUAL ──────────────────────────
                      `--accent`, com a bolinha à esquerda, e SEM ANIMAÇÃO: a
                      Parte 6 do documento é explícita na última linha da
                      tabela — «Linha do momento atual — sem animação; atualiza
                      a cada minuto».

                      Não é `aria-hidden`: a hora a que se está é informação, e
                      quem percorre a coluna com um leitor de ecrã tem de a
                      encontrar. Vai como uma separação COM NOME, e não como
                      texto à vista — o número já está no relógio de quem lê. */}
                  {ehHoje && minutoVisivel !== null && (
                    <div
                      role="separator"
                      aria-label={`Agora, ${horaDoMinuto(minutoVisivel)}`}
                      data-agora=""
                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-[var(--bo-accent)]"
                      style={{
                        top: `${((minutoVisivel - INICIO_DA_JANELA) / MINUTOS_POR_HORA) * PX_POR_HORA}px`,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -top-[3px] size-1.5 rounded-full bg-[var(--bo-accent)]"
                        style={{ insetInlineStart: "-3px" }}
                      />
                    </div>
                  )}

                  {/* Uma coluna vazia não diz nada, e uma coluna de dia vazia
                      num calendário lê-se como uma avaria. A palavra fica no
                      nome acessível da coluna e não à vista: escrita à vista,
                      seriam sete «Sem nada marcado» numa semana em branco. */}
                  <span className="sr-only">
                    {nome.nome}, {numeroDoDia(d.data)} —{" "}
                    {d.comHora.length + d.semHora.length === 0
                      ? "sem nada marcado"
                      : `${d.comHora.length + d.semHora.length} marcações`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
