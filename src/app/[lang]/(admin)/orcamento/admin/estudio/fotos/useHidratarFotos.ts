"use client";

import { lerPartilhado } from "@/lib/leitura-partilhada";
import { useCallback } from "react";
import { useToast } from "../../Toast";
import { log } from "@/lib/logger";
import { urlAindaBom } from "../../assinatura";
import type { Quote } from "@/lib/orcamento/types";
import type { EstadoDosUrls } from "../tipos";
import { useMapasDasFotos } from "./useMapasDasFotos";

export interface EntradaHidratarFotos {
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useHidratarFotos({ fotos, quote, toast }: EntradaHidratarFotos) {
  const {
    setAssetCores,
    setAssetMedias,
    setAssetOriginais,
    setAssetUrls,
    setEstadoDosUrls,
    urlsMortosRef,
  } = fotos;

  // ── Hydrate signed URLs for images already in this draft ──
  // Fills in signed URLs for any image already used in the draft (covers / mood
  // boards) so thumbnails render even on a fresh device or after the cached URL
  // expired. Uploaded images are NOT offered back as a re-pickable gallery.
  //
  // É uma função e não só um efeito porque há um segundo momento em que a
  // pasta do pedido ganha fotos SEM ser por carregamento: quando um modelo
  // parcial traz fotos de outro pedido e elas são recopiadas para cá. Sem uma
  // segunda leitura, as células ficavam sem miniatura até recarregar a página.
  const hidratarAssets = useCallback(
    async (
      vivo: () => boolean = () => true,
      /** Só a da ABERTURA se junta a outra em voo: as outras (o «Tentar», depois
       *  de copiar fotos) existem para trazer uma lista NOVA (revisão de 17/11). */
      { daAbertura = false }: { daAbertura?: boolean } = {},
    ): Promise<EstadoDosUrls> => {
      {
        // «A caminho» também no reenvio: uma segunda tentativa que aparecesse
        // como «falhou» até responder era um botão que parece não fazer nada.
        setEstadoDosUrls("a-caminho");
        try {
          const url = `/api/orcamento/${quote.id}/assets`;
          const res = await (daAbertura ? lerPartilhado(url) : fetch(url));
          if (!res.ok) {
            // Um 401 (sessão caducada) e um 500 (Storage em baixo) davam os
            // dois a mesma coisa: nada. O registo diz qual foi, e o ecrã diz
            // que não conseguiu — em vez de o esconder atrás de uma caixa
            // cinzenta que se lê como «esta foto não existe».
            log.warn("estúdio: não deu para ir buscar as fotografias", {
              estado: res.status,
            });
            if (vivo()) setEstadoDosUrls("falhou");
            return "falhou";
          }
          const data = await res.json().catch(() => null);
          const imgs: {
            path: string;
            url: string;
            thumbUrl?: string;
            midUrl?: string;
            cor?: string;
          }[] = Array.isArray(data?.images) ? data.images : [];
          // Saiu de cena a meio: não há veredicto nenhum a dar a ninguém.
          if (!vivo()) return "a-caminho";
          // Zero fotografias É uma resposta: uma proposta sem fotos nenhumas
          // não tem células, e um pedido que respondeu vazio não é um pedido
          // que falhou.
          if (imgs.length === 0) {
            setEstadoDosUrls("pronto");
            return "pronto";
          }
          /**
           * O guardado só conta se ainda for um candidato: um URL que uma
           * célula desta sessão já viu morrer (403/404) não pode ganhar ao
           * fresco só por ter o prazo em dia. Ver `urlsMortos`.
           */
          const vivo_ = (u?: string) => (u && urlsMortosRef.current.has(u) ? undefined : u);
          setAssetUrls((prev) => {
            const next = { ...prev };
            // A miniatura ganha ao original: é este o caminho que corre quando se
            // REABRE uma proposta, que é onde a grelha mais pesa.
            //
            // E o guardado só ganha ao fresco ENQUANTO SERVIR. Antes era um
            // `!next[im.path]` seco, que deitava fora a assinatura fresca mesmo
            // quando a guardada já estava morta — as fotos de tema assinam a 6
            // horas, e um rascunho aberto de um dia para o outro voltava com a
            // grelha inteira a pedir URLs que o Supabase recusa. Ver
            // `assinatura.ts` para porque é que não bastava substituir sempre.
            for (const im of imgs)
              if (im.path && im.url)
                next[im.path] = urlAindaBom(vivo_(next[im.path]), im.thumbUrl || im.url);
            return next;
          });
          // O original fica guardado à parte, para a célula ter para onde cair
          // quando a miniatura não existir.
          setAssetOriginais((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.url) next[im.path] = urlAindaBom(vivo_(next[im.path]), im.url);
            return next;
          });
          // O degrau do meio, pela mesma regra do original: o guardado só
          // ganha ao fresco enquanto o prazo servir.
          //
          // Uma foto que volte SEM `midUrl` não apaga a que já se sabia: a
          // ausência quer dizer «ainda não foi fabricada», e uma resposta que
          // não a traz não é prova de que a que já se tinha morreu.
          setAssetMedias((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.midUrl)
                next[im.path] = urlAindaBom(vivo_(next[im.path]), im.midUrl);
            return next;
          });
          // As cores não expiram (não são URLs assinados): uma vez conhecidas,
          // ficam. Uma foto que volte sem cor não apaga a que já se sabia.
          setAssetCores((prev) => {
            const next = { ...prev };
            for (const im of imgs) if (im.path && im.cor) next[im.path] = im.cor;
            return next;
          });
          setEstadoDosUrls("pronto");
          return "pronto";
        } catch (e) {
          // Offline, ou o Storage em baixo. O estúdio continua a servir para
          // carregar fotos — o que não continua a servir é fingir que as que já
          // lá estão simplesmente não existem.
          log.warn("estúdio: não deu para ir buscar as fotografias", { erro: String(e) });
          if (vivo()) setEstadoDosUrls("falhou");
          return "falhou";
        }
      }
    },
    [
      quote.id,
      setAssetCores,
      setAssetMedias,
      setAssetOriginais,
      setAssetUrls,
      setEstadoDosUrls,
      urlsMortosRef,
    ],
  );

  /**
   * O «Tentar» de uma célula que não carregou.
   *
   * ── QUANDO RESULTA, NÃO SE DIZ NADA ───────────────────────────────────────
   * A fotografia aparece na própria célula onde ela carregou. Um aviso a dizer
   * «pronto» por cima de uma foto que já se vê é ruído.
   *
   * ── QUANDO NÃO RESULTA, TEM DE SE DIZER ───────────────────────────────────
   * E era este o buraco: falhar outra vez devolve exactamente a mesma caixa
   * cinzenta de antes do clique — indistinguível de um botão que não fez nada.
   * Ela carregava três, quatro vezes, sem maneira de saber se estava a pedir
   * alguma coisa ao servidor.
   */
  const tentarBuscarFotos = useCallback(async () => {
    const fim = await hidratarAssets();
    if (fim === "falhou") {
      toast(
        "Também não deu desta vez. As fotografias estão guardadas — é a lista que não vem.",
        "error",
      );
    }
  }, [hidratarAssets, toast]);

  return { hidratarAssets, tentarBuscarFotos };
}
