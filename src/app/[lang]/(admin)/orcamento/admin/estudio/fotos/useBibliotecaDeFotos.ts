"use client";
import { type ImportedImage, type ReservedImage } from "../../ThemePicker";
import { mapImagePaths } from "@/lib/orcamento/estudio/documento-inicial";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "./useMapasDasFotos";
import { useCapa } from "../passos/evento/useCapa";
import { useFotosDosBoards } from "../passos/inspiracao/useFotosDosBoards";
import { useEscolhaDeFotos } from "./useEscolhaDeFotos";
import { useFotosDaPagina } from "../pdf/useFotosDaPagina";
import { useDisposicaoDasPaginas } from "../pdf/useDisposicaoDasPaginas";

export interface EntradaBibliotecaDeFotos {
  capa: ReturnType<typeof useCapa>;
  disposicao: ReturnType<typeof useDisposicaoDasPaginas>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  escolha: ReturnType<typeof useEscolhaDeFotos>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  fotosDaPagina: ReturnType<typeof useFotosDaPagina>;
  fotosDosBoards: ReturnType<typeof useFotosDosBoards>;
}

export function useBibliotecaDeFotos({
  capa,
  disposicao,
  documento,
  escolha,
  fotos,
  fotosDaPagina,
  fotosDosBoards,
}: EntradaBibliotecaDeFotos) {
  const { setCoverAt } = capa;
  const { porFotoNaPagina } = disposicao;
  const { marcadoresResolvidosRef, setDoc } = documento;
  const { picker } = escolha;
  const { setAssetOriginais, setAssetUrls, setThemeOrigins } = fotos;
  const { paginaDaFoto } = fotosDaPagina;
  const { addBoardImages, substituirFotoDoBoard } = fotosDosBoards;

  /**
   * O INSTANTE DO CLIQUE — a foto ocupa já o seu lugar.
   *
   * O seletor entrega um marcador por foto (`pending:<uuid>`), que não é
   * caminho de coisa nenhuma, e a miniatura que ele JÁ tem desenhada em
   * memória. O marcador entra no documento no sítio para onde o seletor foi
   * aberto e o `assetUrls` aponta-o a essa miniatura: a foto aparece no mood
   * board (ou na capa) sem um único pedido de rede novo, na célula certa e com
   * o mesmo `aspect-ratio` das outras — nada salta quando ela assentar.
   *
   * A origem entra AQUI e não só na confirmação: uma foto a caminho já conta
   * como "já nesta proposta" (ver `usedThemePaths`), senão dava para a escolher
   * outra vez enquanto a primeira cópia ainda ia a caminho.
   */
  function onReservedFromLibrary(reservas: ReservedImage[]) {
    if (reservas.length === 0) return;
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.thumbUrl) next[r.marcador] = r.thumbUrl;
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.sourcePath) next[r.marcador] = r.sourcePath;
      return next;
    });
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, reservas[0].marcador);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        reservas.map((r) => r.marcador),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, reservas[0].marcador);
    } else if (picker?.kind === "pagina" && paginaDaFoto) {
      porFotoNaPagina(
        picker.chave,
        paginaDaFoto.nome,
        picker.max,
        picker.lugar,
        reservas[0].marcador,
      );
    }
  }

  // As fotos escolhidas vêm REFERENCIADAS (`tema:<caminho>`) pela rota
  // /assets/importar — deixaram de ser copiadas. Para o documento é
  // indiferente: continua a ser uma string por foto, e quem a resolve (a grelha
  // aqui, o gerador de PDF lá) sabe ler as duas famílias. O porquê está em
  // `src/lib/theme-ref.ts`.
  //
  // O seletor entrega as fotos LOTE A LOTE (é assim que a barra de progresso
  // pode ser verdadeira), por isso isto corre várias vezes por importação.
  //
  // Cada foto que traz o seu `marcador` é uma TROCA NO LUGAR: o marcador provisório
  // dá lugar ao caminho definitivo na mesma célula, sem reordenar nada. As que
  // vêm sem `marcador` — quem não reservou lugar, ou um lote que o servidor não
  // deixou emparelhar com segurança — são acrescentadas, como sempre foram.
  //
  // Um marcador que já não esteja no documento (ela removeu a foto enquanto a
  // cópia ia a caminho) não volta a entrar: a decisão dela é mais recente.
  function onPickedFromLibrary(images: ImportedImage[]) {
    if (images.length === 0) return;
    const trocas = new Map<string, string>();
    const novas: ImportedImage[] = [];
    for (const im of images) {
      if (!im.path) continue;
      if (im.marcador) trocas.set(im.marcador, im.path);
      else novas.push(im);
    }
    setAssetUrls((prev) => {
      const next = { ...prev };
      // A miniatura é a DO TEMA — o mesmo `theme-thumbs/<pasta>/<x>.jpg` que o
      // seletor acabou de mostrar. É esse o ganho da referência: o service
      // worker já a tem no disco (guarda por caminho, sem marcador), portanto a
      // célula desenha sem tocar na rede.
      for (const im of images) if (im.path && im.url) next[im.path] = im.thumbUrl || im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setAssetOriginais((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.url) next[im.path] = im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.sourcePath) next[im.path] = im.sourcePath;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    if (trocas.size > 0) {
      for (const [m, p] of trocas) marcadoresResolvidosRef.current.set(m, p);
      setDoc((d) => mapImagePaths(d, (p) => trocas.get(p) ?? p));
    }
    if (novas.length === 0) return;
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, novas[0].path);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        novas.map((im) => im.path),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, novas[0].path);
    } else if (picker?.kind === "pagina" && paginaDaFoto) {
      porFotoNaPagina(picker.chave, paginaDaFoto.nome, picker.max, picker.lugar, novas[0].path);
    }
  }

  /**
   * A cópia falhou (ou foi parada): o lugar reservado desaparece.
   *
   * SEM AVISO NENHUM daqui — a pastilha do seletor já diz quantas não entraram,
   * porquê, e oferece "Repetir". Um segundo aviso a dizer o mesmo só ensinaria
   * a ignorar os dois.
   */
  function onDroppedFromLibrary(marcadores: string[]) {
    if (marcadores.length === 0) return;
    const perdidos = new Set(marcadores);
    for (const m of marcadores) marcadoresResolvidosRef.current.set(m, null);
    setDoc((d) => mapImagePaths(d, (p) => (perdidos.has(p) ? null : p)));
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
  }

  return { onDroppedFromLibrary, onPickedFromLibrary, onReservedFromLibrary };
}
