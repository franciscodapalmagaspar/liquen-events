"use client";
import { useCallback, useRef } from "react";
import { useToast } from "../../../Toast";
import { isPendingImage, soMudaramOsIds, type MoodBoard } from "@/lib/proposal-doc";
import { ehRefDeTema } from "@/lib/theme-ref";
import { useAnular } from "../../../ui/anular";
import { temasComPagina } from "@/lib/pdf-editorial/plano";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { mapImagePaths, type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { semOTema, temasLevadosPelasLinhas } from "@/lib/orcamento/estudio/temas-e-fotos";
import type { EstadoDosUrls } from "../../tipos";
import { idsTirados } from "@/lib/orcamento/estudio/listas";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../../documento/useAccoesReversiveis";
import { useSeleccaoDeFotos } from "./useSeleccaoDeFotos";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaMoodBoards {
  anular: ReturnType<typeof useAnular>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  hidratarAssets: (
    vivo?: () => boolean,
    opcoes?: { daAbertura?: boolean },
  ) => Promise<EstadoDosUrls>;
  quote: Quote;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  seleccao: ReturnType<typeof useSeleccaoDeFotos>;
  setFotosACopiar: Dispatch<SetStateAction<number>>;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useMoodBoards({
  anular,
  documento,
  hidratarAssets,
  quote,
  reversiveis,
  seleccao,
  setFotosACopiar,
  toast,
}: EntradaMoodBoards) {
  const { camposTocadosRef, doc, docRef, setDoc } = documento;
  const { setARemover } = reversiveis;
  const { setSeleccionadas } = seleccao;

  // ── Serviços ──
  // O editor da secção vive em `ServicesEditor.tsx` (teclado, arrasto, anular).
  // Aqui fica só a ponte para o documento.
  const levadosPelasLinhas = useRef<{
    ids: string[];
    moodBoards: StudioDoc["moodBoards"];
    fotosDasPaginas: StudioDoc["fotosDasPaginas"];
    depois: StudioDoc["moodBoards"];
  } | null>(null);
  const setServiceGroups = useCallback(
    (update: (prev: StudioDoc["serviceGroups"]) => StudioDoc["serviceGroups"]) => {
      // Ver `camposTocados`: o editor de serviços é o outro caminho por onde a
      // PESSOA escreve, e é onde o texto perdido foi medido primeiro.
      //
      // MAS SÓ QUANDO ELA ESCREVEU. O editor também passa por aqui ao montar,
      // para dar ids às linhas que vêm sem eles — e contar isso como escrita
      // fazia o merge do rascunho do servidor pôr de lado os Serviços que ele
      // trazia; a gravação seguinte apagava-os do servidor. Medido: abrir a
      // proposta noutro computador deixava os Serviços vazios (relatório da
      // auditoria, n.º 1). `soMudaramOsIds` separa as duas coisas.
      //
      // E TIRAR A LINHA TIRA O MOOD BOARD DELA (12/11): «tirar a linha tem de
      // tirar o mood board sozinho». Só uma linha ou um grupo APAGADO conta (o
      // id desapareceu) — mudar o nome de uma linha não leva nada —, e o mood
      // board só sai quando casa com o que saiu e com nada do que fica
      // (`temasQueSaemComAsLinhas`). O «Anular» devolve-o, com as fotos que
      // tinha nas páginas.
      // E o «Anular» da LINHA (o do editor dos Serviços) também o devolve:
      // quando as linhas que o levaram voltam, ele volta com elas.
      const antes = docRef.current;
      const seguinte = update(antes.serviceGroups);
      const saem = temasLevadosPelasLinhas(antes, seguinte);
      const levado = levadosPelasLinhas.current;
      const voltaram =
        levado &&
        antes.moodBoards === levado.depois &&
        levado.ids.every((id) =>
          seguinte.some((g) => g.id === id || g.items.some((it) => it.id === id)),
        );
      if (voltaram) levadosPelasLinhas.current = null;
      setDoc((d) => {
        const next = update(d.serviceGroups);
        if (next === d.serviceGroups) return d;
        if (!soMudaramOsIds(d.serviceGroups, next)) camposTocadosRef.current.add("serviceGroups");
        const comServicos = { ...d, serviceGroups: next };
        if (voltaram && levado && d.moodBoards === levado.depois) {
          return {
            ...comServicos,
            moodBoards: levado.moodBoards,
            fotosDasPaginas: levado.fotosDasPaginas,
          };
        }
        if (!saem.length || d.moodBoards !== antes.moodBoards) return comServicos;
        const sem = [...saem]
          .sort((a, b) => b - a)
          .reduce((acc, bi) => semOTema(acc, bi), comServicos);
        levadosPelasLinhas.current = {
          ids: idsTirados(d.serviceGroups, next),
          moodBoards: d.moodBoards,
          fotosDasPaginas: d.fotosDasPaginas,
          depois: sem.moodBoards,
        };
        return sem;
      });
      if (saem.length) {
        const nomes = saem.map((bi) => `«${(antes.moodBoards[bi]?.title ?? "").trim()}»`);
        anular(
          saem.length === 1
            ? `O mood board ${nomes[0]} saiu com a linha.`
            : `Os mood boards ${nomes.join(", ")} saíram com a linha.`,
          () => {
            levadosPelasLinhas.current = null;
            setDoc((d) => ({
              ...d,
              moodBoards: antes.moodBoards,
              fotosDasPaginas: antes.fotosDasPaginas,
            }));
          },
        );
      }
    },
    [anular, camposTocadosRef, docRef, setDoc],
  );

  // ── Mood boards (decoracao) ──
  /**
   * Um mood board NOVO nasce a manter a forma das fotografias.
   *
   * O campo está no documento e não no código de desenho justamente para os
   * documentos ANTIGOS não mudarem (o PDF é redesenhado a cada abertura do link
   * do casal, e uma proposta já enviada não pode mudar de aspecto por baixo
   * dele). Mas uma página que ainda não existe não tem passado nenhum a
   * proteger — e o que ela pediu, por escrito e em duas páginas, foi que as
   * fotografias deixassem de sair cortadas. Portanto o que nasce hoje nasce
   * assim; o que já lá está muda quando ela quiser, no interruptor de cada
   * bloco.
   */
  function addBoard() {
    setDoc((d) => ({
      ...d,
      moodBoards: [
        ...d.moodBoards,
        { title: "", annotation: "", images: [], enquadramento: "forma-da-foto" },
      ],
    }));
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * INSERIR UM MOOD BOARD GUARDADO COMO MODELO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Porque é que isto não é um `setDoc` de uma linha ────────────────────
   * Era. E as fotos do modelo vêm com o caminho que tinham onde foram
   * guardadas — `<quoteIdOrigem>/<uuid>.jpg`, debaixo de OUTRO pedido.
   * Inseridas tal e qual, o documento novo ficava a apontar para a pasta
   * alheia: as células abriam sem miniatura (a listagem de fotos é por
   * pedido), e no dia em que esse pedido fosse apagado a proposta — a essa
   * altura já enviada — ficava sem imagens, sem ninguém dar por nada.
   *
   * É o mesmo problema que o «Criar a partir de…» já resolvia com
   * `duplicarFotosParaPedido`, e que ao inserir um BLOCO ninguém resolvia.
   *
   * ── O que NÃO se recopia ────────────────────────────────────────────────
   * As referências à Biblioteca (`tema:…`) não vivem debaixo de pedido nenhum
   * — são estáveis por construção e copiá-las seria desfazer o que a
   * referência veio ganhar (ver `theme-ref.ts`). As embutidas (`data:`) viajam
   * dentro do documento. E as que já são deste pedido ficam onde estão.
   *
   * ── E se a cópia falhar ─────────────────────────────────────────────────
   * O bloco fica na mesma, com os caminhos de origem, e diz-se. É a mesma
   * política do «Criar a partir de…»: uma proposta acoplada à pasta de outro
   * pedido é pior do que uma proposta com fotos — mas é muito melhor do que um
   * mood board vazio e um gesto que não fez nada.
   */
  async function inserirMoodBoardDeModelo(modelo: MoodBoard) {
    const novo: MoodBoard = { ...modelo, images: [...(modelo.images ?? [])] };
    setDoc((d) => ({ ...d, moodBoards: [...d.moodBoards, novo] }));

    // ── ONDE É QUE O BLOCO FICOU ──────────────────────────────────────────
    // O botão «De um modelo…» está ao FUNDO da secção e o bloco entra no fim
    // do array — mas o que sai impresso obedece à ordem dos capítulos, e um
    // bloco chamado «Cerimónia na igreja» aterra a meio da lista, muitas vezes
    // acima da dobra. Num documento comprido, «bloco inserido» é a única coisa
    // que não interessa saber: o que interessa é a página em que ele calhou.
    //
    // A posição SAI do `temasComPagina`, a mesma lista que o gerador do PDF
    // usa — contar cartões no ecrã dizia «a 3.ª» de uma página que é a 5.ª no
    // documento. Um tema sem fotografias e sem texto não chega a sair, e a
    // frase di-lo em vez de inventar um número.
    const depois = { ...doc, moodBoards: [...doc.moodBoards, novo] } as ProposalDoc;
    const saem = temasComPagina(depois);
    const pos = saem.indexOf(doc.moodBoards.length);
    const nome = (novo.title ?? "").trim() || `Inspiração ${doc.moodBoards.length + 1}`;
    toast(
      pos >= 0
        ? `«${nome}» entrou como a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.`
        : `«${nome}» entrou no fim das páginas de inspiração. Sem fotografias nem texto, não sai no PDF.`,
      "success",
    );

    // O predicado é uma função à parte, e a referência à Biblioteca fica para
    // ÚLTIMO: `ehRefDeTema` é um type guard (`ref is string`), portanto negá-lo
    // a meio estreita a string até `never` e o TypeScript recusa tudo o que
    // venha a seguir sobre a mesma variável.
    const precisaDeCopia = (p: string): boolean => {
      if (!p || p.startsWith("data:") || isPendingImage(p)) return false;
      if (p.startsWith(`${quote.id}/`)) return false;
      return !ehRefDeTema(p);
    };
    const deOutroPedido = novo.images.filter(
      (p): p is string => typeof p === "string" && precisaDeCopia(p),
    );
    if (deOutroPedido.length === 0) return;

    // ── ISTO DEIXA DE SER MUDO ────────────────────────────────────────────
    // O bloco aparece na proposta no instante do clique e as fotos vêm a
    // seguir, num pedido só que demora de dois a vinte segundos. Não havia
    // sinal nenhum disso — só um toast lá ao fim, e apenas quando corria mal.
    setFotosACopiar((n) => n + deOutroPedido.length);
    try {
      const res = await fetch("/api/propostas/copiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, fotos: deOutroPedido }),
      });
      const dados = await res.json().catch(() => null);
      const mapa = (dados?.fotos ?? {}) as Record<string, string>;
      const copiadas = Object.keys(mapa);
      if (!res.ok || copiadas.length === 0) throw new Error("sem cópias");
      // A troca é feita no documento INTEIRO e por caminho: se ela já tiver
      // mexido no bloco entretanto (arrastado, removido uma foto), a troca
      // acompanha na mesma em vez de escrever por cima do que ela fez.
      setDoc((d) => mapImagePaths(d, (p) => mapa[p] ?? p));
      // As fotos novas ainda não têm assinatura nenhuma neste ecrã.
      void hidratarAssets();
      const ficaram = deOutroPedido.length - copiadas.length;
      if (ficaram > 0) {
        toast(`${ficaram} foto(s) do modelo ficaram na pasta da proposta de origem.`, "error");
      }
    } catch {
      toast(
        "As fotos deste modelo ficaram na pasta da proposta de origem — volta a escolhê-las se essa proposta for apagada.",
        "error",
      );
    } finally {
      setFotosACopiar((n) => Math.max(0, n - deOutroPedido.length));
    }
  }
  function updateBoard(bi: number, p: Partial<StudioDoc["moodBoards"][number]>) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => (i === bi ? { ...b, ...p } : b)),
    }));
  }
  /**
   * Remover uma página de inspiração — COM PERGUNTA, e a pergunta conta.
   *
   * É a acção mais cara do estúdio inteiro: leva com ela as fotografias todas
   * daquela página, escolhidas uma a uma de entre a biblioteca e os mood boards
   * (e às vezes carregadas do telemóvel à beira do cliente), mais a folha que
   * elas ocupam no PDF. Refazê-la não é escrever outra vez um título — é voltar
   * a curar uma página inteira.
   *
   * Por isso PERGUNTA e não anulação: é rara (uma proposta tem três a oito
   * páginas e removem-se poucas), é cara, e dez segundos de «Anular» são pouco
   * para quem só dá pelo estrago ao chegar à pré-visualização.
   *
   * A frase nomeia a página pelo nome que ela lhe deu, conta as fotografias e
   * diz ONDE ela estava a sair no documento — que é a parte que decide a
   * resposta, e a única que não se vê a olhar para o cartão.
   *
   * Uma página em branco (sem título, sem descrição e sem fotos) sai sem
   * pergunta nenhuma: não há ali nada a perder, e perguntar por nada é ensinar
   * a responder que sim sem ler.
   */
  function removeBoard(bi: number) {
    const b = doc.moodBoards[bi];
    const apagar = () => {
      // A seleção para mover guarda posições («bi:ii»): depois de um tema sair,
      // apontava para fotos de outro (auditoria de 12/11, n.º 10).
      setSeleccionadas(new Set());
      setDoc((d) => semOTema(d, bi));
    };
    if (!b) return;
    const nome = (b.title ?? "").trim();
    const fotos = b.images.length;
    const temTexto = nome !== "" || (b.annotation ?? "").trim() !== "";
    if (fotos === 0 && !temTexto) {
      apagar();
      return;
    }
    // A posição SAI da mesma lista que o gerador do PDF usa (`temasComPagina`),
    // e não de contar cartões no ecrã: a ordem de saída respeita os capítulos
    // dos serviços, e as páginas sem fotos não chegam a sair. Uma segunda
    // contagem aqui dizia «a página 3» de uma página que é a 5.ª no documento.
    const saem = temasComPagina(doc as ProposalDoc);
    const pos = saem.indexOf(bi);
    const conta =
      fotos > 0
        ? `Leva com ela ${fotos} ${fotos === 1 ? "fotografia" : "fotografias"}` +
          (pos >= 0 ? `, e é a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.` : ".")
        : "Ainda não tem fotografias nenhumas — leva o título e a descrição, e mais nada.";
    setARemover({
      chave: `board:${bi}`,
      pergunta: `Remover a página «${nome || `Inspiração ${bi + 1}`}»? ${conta}`,
      docNoMomento: doc,
      aplicar: apagar,
    });
  }

  return { addBoard, inserirMoodBoardDeModelo, removeBoard, setServiceGroups, updateBoard };
}
