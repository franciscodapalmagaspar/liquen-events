"use client";
import { useCallback, useRef, useState } from "react";
import type { EstadoDosUrls } from "../tipos";

export function useMapasDasFotos() {
  // path → signed url, so freshly-uploaded images render as thumbnails.
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A HIDRATAÇÃO OU CORREU, OU AINDA VAI A CAMINHO, OU FALHOU — E ISSO VÊ-SE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
   * quando estava a fazer a proposta e não consigo» — e, nas capturas, células
   * cinzentas com a palavra «Imagem».
   *
   * Essa caixa é o ramo do `Thumb` em que NÃO HÁ URL. Num telemóvel que nunca
   * abriu esta proposta não há `localStorage` nenhum, portanto o mapa começa
   * vazio e as células dependem inteiramente desta única leitura. E ela era
   * silenciosa nos dois sentidos: enquanto ia a caminho a célula dizia
   * «Imagem», e se falhasse (`!res.ok`, sessão caducada, rede a cair) a função
   * fazia `return` e a célula dizia «Imagem» PARA SEMPRE. As duas coisas com o
   * mesmo aspecto, e nenhuma delas com uma explicação ou uma saída.
   *
   * Com isto, a célula sabe distinguir «vem a caminho» de «não veio», e há um
   * botão para tentar outra vez em vez de recarregar a página.
   */
  const [estadoDosUrls, setEstadoDosUrls] = useState<EstadoDosUrls>("a-caminho");
  /**
   * O ORIGINAL de cada foto — o plano B da célula.
   *
   * O `assetUrls` guarda o que é MELHOR desenhar (a miniatura, quando existe).
   * Uma miniatura pode não existir: as fotos anteriores às miniaturas não têm
   * nenhuma, e assinar um caminho no Storage não verifica que o ficheiro lá
   * está — devolve um URL bem formado para um objecto que dá 404. Quem
   * descobre isso é o navegador, e até aqui o que acontecia a seguir era a
   * célula desistir e dizer "não foi possível pré-visualizar".
   *
   * Este mapa é para onde ela cai. É a mesma rede que a grelha dos temas e o
   * seletor já tinham, e que só ao estúdio faltava.
   */
  const [assetOriginais, setAssetOriginais] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DEGRAU DO MEIO: A DERIVADA DE 1200 px
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A cascata de cada célula tinha DOIS degraus e nada entre eles — a miniatura
   * e, a falhar essa, o ORIGINAL. Os pesos, medidos no estúdio a 1,6 Mbps com
   * 24 células:
   *
   *     miniatura (400 px)     20 KB por célula   →   0,4 MB nas 24
   *     derivada  (1200 px)  ~200 KB por célula   →   4,8 MB nas 24
   *     original  (2200 px)   1099 KB por célula  →  26,4 MB nas 24
   *
   * E as células destas grelhas medem, medido no navegador: **~101 px aos 375,
   * ~126 px entre 640 e 1023, ~92 px aos 1024** (as fotografias dos mood
   * boards) — nenhuma delas com o que fazer a 2200 px de largura.
   *
   * Uma miniatura falha por coisas banais: a assinatura de seis horas de uma
   * foto da Biblioteca que caducou, um pedido que expirou, um `sharp` que não
   * correu. O que não era banal era a queda — de 20 KB para 1099 KB, na rede em
   * que ela está a trabalhar. Daqui em diante cai-se para 150.
   *
   * Ausente quer dizer «essa derivada ainda não foi fabricada»: a célula cai
   * directa ao original, como sempre caiu. Ver `mediasAssinadas` no `/assets`.
   */
  const [assetMedias, setAssetMedias] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS URL QUE ESTA SESSÃO JÁ VIU MORRER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `urlAindaBom` prefere o URL guardado ao fresco «enquanto servir», e quem
   * decide se serve é o prazo escrito no token. Isso está certo para o caso que
   * ele veio resolver (não deitar fora assinaturas boas e pagar trinta
   * downloads ao reabrir um rascunho) e está errado para este: um URL pode ter
   * o prazo em dia e mesmo assim dar 403 ou 404 — pasta mudada, objecto que
   * nunca chegou a subir, chave do bucket rodada.
   *
   * Sem esta memória o «Tentar novamente» de uma célula morta era um beco
   * fechado a três voltas: ia buscar a lista outra vez, recebia URLs frescos,
   * e o mapa PREFERIA o mesmo URL morto que já tinha — a `string` não mudava,
   * portanto o `useFotoComPlanoB` não via URL novo, portanto não recomeçava
   * nada. O botão pedia ao servidor e não podia usar o que ele respondia.
   *
   * Uma `ref` e não estado: só é lida DENTRO da hidratação, e um redesenho por
   * cada foto que morre numa grelha de vinte e quatro era um redesenho por
   * nada.
   */
  const urlsMortosRef = useRef<Set<string>>(new Set());
  /** Esta célula provou que este URL não abre. Ver `urlsMortos`. */
  const marcarUrlMorto = useCallback((url: string) => {
    urlsMortosRef.current.add(url);
  }, []);
  /**
   * A cor dominante de cada fotografia, `caminho → "#rrggbb"`.
   *
   * Vem do servidor (que a leu da linha da foto), e não de um `canvas` daqui:
   * estas fotos chegam por URLs assinados de OUTRO domínio, e ler-lhes os
   * píxeis lançaria — ver o cabeçalho de `cor-dominante.ts`. É com isto que se
   * avisa que uma foto destoa da paleta do board e se arruma um board por cor.
   *
   * As fotos anteriores a isto existir não estão no mapa, e não entram em
   * nenhuma das duas coisas: nunca se inventa uma cor para poder arrumar.
   */
  const [assetCores, setAssetCores] = useState<Record<string, string>>({});
  // Foto NESTA proposta → foto da BIBLIOTECA de onde foi copiada.
  //
  // A importação copia os bytes para um uuid novo, por isso o caminho de
  // destino não guarda memória nenhuma da origem — e sem essa memória o
  // seletor não consegue dizer "esta já está nesta proposta", que é
  // exatamente o que evita o mesmo ramo de eucalipto duas vezes no mesmo mood
  // board. Vive no lado ("meta") do rascunho e não no documento: é auxiliar,
  // não vai para o PDF, e um rascunho antigo — que não o tem — abre na mesma,
  // apenas sem as marcas.
  const [themeOrigins, setThemeOrigins] = useState<Record<string, string>>({});
  /**
   * ── A FORMA DE CADA FOTO, MEDIDA NA CÉLULA QUE JÁ A MOSTRA ────────────────
   *
   * Os diagramas do selector de disposição precisam do aspecto (largura ÷
   * altura) de cada fotografia: é isso que faz uma vertical sair vertical e é
   * disso que `caixasDoMoodboard` vive. A informação já está no browser — a
   * miniatura da grelha do estúdio está descodificada e sabe o seu
   * `naturalWidth`/`naturalHeight` —, por isso mede-se ALI, no `onLoad` da
   * célula (ver `Thumb`), e não se pede nada de novo ao servidor. Um pedido por
   * foto só para saber a forma seria pagar outra vez o que já foi pago, e na
   * ligação por onde ela está a trabalhar.
   *
   * Chave: o caminho no documento — a mesma foto usada em dois mood boards é
   * medida uma vez só. Não vai para o rascunho: é uma medida do ficheiro, não
   * uma decisão dela, e volta sozinha quando a célula carregar outra vez.
   *
   * O que fica de fora fica com {@link ASPETO_POR_OMISSAO}: as células são
   * `loading="lazy"` e uma que nunca chegou ao ecrã não tem medidas.
   */
  const [aspetosDasFotos, setAspetosDasFotos] = useState<Record<string, number>>({});
  /** Regista a medida de uma foto. Estável (o `Thumb` guarda-a numa `ref`) e
   *  silencioso quando o valor não mudou, para medir não redesenhar a secção. */
  const registarAspeto = useCallback((ref: string, aspeto: number) => {
    setAspetosDasFotos((m) => (m[ref] === aspeto ? m : { ...m, [ref]: aspeto }));
  }, []);

  return {
    aspetosDasFotos,
    assetCores,
    assetMedias,
    assetOriginais,
    assetUrls,
    estadoDosUrls,
    marcarUrlMorto,
    registarAspeto,
    setAssetCores,
    setAssetMedias,
    setAssetOriginais,
    setAssetUrls,
    setEstadoDosUrls,
    setThemeOrigins,
    themeOrigins,
    urlsMortosRef,
  };
}
