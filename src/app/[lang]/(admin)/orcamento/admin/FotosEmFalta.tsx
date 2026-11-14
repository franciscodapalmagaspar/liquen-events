"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
// Dos TIPOS e não do módulo do Storage: este componente corre no browser, e o
// `proposta-fotos-verificacao.ts` importa `server-only`. Ver o cabeçalho de lá.
import {
  PORQUE_FALTA,
  PORQUE_SUSPEITA,
  type MotivoDeFalta,
  type FotoEscolhidaEmFalta,
  type MotivoSuspeito,
  type VerificacaoDeFotos,
} from "@/lib/proposta-fotos-verificacao-tipos";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE FALTAM — DITAS ANTES DE O LINK SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Verificação automática antes de publicar: se alguma imagem da proposta não
 * resolver, avisar no back office ANTES de o link chegar ao cliente.»
 *
 * O defeito que isto existe para não repetir: quatro fotografias que não
 * existiam no armazenamento seguiram numa proposta, e a primeira pessoa a dar
 * por isso foi o casal — a olhar para caixas cinzentas a meio de um mood board.
 * Do lado de cá tudo parecia bem, porque assinar um caminho não prova que o
 * ficheiro está lá.
 *
 * ── PORQUE É QUE AVISA E NÃO TRANCA ──────────────────────────────────────
 *
 * Uma proposta que tem de sair hoje sai hoje. O que não pode é sair sem ela
 * saber — e a diferença entre as duas coisas é esta lista, com o nome do mood
 * board e a posição da foto, para se ir lá corrigir em trinta segundos.
 *
 * ── E PORQUE É QUE «NÃO CONSEGUI VERIFICAR» TEM DE SE LER ────────────────
 *
 * Porque é a única resposta que se pode confundir com a boa. Sem armazenamento
 * configurado a verificação não corre, e uma lista vazia é exactamente o que
 * uma proposta impecável também produz. As duas frases são diferentes aqui
 * dentro, e é de propósito.
 */

const CAIXA = "mt-3 rounded-lg px-3 py-2.5 text-[12px] leading-snug";

