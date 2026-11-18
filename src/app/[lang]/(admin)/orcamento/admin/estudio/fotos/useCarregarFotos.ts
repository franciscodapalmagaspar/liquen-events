"use client";
import { porqueFalhou } from "@/lib/erro-do-servidor";
import { eTempoEsgotado } from "@/lib/tempo-esgotado";
import { useToast } from "../../Toast";
import { PENDING_IMAGE_PREFIX } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { prepareImageWithThumb, type ImageKind } from "../../image-prep";
import { enviarFotoDaProposta } from "../../enviar-foto-da-proposta";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import { useAvisoDeQualidade } from "../../AvisoDeQualidade";
import { lugarDaChave } from "@/lib/qualidade-da-foto";
import { mapImagePaths } from "@/lib/orcamento/estudio/documento-inicial";
import { UPLOAD_CONCURRENCY } from "../limites";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "./useMapasDasFotos";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaCarregarFotos {
  avisoDeQualidade: ReturnType<typeof useAvisoDeQualidade>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  setUploading: Dispatch<SetStateAction<Record<string, { feito: number; total: number }>>>;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useCarregarFotos({
  avisoDeQualidade,
  documento,
  fotos,
  quote,
  setUploading,
  toast,
}: EntradaCarregarFotos) {
  const { marcadoresResolvidosRef, setDoc } = documento;
  const { setAssetCores, setAssetOriginais, setAssetUrls } = fotos;

  // ── Image upload ──
  // Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
  // corpo do alojamento (~4,5 MB) com fotos reais de telemóvel — o upload
  // "às vezes não funcionava". Cada ficheiro é comprimido no navegador
  // (image-prep) e enviado individualmente, com uma repetição automática em
  // falha de rede; um ficheiro mau nunca deita fora os restantes.
  async function uploadOne(
    file: File,
    thumb: File | null,
    cor?: string | null,
    lqip?: string | null,
    mid?: File | null,
    resumo?: string | null,
  ): Promise<{ path: string; url: string; thumbUrl?: string; cor?: string }> {
    // O formulário, a repetição e as mensagens vivem em
    // `enviar-foto-da-proposta.ts`: a importação de propostas antigas carrega
    // as fotografias pelo MESMO caminho.
    const im = await enviarFotoDaProposta(quote.id, { file, thumb, cor, lqip, mid, resumo });
    // A grelha desenha pela miniatura quando existe; o original fica para o
    // detalhe e para o PDF.
    setAssetUrls((prev) => ({ ...prev, [im.path]: im.thumbUrl || im.url }));
    setAssetOriginais((prev) => ({ ...prev, [im.path]: im.url }));
    if (im.cor) setAssetCores((prev) => ({ ...prev, [im.path]: im.cor as string }));
    return im;
  }

  async function handleUpload(
    key: string,
    todas: File[],
    onPaths: (paths: string[]) => void,
    /**
     * ── A FOTO OCUPA O LUGAR LOGO AO ESCOLHER (auditoria 13/11, n.ºs 6 e 7) ──
     *
     * Sem isto, as fotos só entravam no mood board quando acabavam de subir, e
     * entravam no ÍNDICE que ele tinha no início: se ela apagasse, movesse ou
     * duplicasse um tema entretanto, iam para o tema errado (ou sumiam). E o
     * envio não sabia que havia fotos a caminho — seguia sem elas.
     *
     * Com `reservar`, cada ficheiro entra JÁ no documento como um marcador
     * provisório (`pending:<uuid>`) — o mesmo das fotos da biblioteca. O
     * marcador anda com o tema para onde ela o levar; ao subir, troca-se pelo
     * caminho no sítio onde estiver; se falhar, sai. E o envio, que já espera
     * por marcadores, espera também por estas.
     */
    reservar?: (marcadores: string[]) => void,
  ) {
    if (todas.length === 0) return;
    // Ela (28/10): «que avise mesmo, não coloque esta foto porque vai ficar
    // com uma qualidade péssima». As más ficam de fora, a não ser que ela diga
    // «Usar na mesma» (`AvisoDeQualidade`).
    const files = await avisoDeQualidade.filtrarFicheiros(todas, lugarDaChave(key));
    if (files.length === 0) return;
    const marcadores = reservar
      ? files.map(() => `${PENDING_IMAGE_PREFIX}${crypto.randomUUID()}`)
      : [];
    const previas: string[] = [];
    if (reservar) {
      setAssetUrls((prev) => {
        const next = { ...prev };
        files.forEach((f, i) => {
          try {
            const url = URL.createObjectURL(f);
            previas.push(url);
            next[marcadores[i]] = url;
          } catch {
            /* sem pré-visualização: a célula mostra-se a carregar */
          }
        });
        return next;
      });
      reservar(marcadores);
    }
    setUploading((u) => ({ ...u, [key]: { feito: 0, total: files.length } }));
    /**
     * Mais uma arrumada — e conta tanto a que subiu como a que falhou.
     *
     * A barra retrata o que JÁ NÃO SE ESPERA, e uma foto que falhou também
     * deixou de se esperar: contar só as boas deixava a barra a faltar-lhe um
     * bocado para sempre, num lote com um ficheiro mau. O que correu mal
     * continua a ser dito pelo `toast`, no fim e com o número.
     */
    const maisUma = () =>
      setUploading((u) => {
        const p = u[key];
        if (!p) return u;
        return { ...u, [key]: { ...p, feito: Math.min(p.total, p.feito + 1) } };
      });
    // Cover photos print large (the document's hero) so they keep more pixels and
    // a higher JPEG quality; mood-board photos render as small collage cells and
    // use a tighter cap. The upload key encodes which is which ("cover-…"/"board-…").
    const kind: ImageKind = key.startsWith("board-") ? "board" : "cover";
    // Preparar e enviar em VIAS PARALELAS. Em sequência, o processador ficava
    // parado à espera da rede e a rede parada à espera do processador; assim a
    // foto N+1 é preparada enquanto a N sobe. A preparação em si já corre fora
    // do fio principal (image-prep → image-worker), por isso a interface
    // continua a responder durante o lote.
    const results: ({ path: string } | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    let next = 0;
    async function lane() {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        const f = files[i];
        try {
          // O resumo do ORIGINAL (~40 ms), para o servidor reconhecer uma foto
          // que já está na Biblioteca ou neste pedido e não guardar outra cópia
          // (`fotos-resumo.ts`). `null` sem contexto seguro — sobe como antes.
          const [prepared, resumo] = await Promise.all([
            prepareImageWithThumb(f, kind, "proposta"),
            fingerprintBlob(f),
          ]);
          const im = await uploadOne(
            prepared.file,
            prepared.thumb,
            prepared.cor,
            prepared.lqip,
            prepared.mid,
            resumo,
          );
          // Guardado pelo ÍNDICE: as vias acabam fora de ordem e a ordem das
          // fotos escolhidas é a que a Catarina vê no documento.
          results[i] = { path: im.path };
        } catch (e) {
          errors.push(
            eTempoEsgotado(e)
              ? `«${f.name}» demorou demasiado a subir (rede lenta).`
              : porqueFalhou(e, `Sem ligação: «${f.name}» não subiu.`),
          );
        } finally {
          maisUma();
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, lane));
      const paths = results.filter((r): r is { path: string } => r !== null).map((r) => r.path);
      if (reservar) {
        // Cada marcador dá lugar ao seu caminho, ONDE QUER QUE ESTEJA agora; o
        // que falhou sai. Um marcador que ela já tirou não volta a entrar.
        const trocas = new Map<string, string | null>();
        marcadores.forEach((m, i) => trocas.set(m, results[i]?.path ?? null));
        for (const [m, p] of trocas) marcadoresResolvidosRef.current.set(m, p);
        setDoc((d) => mapImagePaths(d, (p) => (trocas.has(p) ? (trocas.get(p) ?? null) : p)));
        setAssetUrls((prev) => {
          const next = { ...prev };
          for (const m of marcadores) delete next[m];
          return next;
        });
        for (const u of previas) {
          try {
            URL.revokeObjectURL(u);
          } catch {
            /* nada a libertar */
          }
        }
      } else if (paths.length > 0) onPaths(paths);
      if (errors.length > 0) {
        toast(
          errors.length === files.length
            ? errors[0]
            : `${paths.length} de ${files.length} carregadas. ${errors[0]}`,
          "error",
        );
      } else if (paths.length > 1) {
        toast(`${paths.length} imagens carregadas`, "success");
      }
    } finally {
      // A chave SAI do mapa: «não está a carregar nada» é a ausência, e não um
      // `{feito, total}` velho à espera de ser lido como se fosse de agora.
      setUploading((u) => {
        if (!(key in u)) return u;
        const resto = { ...u };
        delete resto[key];
        return resto;
      });
    }
  }

  return { handleUpload };
}
