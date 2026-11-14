"use client";

import type { PreparedImage } from "./image-prep";
import { eTempoEsgotado, sinalComTecto, TECTO_DE_UMA_FOTO_MS } from "@/lib/tempo-esgotado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA PREPARADA → AS FOTOGRAFIAS DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estava escrito dentro do estúdio (`uploadOne`) e passou para aqui quando a
 * importação de propostas antigas (13/11) precisou de carregar fotografias pelo
 * MESMO caminho: o `image-prep` reduz no navegador, isto manda a foto, a
 * miniatura, a média, a cor e o LQIP para `/api/orcamento/[id]/assets`, uma
 * fotografia por pedido. Dois sítios a montar o mesmo formulário divergiam à
 * primeira mudança — e o sintoma era uma foto importada sem miniatura.
 *
 * Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
 * corpo do alojamento (~4,5 MB). Uma repetição automática em falha de rede.
 */

export interface FotoEnviada {
  path: string;
  url: string;
  thumbUrl?: string;
  cor?: string;
  /** Já estava guardada (nesta pasta ou na Biblioteca): não ocupou espaço. */
  jaExistia?: boolean;
}

export type FotoParaEnviar = Pick<PreparedImage, "file" | "thumb"> &
  Partial<Pick<PreparedImage, "cor" | "lqip" | "mid">> & {
    /**
     * O resumo do ficheiro ORIGINAL (`fingerprintBlob`, antes de preparar).
     * Com ele o servidor reconhece uma foto que já está na Biblioteca — lá foi
     * preparada com outro tamanho, e os bytes guardados nunca batiam — e
     * devolve o caminho dela em vez de guardar outra cópia (`fotos-resumo.ts`).
     */
    resumo?: string | null;
    /** Vem da importação: passa pelo travão do espaço (90% do plano). */
    importacao?: boolean;
  };

export function formularioDaFoto(f: FotoParaEnviar, chave?: string): FormData {
  const form = new FormData();
  form.append("files", f.file);
  // UMA chave por foto, repetida na segunda tentativa: se a primeira chegou e
  // só a resposta se perdeu, o servidor reconhece-a e não guarda um segundo
  // ficheiro (auditoria de 13/11, estúdio n.º 18).
  if (chave) form.append("chaves", chave);
  if (f.resumo) form.append("resumos", f.resumo);
  if (f.importacao) form.append("importacao", "1");
  // O LQIP — a mancha de cor que ocupa a célula enquanto a fotografia não
  // chega. Sai da MESMA descodificação que já calculou a cor e a miniatura
  // (`image-prep`), portanto não custa nada, e sem ele a página do casal
  // abre com rectângulos vazios.
  if (f.lqip) form.append("lqips", f.lqip);
  // A cor dominante, calculada na mesma descodificação que encolheu a foto.
  // É aqui que ela pode ser calculada — do lado do estúdio as fotos já vêm de
  // outro domínio e o `canvas` fica manchado.
  if (f.cor) form.append("cores", f.cor);
  // A miniatura viaja ao lado do original, no mesmo pedido: ~30–60 KB que
  // poupam à grelha puxar o original para desenhar 174 px.
  if (f.thumb) form.append("thumbs", f.thumb);
  // A de 1200 px — a que a PÁGINA DO CASAL mostra. Sem ela, só nasce quando
  // alguém olhar — e numa proposta acabada de enviar essa pessoa é o casal.
  if (f.mid) form.append("medias", f.mid);
  return form;
}

/**
 * O servidor recusou porque o armazenamento chegou ao travão (90% do plano,
 * HTTP 507). Quem envia um lote PÁRA ao primeiro: as outras também seriam
 * recusadas, e cada uma é um pedido a mais.
 */
export class ArmazenamentoNoTravao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ArmazenamentoNoTravao";
  }
}

export async function enviarFotoDaProposta(
  quoteId: string,
  f: FotoParaEnviar,
): Promise<FotoEnviada> {
  const chave = crypto.randomUUID();
  const post = () =>
    fetch(`/api/orcamento/${quoteId}/assets`, {
      method: "POST",
      body: formularioDaFoto(f, chave),
      signal: sinalComTecto(TECTO_DE_UMA_FOTO_MS),
    });
  let res: Response;
  try {
    res = await post();
  } catch (e) {
    // Um tempo esgotado não se repete: seriam mais 120 s à espera, e o
    // primeiro pedido pode bem ter chegado (revisão de 13/11).
    if (eTempoEsgotado(e)) throw e;
    // Soluço de rede — tenta uma segunda vez, com a MESMA chave.
    res = await post();
  }
  const data = await res.json().catch(() => null);
  if (res.status === 507) {
    throw new ArmazenamentoNoTravao(
      data?.error || "O armazenamento chegou ao travão (90% do plano).",
    );
  }
  if (!res.ok) {
    throw new Error(
      data?.error ||
        (res.status === 413
          ? "Imagem demasiado grande para envio."
          : "Falha ao carregar a imagem."),
    );
  }
  const im: FotoEnviada | undefined = data?.images?.[0];
  if (!im) throw new Error("Falha ao carregar a imagem.");
  return im;
}
