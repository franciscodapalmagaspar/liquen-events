"use client";

import type { PreparedImage } from "./image-prep";

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
}

export type FotoParaEnviar = Pick<PreparedImage, "file" | "thumb"> &
  Partial<Pick<PreparedImage, "cor" | "lqip" | "mid">>;

export function formularioDaFoto(f: FotoParaEnviar): FormData {
  const form = new FormData();
  form.append("files", f.file);
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

export async function enviarFotoDaProposta(
  quoteId: string,
  f: FotoParaEnviar,
): Promise<FotoEnviada> {
  const post = () =>
    fetch(`/api/orcamento/${quoteId}/assets`, { method: "POST", body: formularioDaFoto(f) });
  let res: Response;
  try {
    res = await post();
  } catch {
    // Soluço de rede — tenta uma segunda vez antes de desistir.
    res = await post();
  }
  const data = await res.json().catch(() => null);
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
