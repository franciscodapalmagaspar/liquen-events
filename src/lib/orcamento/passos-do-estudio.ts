/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CINCO PASSOS DO ESTÚDIO — A2 de `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O documento dela pede «Evento · Serviços · Inspiração · Orçamento · Rever e
 * enviar», com a barra dos passos sempre à vista e cada passo a dizer se está
 * completo, incompleto ou com erro.
 *
 * Este ficheiro não desenha nada: diz QUE SECÇÃO vive em que passo, e QUE
 * ESTADO tem cada passo. O estado sai das mesmas duas listas que o índice e o
 * envio já usam (`estadoDasSeccoes` e `oQueFaltaParaEnviar`) — uma terceira
 * contagem era a maneira de o sinal do passo e a lista do envio discordarem.
 *
 * ── PORQUE É QUE O 3.º PASSO MUDA DE NOME ───────────────────────────────────
 *
 * Numa proposta de Organização não há mood boards: o que lá vive é o
 * cronograma. Chamar-lhe «Inspiração» era um passo cujo nome não diz o que tem
 * dentro, por isso nesse modelo o passo chama-se «Cronograma».
 */
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";

export type Passo = "evento" | "servicos" | "inspiracao" | "orcamento" | "enviar";

export type EstadoDoPasso = "completo" | "incompleto" | "erro";

export const PASSOS: readonly Passo[] = ["evento", "servicos", "inspiracao", "orcamento", "enviar"];

/** O nome do passo, como aparece na barra e nos botões «Seguinte». */
export function nomeDoPasso(p: Passo, organizacao = false): string {
  switch (p) {
    case "evento":
      return "Evento";
    case "servicos":
      return "Serviços";
    case "inspiracao":
      return organizacao ? "Cronograma" : "Inspiração";
    case "orcamento":
      return "Orçamento";
    case "enviar":
      return "Rever e enviar";
  }
}

/**
 * Em que passo vive uma secção do estúdio.
 *
 * Uma secção desconhecida cai no primeiro passo: é lá que estão os campos que
 * não têm secção própria (o título interno, o modelo), e um salto que não vai
 * a lado nenhum é pior do que um salto para o princípio.
 */
export function passoDaSeccao(seccao: string | undefined): Passo {
  switch (seccao) {
    case "servicos":
      return "servicos";
    case "moodboards":
    case "cronograma":
      return "inspiracao";
    case "orcamento":
    case "total":
      return "orcamento";
    case "envio":
      return "enviar";
    default:
      return "evento";
  }
}

/** O passo seguinte e o anterior — `null` nas pontas. */
export function passoAoLado(p: Passo, lado: 1 | -1): Passo | null {
  return PASSOS[PASSOS.indexOf(p) + lado] ?? null;
}

/**
 * O estado de cada passo.
 *
 *  · **erro** — há uma falta que TRAVA o envio numa secção deste passo;
 *  · **incompleto** — há uma secção deste passo por preencher, ou um conselho;
 *  · **completo** — nem uma coisa nem outra.
 *
 * O «Rever e enviar» é o resumo dos outros: está em erro se alguma coisa
 * trava, onde quer que esteja (é ali que o botão de enviar fica desligado), e
 * completo depois de a proposta seguir.
 */
export function estadoDosPassos(
  seccoes: readonly EstadoSeccao[],
  faltas: readonly Impedimento[],
  enviada: boolean,
): Record<Passo, EstadoDoPasso> {
  const estado = {} as Record<Passo, EstadoDoPasso>;
  for (const p of PASSOS) {
    if (p === "enviar") continue;
    const daqui = faltas.filter((f) => passoDaSeccao(f.seccao) === p);
    if (daqui.some((f) => f.trava)) estado[p] = "erro";
    else if (daqui.length > 0 || seccoes.some((s) => passoDaSeccao(s.id) === p && !s.preenchida))
      estado[p] = "incompleto";
    else estado[p] = "completo";
  }
  // «Ainda não viste o PDF final» trava o envio mas não é um ERRO: é o passo
  // seguinte. Sozinho, o passo 5 fica por completar (sem o vermelho); com
  // outra falta que trave, continua a vermelho (revisão de 14/11).
  const travamDeVerdade = faltas.filter((f) => f.trava && f.id !== "visto");
  estado.enviar = enviada
    ? "completo"
    : travamDeVerdade.length > 0
      ? "erro"
      : faltas.some((f) => f.trava)
        ? "incompleto"
        : faltas.some((f) => passoDaSeccao(f.seccao) === "enviar")
          ? "incompleto"
          : "completo";
  return estado;
}

/** O que o sinal diz a quem não o vê — o leitor de ecrã. */
export const FRASE_DO_ESTADO: Record<EstadoDoPasso, string> = {
  completo: "completo",
  incompleto: "por completar",
  erro: "com erros",
};
