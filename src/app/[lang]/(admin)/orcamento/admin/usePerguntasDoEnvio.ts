"use client";

import { useCallback, useRef, useState } from "react";
import type { Corte } from "@/lib/orcamento/estudio/textos-do-estudio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PERGUNTAS ANTES DE O ENVIO SEGUIR (fotos em falta e cortes)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O servidor desenha o documento e, se lhe faltam fotografias ou se a
 * composição cortou alguma coisa, PÁRA e pergunta (409, `precisaConfirmarFotos`
 * / `precisaConfirmarCortes`) — com a proposta ainda por gravar e o email
 * ainda por sair. Registos de 12/11: uma proposta seguiu com nove fotografias
 * a menos, e o aviso só chegou com o email já fora.
 *
 * ── CADA RESPOSTA VALE PARA UM DOCUMENTO (revisão de 17/11) ──────────────
 *
 * A resposta «envia assim mesmo» era um booleano, guardado no momento do
 * clique: mudava-se uma foto com a pergunta aberta, e o «sim» passava a valer
 * para o documento NOVO, que ela não tinha visto. Agora:
 *
 *  · a pergunta guarda o retrato do documento que a fez (`retrato`);
 *  · o clique só confirma se o documento de agora for ESSE — se não for, a
 *    pergunta fecha e o envio volta a pedir o PDF;
 *  · a pergunta fecha-se sozinha quando o documento muda;
 *  · a resposta às fotos diz QUANTAS ela aceitou (`n`), e o servidor só aceita
 *    um PDF com essas ou menos em falta.
 *
 * E as respostas ficam lembradas por retrato, as duas: respondida a dos cortes,
 * um envio do mesmo documento não a volta a fazer (a das fotos vem primeiro, e
 * sem isto ela podia ser perguntada duas vezes pelos mesmos cortes).
 */
export type Pergunta =
  | { tipo: "fotos"; n: number; retrato: string }
  | { tipo: "cortes"; cortes: Corte[]; retrato: string };

export interface PerguntasDoEnvio {
  /** A pergunta aberta — só se ainda for sobre o documento de agora. */
  pergunta: Pergunta | null;
  /** O servidor parou e perguntou, sobre o documento `retrato`. */
  perguntar: (p: Pergunta) => void;
  /**
   * «Enviar assim mesmo». `true` quando a resposta ficou dada para o documento
   * de agora; `false` quando o documento mudou entretanto (a pergunta fecha).
   */
  confirmar: () => boolean;
  /** «Voltar e corrigir», ou uma resposta do servidor que não pergunta nada. */
  fechar: () => void;
  /** O que o envio do documento `retrato` leva de respostas já dadas. */
  respostasPara: (retrato: string) => {
    fotosEmFaltaConfirmadas?: number;
    cortesConfirmados?: true;
  };
  /** A proposta seguiu: as respostas não valem para a próxima. */
  esquecer: () => void;
}

export function usePerguntasDoEnvio(retratoAgora: string): PerguntasDoEnvio {
  const [aberta, setAberta] = useState<Pergunta | null>(null);
  const fotos = useRef<{ n: number; retrato: string } | null>(null);
  const cortes = useRef<string | null>(null);

  // O documento mudou: a pergunta era sobre outro, e fecha-se. Durante o
  // desenho e não num efeito — o padrão do React para «estado que depende de
  // uma prop» (react.dev, «You might not need an effect»).
  const [retratoAnterior, setRetratoAnterior] = useState(retratoAgora);
  if (retratoAnterior !== retratoAgora) {
    setRetratoAnterior(retratoAgora);
    if (aberta && aberta.retrato !== retratoAgora) setAberta(null);
  }

  const perguntar = useCallback((p: Pergunta) => setAberta(p), []);
  const fechar = useCallback(() => setAberta(null), []);

  const confirmar = useCallback((): boolean => {
    const p = aberta;
    setAberta(null);
    if (!p || p.retrato !== retratoAgora) return false;
    if (p.tipo === "fotos") fotos.current = { n: p.n, retrato: p.retrato };
    else cortes.current = p.retrato;
    return true;
  }, [aberta, retratoAgora]);

  const respostasPara = useCallback((retrato: string) => {
    const f = fotos.current;
    return {
      ...(f && f.retrato === retrato ? { fotosEmFaltaConfirmadas: f.n } : {}),
      ...(cortes.current === retrato ? { cortesConfirmados: true as const } : {}),
    };
  }, []);

  const esquecer = useCallback(() => {
    fotos.current = null;
    cortes.current = null;
    setAberta(null);
  }, []);

  // E nunca se mostra a pergunta de outro documento, nem por um desenho.
  const pergunta = aberta && aberta.retrato === retratoAgora ? aberta : null;
  return { pergunta, perguntar, confirmar, fechar, respostasPara, esquecer };
}

/**
 * O passo onde se corrige o que a pergunta diz: as fotos em falta e as fotos
 * a mais estão nos mood boards (Inspiração), o nome comprido está na capa (o
 * passo do Evento), e as outras linhas cortadas são de serviços.
 */
export function passoParaCorrigir(p: Pergunta): "inspiracao" | "evento" | "servicos" {
  if (p.tipo === "fotos") return "inspiracao";
  const corte = p.cortes[0];
  if (!corte) return "evento";
  if (corte.unit === "fotos") return "inspiracao";
  return /capa/i.test(corte.where) ? "evento" : "servicos";
}
