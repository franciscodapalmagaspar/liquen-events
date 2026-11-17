/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE ESTÁ O TRABALHO DELA — A GRAVAÇÃO DO ESTÚDIO COMO MÁQUINA DE ESTADOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Eram três `useState` soltos no `ProposalStudio` (`aGravarNoServidor`,
 * `soNesteComputador`, `naoDuraAoDeploy`), mexidos por seis sítios diferentes.
 * Três variáveis independentes deixam escrever estados que não existem — uma
 * contagem negativa, um «só neste computador» sem o porquê ao lado, ou um aviso
 * de deploy que ninguém volta a apagar — e cada sítio que as mexia tinha de se
 * lembrar das regras sozinho (fase 3 de `docs/ESTRUTURA-DO-CODIGO.md`, §1.8).
 *
 * Aqui as regras estão num sítio só, numa função pura que se testa sem React:
 *
 *  · `aCaminho` — quantas gravações estão AGORA a caminho do servidor. Uma
 *    contagem e não um booleano: a gravação de saída (a da desmontagem) pode
 *    sobrepor-se à do debounce. Nunca desce abaixo de zero.
 *  · `destino` — onde ficou a última gravação: no servidor, ou SÓ NESTE
 *    COMPUTADOR, com o porquê (a tabela em falta, as permissões, a sessão).
 *  · `duracao` — o servidor onde chegou dura, ou o próximo deploy apaga-a
 *    (produção sem base de dados), com a frase que o servidor mandou.
 *
 * O que se mostra (`estadoNoEcra`) sai destes três e do «há alterações à espera
 * do debounce», pela ordem de gravidade que o indicador já seguia.
 */
import type { EstadoDaGravacaoNoEcra } from "./textos-do-estudio";

export type DestinoDaGravacao =
  | { onde: "servidor" }
  | { onde: "so-neste-computador"; porque?: string };

export type DuracaoDaGravacao = { dura: true } | { dura: false; aviso?: string };

export interface EstadoDaGravacao {
  aCaminho: number;
  destino: DestinoDaGravacao;
  duracao: DuracaoDaGravacao;
}

export type AccaoDaGravacao =
  /** Uma gravação partiu para o servidor. */
  | { tipo: "partiu" }
  /** Uma gravação voltou — bem ou mal (o resultado chega pelas outras acções). */
  | { tipo: "voltou" }
  /** O servidor guardou. */
  | { tipo: "chegou-ao-servidor" }
  /** O servidor não guardou: ficou só no `localStorage` deste computador. */
  | { tipo: "ficou-so-aqui"; porque?: string }
  /** Chegou, mas a um sítio que o próximo deploy apaga. */
  | { tipo: "nao-dura"; aviso?: string }
  /** Chegou a um sítio que dura (ou o servidor não disse o contrário). */
  | { tipo: "dura" };

export const GRAVACAO_INICIAL: EstadoDaGravacao = {
  aCaminho: 0,
  destino: { onde: "servidor" },
  duracao: { dura: true },
};

/**
 * O estado seguinte. Devolve o MESMO objecto quando nada muda — é o que deixa o
 * React não voltar a desenhar, como fazia o `useState` com o mesmo `null`.
 */
export function transicaoDaGravacao(s: EstadoDaGravacao, a: AccaoDaGravacao): EstadoDaGravacao {
  switch (a.tipo) {
    case "partiu":
      return { ...s, aCaminho: s.aCaminho + 1 };
    case "voltou":
      return s.aCaminho === 0 ? s : { ...s, aCaminho: s.aCaminho - 1 };
    case "chegou-ao-servidor":
      return s.destino.onde === "servidor" ? s : { ...s, destino: { onde: "servidor" } };
    case "ficou-so-aqui":
      // Um objecto novo de cada vez, como o `setState({ porque })` de antes: o
      // porquê pode ter mudado (a sessão caiu, depois a rede).
      return { ...s, destino: { onde: "so-neste-computador", porque: a.porque } };
    case "nao-dura":
      return { ...s, duracao: { dura: false, aviso: a.aviso } };
    case "dura":
      return s.duracao.dura ? s : { ...s, duracao: { dura: true } };
  }
}

/**
 * A palavra do indicador. Pela ordem de gravidade: a guardar (há trabalho à
 * espera ou a caminho) → só neste computador → não dura ao deploy → guardado.
 * «Só neste computador» vem antes do deploy porque não chegar ao servidor é
 * pior do que chegar a um sítio que não dura, e o indicador só diz uma coisa.
 */
export function estadoNoEcra(porGravar: boolean, g: EstadoDaGravacao): EstadoDaGravacaoNoEcra {
  if (porGravar || g.aCaminho > 0) return "a-guardar";
  if (g.destino.onde === "so-neste-computador") return "so-neste-computador";
  if (!g.duracao.dura) return "nao-dura-ao-deploy";
  return "guardado";
}
