"use client";
import { useState } from "react";
import { useToast } from "../../Toast";
import type { Quote } from "@/lib/orcamento/types";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";

export interface EntradaRascunhoSobreposto {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  quote: Quote;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useRascunhoSobreposto({
  documento,
  quote,
  reversiveis,
  toast,
  total,
}: EntradaRascunhoSobreposto) {
  const { doc, setDoc } = documento;
  const { setLimpo } = reversiveis;
  const { persistirPreco, setTotalInput, totalInput } = total;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O TRABALHO QUE ESTA SESSÃO ESMAGOU, E DE ONDE SE VAI BUSCAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O aviso da gravação cruzada é um `toast`, e um `toast` desaparece. Para
   * dizer «ficou a tua versão» isso chega — é uma notícia, não uma tarefa.
   *
   * Isto é outra coisa: é trabalho de outra pessoa à espera de uma decisão.
   * Uma notícia que se apaga sozinha ao fim de uns segundos não serve para
   * uma decisão que a pessoa pode querer tomar dez minutos depois, quando
   * perceber o que aconteceu. Por isso o `toast` continua a dar a notícia, e
   * isto fica no ecrã até alguém resolver — repondo ou dispensando.
   *
   * Fica só em memória, de propósito: não é um estado do documento, é uma
   * coisa desta sessão. Se ela fechar o separador sem decidir, o trabalho
   * continua guardado no servidor e o próximo aviso de sobreposição volta a
   * apontar para lá. O que se perde é o lembrete, não o trabalho.
   */
  const [sobreposto, setSobreposto] = useState<{
    /** A gaveta, tal como o servidor a nomeou. */
    chave: string;
    /** Quem tinha escrito aquilo, quando se sabe. */
    quem?: string;
    /** Quando é que tinha sido gravado. */
    quando?: string;
  } | null>(null);
  /** A repor: a leitura da gaveta demora, e o botão tem de o dizer. */
  const [aRepor, setARepor] = useState(false);

  async function reporSobreposto() {
    if (!sobreposto || aRepor) return;
    setARepor(true);
    try {
      // A rota recebe a VARIANTE, não a chave inteira: a chave é
      // `<pedido>--<variante>`, e é o servidor que a volta a montar.
      const variante = sobreposto.chave.startsWith(`${quote.id}--`)
        ? sobreposto.chave.slice(`${quote.id}--`.length)
        : null;
      if (!variante) {
        toast("Não reconheço o sítio onde essa versão ficou guardada.", "error");
        return;
      }
      const res = await fetch(
        `/api/orcamento/${quote.id}/proposta-rascunho?variante=${encodeURIComponent(variante)}`,
      );
      const dados = await res.json().catch(() => null);
      const recuperado = dados?.draft?.doc;
      if (!res.ok || recuperado == null) {
        // Dizer o que aconteceu e o que fazer, e NÃO limpar a barra: se não se
        // conseguiu abrir agora, a gaveta continua lá e vale a pena insistir.
        toast(
          res.status === 401
            ? "A sessão expirou. Entra outra vez e essa versão continua guardada."
            : "Não consegui abrir essa versão agora. Ela continua guardada — tenta daqui a pouco.",
          "error",
        );
        return;
      }
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo: sobreposto.quem
          ? `Reposta a versão de ${sobreposto.quem}.`
          : "Reposta a versão que tinha sido substituída.",
      });
      const reposto = recuperado as StudioDoc;
      setDoc(reposto);
      // O total também (auditoria de 13/11, estúdio n.º 13): o campo é estado à
      // parte, e ficava com o valor da versão que se acabou de substituir — o
      // campo dizia um número e o PDF saía com outro. E grava-se no pedido,
      // como em `restaurarVersao`.
      const base = baseDoDoc(reposto);
      setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
      persistirPreco(typeof base === "number" && base > 0 ? base : undefined, { doc: reposto });
      setSobreposto(null);
    } catch {
      toast("Não consegui abrir essa versão agora. Ela continua guardada.", "error");
    } finally {
      setARepor(false);
    }
  }

  return { aRepor, reporSobreposto, setSobreposto, sobreposto };
}
