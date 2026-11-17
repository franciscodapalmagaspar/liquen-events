/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FALTA NO DOCUMENTO, EM PALAVRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu do `ProposalStudio.tsx` a 17/11 duas vezes, em dois ramos ao mesmo
 * tempo: aqui (com a pergunta antes do envio, que é quem mais o usa) e em
 * `lib/orcamento/estudio/textos-do-estudio.ts` (fase 1 de
 * `docs/ESTRUTURA-DO-CODIGO.md`). As duas cópias eram iguais letra a letra;
 * fica UMA, a de `lib/`, e este módulo só a reexporta — duas frases do mesmo
 * aviso em dois sítios eram dois ecrãs a discordar no dia em que uma mudasse.
 */
export {
  avisoDeConteudoIncompleto,
  cortesDoCabecalho,
  fraseDeCorte,
  normalizaCortes,
  type Corte,
} from "@/lib/orcamento/estudio/textos-do-estudio";
