"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { avancoDaEspera, esperaDemorada } from "@/lib/espera-em-curso";
import { cn } from "./cn";
import { ESTADO, FIM_VISIVEL_MS, MOLA_DE_MARCAR, PRESSAO, PROGRESSO, PULSO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ISTO ESTÁ A ACONTECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o envio de uma proposta: «quero que haja uma animação
 * que eu perceba que está a ser enviado». E depois, a olhar para o resultado:
 * «quero estes detalhes espalhados por imensas coisas».
 *
 * Este é o sítio de onde saem todos. Uma espera desenhada de doze maneiras
 * diferentes não é doze animações — é nenhuma linguagem, e o olho tem de
 * reaprender o significado em cada ecrã.
 *
 * ── AS DUAS ESPERAS ───────────────────────────────────────────────────────
 *
 * SABIDA. Passa-se `feito` e `total`: importar 312 fotos são 312 coisas, e a
 * barra diz a verdade. É sempre a melhor, e sempre que houver uma contagem é
 * esta que se usa.
 *
 * OPACA. Passa-se `estimadoMs`: um pedido, uma resposta, e no meio nada que se
 * possa contar. A barra anda depressa no princípio, vai abrandando e NUNCA
 * chega ao fim — só a resposta a fecha. Ver `espera-em-curso.ts`, que explica
 * porque é que uma barra que chega a 100% e fica lá parada estraga todas as
 * outras barras do produto.
 *
 * ── AS REGRAS QUE ISTO NÃO QUEBRA ─────────────────────────────────────────
 *
 * **Nenhuma animação atrasa uma tarefa.** Isto não acrescenta espera nenhuma:
 * é o retrato de uma que já existe.
 *
 * **Só `transform` e `opacity`.** A barra é um `scaleX` e não uma largura em
 * percentagem: mudar a largura obriga o navegador a refazer a linha a cada
 * tique, e num telemóvel isso vê-se. O `transform` é composto sem repintar.
 *
 * **Com movimento reduzido fica tudo.** A barra continua a encher, sem
 * transição a suavizar os saltos, e o ponto deixa de pulsar. O que ela precisa
 * de saber — que está a andar — não é um enfeite, e tirá-lo era deixar quem
 * pediu menos movimento sem informação nenhuma.
 *
 * **Ninguém fala por cima.** É um `role="status"` com `aria-live="polite"`, e
 * a frase muda poucas vezes de propósito: um leitor de ecrã a anunciar uma
 * percentagem cinco vezes por segundo é ruído, não é acesso.
 */

/** De quanto em quanto tempo a barra reconsidera. */
const TIQUE_MS = 200;

/**
 * O tempo decorrido desde que isto foi montado, em milissegundos.
 *
 * `Date.now` e não um contador de tiques: um separador em segundo plano
 * engasga os temporizadores, e ao voltar a barra tem de estar onde o RELÓGIO a
 * pôs — não onde os tiques que não correram a deixaram.
 *
 * Exportado porque há esperas que já têm o seu próprio desenho e só precisam
 * do relógio.
 */
export function useDecorrido(activo = true): number {
  const [decorrido, setDecorrido] = useState(0);
  const inicio = useRef(0);
  useEffect(() => {
    if (!activo) {
      setDecorrido(0);
      return;
    }
    inicio.current = Date.now();
    const t = setInterval(() => setDecorrido(Date.now() - inicio.current), TIQUE_MS);
    return () => clearInterval(t);
  }, [activo]);
  return decorrido;
}

/**
 * ── O FIM QUE SE VÊ ──────────────────────────────────────────────────────
 *
 * Quem chama montava o `EmCurso` enquanto esperava e desmontava-o quando a
 * resposta chegava — e assim a barra NUNCA era vista a acabar: estava a 85% e
 * desaparecia. Para quem olhava, era igual a ter desistido.
 *
 * Este hook diz quando mostrar e quando dizer «pronto»: enquanto `aCorrer`,
 * mostra; quando passa a falso e correu BEM (`ok`), fica mais
 * {@link FIM_VISIVEL_MS} com `concluido` — a barra cheia e o visto — e só
 * depois sai. Quando correu mal sai logo: quem diz o erro é o aviso de erro,
 * e uma barra cheia por cima de um erro era uma mentira.
 *
 * O estado anterior lê-se DURANTE o desenho (o padrão do React para «mudou a
 * prop»), e não num efeito: assim o primeiro desenho depois da resposta já é o
 * do «pronto», sem um fotograma vazio pelo meio.
 */
export function useFimVisivel(
  aCorrer: boolean,
  ok = true,
): { mostrar: boolean; concluido: boolean } {
  const [antes, setAntes] = useState(aCorrer);
  const [fim, setFim] = useState(false);
  if (antes !== aCorrer) {
    setAntes(aCorrer);
    setFim(!aCorrer && ok);
  }
  useEffect(() => {
    if (!fim) return;
    const t = setTimeout(() => setFim(false), FIM_VISIVEL_MS);
    return () => clearTimeout(t);
  }, [fim]);
  return { mostrar: aCorrer || fim, concluido: fim && !aCorrer };
}

/**
 * «1,2 de 5,1 MB», «340 de 820 KB»: a contagem de uma descarga, em palavras de
 * gente. As duas metades na MESMA unidade — a do total —, senão «340 de
 * 5,1 MB» lia-se como 340 MB.
 */
export function contagemEmBytes(feito: number, total: number): string {
  const mb = total >= 1024 * 1024;
  const div = mb ? 1024 * 1024 : 1024;
  const f = (n: number) =>
    (n / div).toLocaleString("pt-PT", { useGrouping: "always", maximumFractionDigits: mb ? 1 : 0 });
  return `${f(Math.min(feito, total))} de ${f(total)} ${mb ? "MB" : "KB"}`;
}

export interface EmCursoProps {
  /**
   * O que está a acontecer, na primeira pessoa do que o computador faz: «A
   * enviar o email…», «A gerar as miniaturas…».
   *
   * Nunca um facto consumado enquanto não o é: «A enviar», e não «Enviado».
   * Quem dá uma coisa por feita é a resposta, e enquanto isto está no ecrã a
   * resposta não chegou.
   */
  titulo: ReactNode;
  /** Quantas já foram. Com `total`, faz a barra dizer a verdade. */
  feito?: number;
  /** Quantas são ao todo. */
  total?: number;
  /**
   * Quanto é que isto costuma demorar, para a espera OPACA. Ignorado quando há
   * `total`. Sem um nem outro fica só o ponto a pulsar e a frase — que é
   * honesto, e melhor do que uma barra inventada.
   */
  estimadoMs?: number;
  /** A linha pequena por baixo: a consequência, o aviso, o destinatário. */
  nota?: ReactNode;
  /** Quando a espera se arrastar muito mais do que o previsto. Só na opaca. */
  notaDemorada?: ReactNode;
  /** Um «Parar», quando parar é possível e seguro. */
  aoParar?: () => void;
  rotuloDoParar?: string;
  /**
   * Acabou, e bem: a barra enche, o ponto passa a visto (com a mola de
   * marcar) e a frase passa a ser a de {@link pronto}. Quem o liga é o
   * {@link useFimVisivel}, que o mantém à vista o tempo de se ler.
   */
  concluido?: boolean;
  /** A frase do fim: «PDF pronto», «Cópia guardada». */
  pronto?: ReactNode;
  /** A contagem é em BYTES: escreve-se «1,2 de 5,1 MB» e não «1258291 de…». */
  emBytes?: boolean;
  /**
   * Numa linha só, sem cartão: o ponto, a frase e a barra ao lado. É a forma
   * das barras finas (o «Rever e enviar» no ecrã largo, 14/10), onde um cartão
   * de três linhas partia a barra em duas. As notas não cabem e não se dizem.
   */
  emLinha?: boolean;
  className?: string;
}

export function EmCurso({
  titulo,
  feito,
  total,
  estimadoMs,
  nota,
  notaDemorada,
  aoParar,
  rotuloDoParar = "Parar",
  concluido = false,
  pronto = "Pronto",
  emBytes = false,
  emLinha = false,
  className,
}: EmCursoProps) {
  const decorrido = useDecorrido(!concluido);
  const sabida = typeof feito === "number" && typeof total === "number" && total > 0;
  const cego = avancoDaEspera(decorrido, estimadoMs ?? 0);
  /**
   * ── A BARRA NUNCA ANDA PARA TRÁS ──────────────────────────────────────────
   *
   * Uma descarga espera primeiro às cegas (o servidor a desenhar o PDF) e só
   * depois sabe o tamanho. Medido com a rede lenta, no mapa de mesas: a barra
   * cega ia nos 95 %, chegavam os primeiros bytes e ela caía para 32 %. Agora
   * guarda-se onde a espera cega estava quando o tamanho chegou, e os bytes
   * enchem o que FALTA a partir daí. A contagem continua a dizer os bytes
   * verdadeiros.
   */
  const [base, setBase] = useState<number | null>(null);
  if (sabida && base === null) setBase(cego);
  if (!sabida && base !== null) setBase(null);
  const daBase = sabida ? (base ?? cego) : 0;
  const avanco = concluido
    ? 1
    : sabida
      ? daBase + (1 - daBase) * Math.min(1, Math.max(0, feito! / total!))
      : cego;
  const demorada =
    !concluido && !sabida && !!notaDemorada && esperaDemorada(decorrido, estimadoMs ?? 0);
  const temBarra = concluido || sabida || (estimadoMs ?? 0) > 0;

  if (emLinha) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-w-0 items-center gap-2 text-xs font-medium text-sage-600",
          className,
        )}
      >
        {concluido ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            data-em-curso="visto"
            className={`h-3 w-3 shrink-0 ${MOLA_DE_MARCAR}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2.5 6.5 2.2 2.2 4.8-5" />
          </svg>
        ) : (
          <span
            aria-hidden="true"
            data-em-curso="pulso"
            className={`h-1.5 w-1.5 shrink-0 rounded-full bg-sage-600 ${PULSO}`}
          />
        )}
        <span className="min-w-0 truncate">{concluido ? pronto : titulo}</span>
        {temBarra && (
          <span
            aria-hidden="true"
            className="block h-1 w-20 shrink-0 overflow-hidden rounded-full bg-sage-600/15"
          >
            <span
              data-barra="preenchimento"
              className={`block h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
              style={{ transform: `scaleX(${avanco})` }}
            />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full rounded-xl border border-sage-600/25 bg-sage-600/[0.05] px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-sage-600">
          {concluido ? (
            /* O visto, com a mola de marcar — o mesmo gesto do círculo de uma
               tarefa feita, porque quer dizer o mesmo: está. */
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              data-em-curso="visto"
              className={`h-3 w-3 shrink-0 ${MOLA_DE_MARCAR}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m2.5 6.5 2.2 2.2 4.8-5" />
            </svg>
          ) : (
            /* O pulso da casa (§8.2): 1,2 s, até 0,45. Era o `animate-pulse`
               do Tailwind — 2 s e até 0,5, ou seja outro ritmo. */
            <span
              aria-hidden="true"
              data-em-curso="pulso"
              className={`h-1.5 w-1.5 shrink-0 rounded-full bg-sage-600 ${PULSO}`}
            />
          )}
          <span className="min-w-0">{concluido ? pronto : titulo}</span>
        </p>
        {/* A contagem à direita e em números tabulares: sem eles, «7 de 312» a
            passar a «8 de 312» empurra a linha meio pixel a cada foto. */}
        {sabida && !concluido && (
          <span className="shrink-0 text-[11px] tabular-nums text-sage-600/70">
            {emBytes ? contagemEmBytes(feito!, total!) : `${feito} de ${total}`}
          </span>
        )}
        {aoParar && !concluido && (
          <button
            type="button"
            onClick={aoParar}
            // Sem transição nenhuma até aqui — e é o botão que pára uma espera,
            // ou seja aquele em que se carrega com pressa. É onde a resposta ao
            // toque mais se nota que falta.
            className={`alvo-toque shrink-0 rounded-lg px-2 text-[11px] text-sage-600/75 underline decoration-dotted underline-offset-2 hover:text-sage-600 active:bg-sage-600/[0.12] ${ESTADO} ${PRESSAO}`}
          >
            {rotuloDoParar}
          </button>
        )}
      </div>

      {temBarra && (
        /* Um traço cheio, encolhido por `scaleX`. `aria-hidden` porque a barra
           não diz nada que a frase e a contagem já não digam — e um
           `progressbar` vivo ao lado de um `status` vivo faz o leitor de ecrã
           anunciar a mesma espera duas vezes. */
        <span
          aria-hidden="true"
          // 4 px: o §10 do sistema de design («barra de 4 px»). Era 3.
          className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-sage-600/15"
        >
          <span
            // A marca é para os testes: o traço não tem papel nem nome (é
            // `aria-hidden`), e sem ela a única maneira de lhe chegar era
            // contar `span`s dentro de `span`s — que se cala no dia em que
            // alguém acrescentar um.
            data-barra="preenchimento"
            // `motion-safe:duration-elemento` NÃO gerava regra nenhuma: o
            // Tailwind v4 lê os utilitários `duration-*` do espaço de nomes
            // `--transition-duration-*`, e o `@theme` da casa declara
            // `--duration-elemento`. A barra corria nos 150 ms por omissão em
            // vez dos 250 ms pretendidos. Ver `movimento.ts` (ponto 3).
            className={`block h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
            style={{ transform: `scaleX(${avanco})` }}
          />
        </span>
      )}

      {!concluido && (demorada ? notaDemorada : nota) && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
          {demorada ? notaDemorada : nota}
        </p>
      )}
    </div>
  );
}