export default function FotosEmFalta({
  quoteId,
  doc,
  onEscolhidasQueFaltam,
}: {
  quoteId: string;
  doc: ProposalDoc;
  /**
   * As fotos escolhidas para as páginas que já não existem (14/11): o estúdio
   * passa-as a `oQueFaltaParaEnviar`, onde TRAVAM o envio. Só com uma
   * verificação que correu — nunca durante a espera (seria travar por uma
   * corrida, ver «O QUE O DOCUMENTO NÃO SABE DE SI PRÓPRIO» no estúdio).
   */
  onEscolhidasQueFaltam?: (lista: FotoEscolhidaEmFalta[]) => void;
}) {
  const [estado, setEstado] = useState<"a-ver" | "respondeu" | "falhou">("a-ver");
  const [r, setR] = useState<VerificacaoDeFotos | null>(null);
  // Numa ref: a função muda a cada desenho do estúdio, e a verificação não.
  const avisar = useRef(onEscolhidasQueFaltam);
  useEffect(() => {
    avisar.current = onEscolhidasQueFaltam;
  }, [onEscolhidasQueFaltam]);

  const verificar = useCallback(async () => {
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/fotos-em-falta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const resposta = (await res.json()) as VerificacaoDeFotos;
      setR(resposta);
      setEstado("respondeu");
      if (resposta.verificou) avisar.current?.(resposta.escolhidasQueFaltam ?? []);
    } catch {
      setEstado("falhou");
    }
    // `doc` de fora das dependências DE PROPÓSITO: ele muda a cada tecla, e a
    // verificação lista pastas do armazenamento. Corre ao entrar no passo e
    // quando ela pedir — ver o efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  /**
   * Corre UMA vez, ao montar — que é o momento em que ela entra no passo de
   * enviar. Não corre a cada tecla: cada volta lista pastas do armazenamento, e
   * uma verificação a cada letra escrita seria um pedido por letra para
   * responder sempre o mesmo.
   */
  useEffect(() => {
    void verificar();
  }, [verificar]);

  if (estado === "a-ver") {
    return <p className="mt-3 text-[12px] text-foreground/40">A confirmar as fotografias…</p>;
  }

  if (estado === "falhou" || !r?.verificou) {
    return (
      <div className={`${CAIXA} bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]`}>
        Não foi possível confirmar as fotografias.{" "}
        <strong className="font-medium">Isto não quer dizer que estejam bem.</strong>{" "}
        <button
          type="button"
          onClick={() => void verificar()}
          className={`alvo-toque underline ${ESTADO} ${PRESSAO}`}
        >
          Tentar outra vez
        </button>
      </div>
    );
  }

  /**
   * As que estão lá e não deviam ir assim.
   *
   * Numa caixa PRÓPRIA e a amarelo, não misturada com as que faltam: são dois
   * problemas com duas resoluções — uma foto que falta volta ao armazenamento,
   * uma foto com marca do Pinterest troca-se por outra. Juntas na mesma lista
   * vermelha, a segunda lia-se como um erro a impedir o envio, que não é.
   */
  const suspeitas = r.suspeitas ?? [];
  const porSuspeita = new Map<MotivoSuspeito, typeof suspeitas>();
  for (const f of suspeitas) porSuspeita.set(f.motivo, [...(porSuspeita.get(f.motivo) ?? []), f]);

  const aviso = suspeitas.length > 0 && (
    <div className={`${CAIXA} bg-[var(--bo-aviso)]/10 text-[var(--bo-aviso)]`}>
      <p className="font-semibold">
        {suspeitas.length === 1
          ? "1 fotografia vai sair pior do que devia."
          : `${suspeitas.length} fotografias vão sair pior do que deviam.`}
      </p>
      {[...porSuspeita.entries()].map(([motivo, fotos]) => (
        <div key={motivo} className="mt-2">
          <p className="text-[11px]">{PORQUE_SUSPEITA[motivo]}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {fotos.map((f) => (
              <li key={f.id} className="text-[var(--bo-tinta-72)] text-[12px]">
                {f.onde}{" "}
                <span className="text-foreground/45">
                  ({f.largura}×{f.altura})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {/*
       * A frase que fecha, e que é a mais importante desta caixa: o que aqui
       * se conta são MEDIDAS. Uma marca de água gravada nos pixéis de uma foto
       * grande não é vista por conta nenhuma — só por ela.
       */}
      <p className="mt-2 text-[11px] italic">
        Isto são medidas, não é o que está dentro da imagem. Uma marca de água ou um ícone por cima
        só se veem a olhar.
      </p>
    </div>
  );

  if (r.emFalta.length === 0) {
    return (
      <>
        <p className="mt-3 text-[12px] text-[var(--bo-accent-hover)]">
          As {r.total} fotografias estão todas no sítio.
          {r.naoVerificaveis > 0 &&
            ` (${r.naoVerificaveis} ${r.naoVerificaveis === 1 ? "vem de um endereço de fora e não dá para confirmar daqui" : "vêm de endereços de fora e não dão para confirmar daqui"}.)`}
        </p>
        {aviso}
      </>
    );
  }

  // As faltas agrupadas pelo MOTIVO: as três causas têm resoluções diferentes,
  // e uma lista corrida obrigava a lê-las uma a uma para perceber isso.
  const porMotivo = new Map<MotivoDeFalta, typeof r.emFalta>();
  for (const f of r.emFalta) porMotivo.set(f.motivo, [...(porMotivo.get(f.motivo) ?? []), f]);

  return (
    <>
      <div className={`${CAIXA} bg-[var(--bo-perigo)]/10 text-[var(--bo-perigo)]`} role="alert">
        <p className="font-semibold">
          {r.emFalta.length === 1
            ? "1 fotografia não vai aparecer ao casal."
            : `${r.emFalta.length} fotografias não vão aparecer ao casal.`}{" "}
          <span className="font-normal">de {r.total}</span>
        </p>
        {[...porMotivo.entries()].map(([motivo, fotos]) => (
          <div key={motivo} className="mt-2">
            <p className="text-[11px]">{PORQUE_FALTA[motivo]}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {fotos.map((f) => (
                <li key={f.id} className="text-[12px] text-[var(--bo-tinta-72)]">
                  {f.onde}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setEstado("a-ver");
            void verificar();
          }}
          className={`alvo-toque mt-2.5 underline ${ESTADO} ${PRESSAO}`}
        >
          Já corrigi — voltar a confirmar
        </button>
      </div>
      {aviso}
    </>
  );
}
