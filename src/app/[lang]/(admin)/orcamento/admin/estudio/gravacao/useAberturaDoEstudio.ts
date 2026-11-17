"use client";
import { useEffect } from "react";
import { useToast } from "../../Toast";
import { normaliseCoverImages, stripPendingImages } from "@/lib/proposal-doc";
import { ehIdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { semAssinaturasMortas } from "../../assinatura";
import type { Quote } from "@/lib/orcamento/types";
import { docTemIngles } from "@/lib/proposal-doc-bilingue";
import {
  baseDoPedidoParaOEcra,
  seedDefaults,
  type StudioDoc,
} from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { aplicarBase, baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { ehObjecto } from "@/lib/orcamento/estudio/eh-objecto";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useCamposPorConfirmar } from "../versoes/useCamposPorConfirmar";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { useTraducoes } from "../traducoes/useTraducoes";
import { useEstadoDoRascunho } from "./useEstadoDoRascunho";
import { useGravarNoServidor } from "./useGravarNoServidor";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaAberturaDoEstudio {
  DRAFT_KEY: string;
  SIDE_KEY: string;
  camposPorConfirmar: ReturnType<typeof useCamposPorConfirmar>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  rascunho: ReturnType<typeof useEstadoDoRascunho>;
  servidor: ReturnType<typeof useGravarNoServidor>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
  traducoes: ReturnType<typeof useTraducoes>;
}

export function useAberturaDoEstudio({
  DRAFT_KEY,
  SIDE_KEY,
  camposPorConfirmar,
  documento,
  fotos,
  quote,
  rascunho,
  servidor,
  setRefEdited,
  toast,
  total,
  traducoes,
}: EntradaAberturaDoEstudio) {
  const { setPorConfirmar } = camposPorConfirmar;
  const { camposTocados, docAssente, historico, setDoc } = documento;
  const { setAssetCores, setAssetMedias, setAssetOriginais, setAssetUrls, setThemeOrigins } = fotos;
  const { aAbrir, docDoServidor, hydrated, serverStamp, setAberturaAssente } = rascunho;
  const { enviarParaServidor } = servidor;
  const { persistirPreco, precoEnviado, setTotalInput } = total;
  const { setBilingue, setIdiomaDoPdf } = traducoes;

  // ── Restore draft on mount ──
  //
  // ════════════════════════════════════════════════════════════════════════
  // CORRE UMA VEZ SÓ, E O `return` DE CIMA É O QUE O GARANTE
  // ════════════════════════════════════════════════════════════════════════
  //
  // As dependências vazias não chegam. Em desenvolvimento o React monta,
  // limpa e volta a montar cada componente de propósito (`reactStrictMode`),
  // e este efeito corria as duas vezes — mas a SEGUNDA já não lia o rascunho
  // dela. Lia o que a gravação automática tinha entretanto escrito por cima.
  //
  // A sequência medida, com um rascunho de 2 boards no `localStorage`:
  //
  //   1ª passagem   lê 2 boards, põe `setDoc` na fila, `hydrated = true`
  //   (a limpeza)   `hydrated` já é `true`, portanto a desmontagem simulada
  //                 grava — e o documento que ela tem à mão ainda é o de
  //                 ANTES do restauro: escreve 0 boards por cima dos 2
  //   2ª passagem   lê os 0 boards que acabaram de ser escritos e mete-os
  //                 na fila também
  //   fim           as duas actualizações correm por ordem: 0 → 2 → 0
  //
  // Resultado: o estúdio abria vazio com o trabalho todo no `localStorage`, e
  // a gravação seguinte tornava a perda definitiva. Era isto que impedia
  // qualquer teste de ponta-a-ponta de partir de um rascunho semeado — a
  // suite das propostas corre contra o servidor de DESENVOLVIMENTO, que é
  // precisamente onde a segunda passagem existe.
  //
  // Um efeito de restauro tem de ser idempotente: correr outra vez não pode
  // significar ler outra vez. Lido uma vez, fica lido.
  useEffect(() => {
    if (hydrated.current) return;
    let hadDraft = false;
    /** O rascunho deste aparelho, já lido — e a BASE que ele traz. Guardam-se
     *  aqui fora porque o ramo do «o pedido ainda não tem preço», lá em baixo,
     *  precisa dos dois: ler `totalInput` ali daria SEMPRE a cadeia vazia (o
     *  `setTotalInput` de cima só entra em vigor na render seguinte), e a
     *  conversão para o pedido precisa dos adicionais DO RASCUNHO, não dos do
     *  documento em branco que ainda está no estado. */
    let rascunhoLocal: StudioDoc | null = null;
    let baseDoRascunho: number | undefined;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          hadDraft = true;
          // Rascunhos antigos guardaram a capa esparsa (`[null, "foto"]`) ou
          // curta (`["foto"]`) — normalizar já aqui mantém a foto da direita
          // na posição da direita.
          setDoc((d) => {
            const merged = { ...d, ...parsed };
            // `stripPendingImages` também aqui: gravar já os filtra, mas um
            // rascunho escrito por uma versão anterior (ou por outra aba) não
            // pode fazer aparecer no ecrã um caminho que nunca vai existir.
            return stripPendingImages({
              ...merged,
              coverImages: normaliseCoverImages(merged.coverImages),
            });
          });
          rascunhoLocal = parsed as StudioDoc;
          // A BASE, não o `totalAmount` cru — ver `baseDoDoc`.
          const base = baseDoDoc(parsed);
          baseDoRascunho = base;
          if (base != null) setTotalInput(textoDoTotal(base));
          // Um rascunho que já traz traduções abre com as caixas inglesas à
          // vista, haja `meta` ou não: texto que existe no documento e não
          // aparece no ecrã é texto que se perde sem ninguém dar por isso.
          if (docTemIngles(parsed)) setBilingue(true);
        }
      }
      const rawMeta = localStorage.getItem(SIDE_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        // Só as assinaturas que AINDA SERVEM: as da Biblioteca duram seis
        // horas, e um rascunho de ontem trazia-as mortas para o ecrã — um 400
        // do Storage por célula e por degrau, antes de a hidratação chegar.
        // Ver `semAssinaturasMortas` em `assinatura.ts`.
        if (meta?.urls && typeof meta.urls === "object") {
          setAssetUrls(semAssinaturasMortas(meta.urls));
        }
        // Rascunhos gravados antes de o plano B existir não o têm: abrem na
        // mesma, e a hidratação preenche-o assim que responder.
        if (meta?.originais && typeof meta.originais === "object") {
          setAssetOriginais(semAssinaturasMortas(meta.originais));
        }
        // O degrau do meio viaja com o rascunho pela mesma razão que o plano B,
        // e rascunhos gravados antes de ele existir não o têm: abrem na mesma,
        // com a cascata de dois degraus, até a hidratação responder.
        if (meta?.medias && typeof meta.medias === "object") {
          setAssetMedias(semAssinaturasMortas(meta.medias));
        }
        // Rascunhos guardados antes de as cores existirem não as têm: abrem na
        // mesma, e a hidratação preenche-as assim que o servidor responder.
        if (meta?.cores && typeof meta.cores === "object") setAssetCores(meta.cores);
        // Rascunhos guardados antes de isto existir não têm `themeOrigins` —
        // abrem na mesma, só sem as marcas de "já nesta proposta".
        if (meta?.themeOrigins && typeof meta.themeOrigins === "object") {
          setThemeOrigins(meta.themeOrigins);
        }
        if (typeof meta?.refEdited === "boolean") setRefEdited(meta.refEdited);
        /**
         * O interruptor «Proposta bilingue» volta com o rascunho — e lê-se AQUI
         * pela razão que o bloco de cima conta: um `useEffect` novo a ler o
         * `localStorage` é a porta por onde o defeito do restauro voltaria a
         * entrar. Uma linha, no mesmo bloco, com a mesma tolerância a rascunhos
         * antigos que não o têm.
         *
         * `if (…) setBilingue(true)` e não `setBilingue(meta.bilingue)`: um
         * `meta` gravado com `false` não pode desligar um interruptor que o
         * documento restaurado acabou de acender (ver logo a seguir).
         */
        if (meta?.bilingue === true) setBilingue(true);
        /**
         * ── A LÍNGUA ESCOLHIDA VOLTA COM O RASCUNHO ─────────────────────────
         *
         * Aqui dentro, no efeito que corre uma vez só, pela razão que o bloco
         * de cima conta.
         *
         * E ao contrário do interruptor bilingue, esta lê-se NOS DOIS SENTIDOS
         * (`setIdiomaDoPdf(meta.idioma)` e não `if (…=== "en")`): o interruptor
         * tem uma segunda fonte — o documento com traduções lá dentro acende-o
         * sozinho —, a língua não tem nenhuma. Guardar só o «en» era guardar
         * metade da escolha, e voltar atrás para português deixava de pegar.
         *
         * Porque é que isto tem de sobreviver: a língua vai GRAVADA com o
         * envio. Decide o email que o casal recebe, o nome do anexo, a página
         * onde ele responde e a segunda descarga. Reposta em silêncio, uma
         * proposta escrita e revista em inglês seguia em português para um
         * casal que não lê português — e no ecrã nada tinha dito que a escolha
         * se perdeu. Rascunhos guardados antes disto existir não trazem o
         * campo: abrem em português, que é o que já faziam.
         */
        if (ehIdiomaDaProposta(meta?.idioma)) setIdiomaDoPdf(meta.idioma);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Só semeia defaults quando NÃO havia rascunho guardado — um rascunho
    // existente (mesmo sem grupos) nunca é sobrescrito.
    if (!hadDraft) {
      setDoc((d) => seedDefaults(d, quote));
      // E NÃO marca nada. A razão está por extenso no `realce`, mais abaixo:
      // marcar o que vem do pedido acendia seis anéis em TODAS as propostas, e
      // um aviso que está sempre ligado deixa de ser um aviso.
      setPorConfirmar(new Set());
    }

    // O VALOR é a excepção, e de propósito: vem SEMPRE do pedido, haja rascunho
    // ou não. Era aqui que os dois números se separavam — com rascunho, o
    // estúdio nunca mais olhava para o "Preço final", e uma alteração feita na
    // Gestão do pedido não chegava ao PDF.
    const doPedido = quote.quotedPrice;
    if (typeof doPedido === "number" && doPedido > 0) {
      precoEnviado.current = doPedido;
      /**
       * ── AQUI ESTAVA O VALOR A CRESCER SOZINHO ──────────────────────────
       *
       * Isto punha o preço do PEDIDO no campo do ESCRITO, sem lhe tirar os
       * adicionais. O pedido guarda o que o casal paga (serviços + deslocação);
       * o campo diz «Valor (sem IVA)» e significa só os serviços. Com os dois
       * a receber o mesmo número, a gravação seguinte somava a deslocação
       * outra vez — e a visita seguinte começava do número já inflacionado.
       *
       * 3.000 → 3.140 → 3.280 → 3.420. Uma soma por visita.
       *
       * A conversão é a mesma que o outro sentido da sincronização já fazia
       * (ver o efeito de `quote.quotedPrice`). O que faltava era usá-la aqui.
       *
       * O `setTotalInput` vai DENTRO do `setDoc` porque a conversão precisa do
       * documento — dos adicionais e do modo de IVA — e ler `doc` fora do
       * actualizador daria o estado anterior à hidratação do rascunho.
       */
      setDoc((d) => {
        const paraOEcra = baseDoPedidoParaOEcra(doPedido, d);
        // `null` = a conta não dá. NÃO se esvazia o campo: um campo em branco
        // numa proposta que tem preço é ela a ver desaparecer o que escreveu, e
        // a gravação seguinte levava o branco à frente. Fica o que o documento
        // já diz, e o aviso de desalinhamento explica a diferença.
        if (paraOEcra == null) return d;
        setTotalInput(textoDoTotal(paraOEcra));
        return aplicarBase(d, paraOEcra);
      });
    } else if (hadDraft) {
      // O pedido ainda não tem preço mas o rascunho tem um valor escrito antes
      // de isto existir. Não se deita fora: adopta-se, e GRAVA-SE no pedido —
      // é o que faz os dois convergirem numa verdade só, em vez de escolher
      // uma e perder a outra.
      //
      // ── E LIA O CAMPO ERRADO ────────────────────────────────────────────
      //
      // Estava `parseMoneyText(totalInput)`, e `totalInput` aqui é SEMPRE "":
      // começa vazio e o `setTotalInput` de cima só entra em vigor na render
      // seguinte. O ramo nunca gravava nada — a promessa escrita nele («os dois
      // convergem numa verdade só») não se cumpria uma única vez, e um pedido
      // sem preço com uma proposta escrita continuava a aparecer sem dinheiro
      // nenhum na Visão Geral, no Kanban e no dossier.
      //
      // Lê-se agora a base DO RASCUNHO, e a conversão para o pedido é feita
      // contra o rascunho — que é quem tem os adicionais. Ver
      // `baseDoEcraParaOPedido`.
      if (baseDoRascunho != null && baseDoRascunho > 0) {
        persistirPreco(baseDoRascunho, rascunhoLocal ? { doc: rascunhoLocal } : undefined);
      }
    }
    hydrated.current = true;
    // SÓ quando não havia rascunho nenhum. Ver o bloco «A ABERTURA TAMBÉM NÃO
    // É TRABALHO POR GRAVAR»: abrir um pedido virgem é semear o que veio do
    // pedido, e isso não se grava; abrir um pedido COM rascunho é outra coisa
    // — o restauro corrige o que lá está (tira marcadores provisórios de fotos
    // que nunca chegaram a existir, acerta o total pelo «Preço final» do
    // pedido) e essas correcções TÊM de ficar gravadas.
    if (!hadDraft) aAbrir.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── O rascunho que está no SERVIDOR ──
  // A cópia local abre primeiro (é instantânea e funciona sem rede); logo a
  // seguir vai-se buscar a do servidor e, se for mais recente, é essa que
  // vale. É isto que faz começar no portátil e continuar no tablet — e que
  // impede limpar o histórico de apagar trabalho.
  useEffect(() => {
    let active = true;
    (async () => {
      // O que este navegador tem guardado, e de quando. Lê-se ANTES de falar
      // com o servidor porque é isto que decide se há alguma coisa para
      // resgatar — ver o bloco do resgate, mais abaixo.
      let localStamp = 0;
      let docLocal: unknown = null;
      try {
        localStamp = Number(localStorage.getItem(`${DRAFT_KEY}:at`) ?? 0);
        const cru = localStorage.getItem(DRAFT_KEY);
        if (cru) docLocal = JSON.parse(cru);
      } catch {
        /* localStorage indisponível ou rascunho ilegível — fica a valer o servidor */
      }

      let leituraOk = false;
      let draft: { doc?: unknown; updatedAt?: string } | null = null;
      try {
        // `fetch` e não `lerPartilhado`: dá a BASE das gravações (`serverStamp`),
        // e juntá-la a um pedido anterior a uma gravação dava uma base velha.
        const res = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
          cache: "no-store",
        });
        if (res.ok) {
          leituraOk = true;
          const data = await res.json().catch(() => null);
          const d = data?.draft;
          if (d?.doc && typeof d.doc === "object") draft = d;
        }
      } catch {
        /* sem rede: continua-se com a cópia local, como antes */
      }
      if (!active) return;
      if (draft) {
        serverStamp.current = typeof draft.updatedAt === "string" ? draft.updatedAt : null;
        docDoServidor.current = ehObjecto(draft.doc) ? draft.doc : null;
      }

      const carimboDoServidor = draft ? Date.parse(draft.updatedAt ?? "") || 0 : 0;
      const localMaisRecente = localStamp > carimboDoServidor;

      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RESGATE DO QUE FICOU PRESO NESTE NAVEGADOR
       * ══════════════════════════════════════════════════════════════════════
       *
       * Este é o caminho por onde o trabalho da colaboradora volta. Enquanto o
       * servidor recusou as gravações, tudo o que ela montou ficou no
       * `localStorage` daquele portátil — intacto, e invisível para toda a
       * gente. O estúdio abria, via que o servidor não tinha rascunho nenhum, e
       * não fazia nada com essa informação: esperava pela próxima tecla.
       *
       * Agora, ao abrir, se a cópia deste navegador for mais recente do que a
       * do servidor — ou se o servidor não tiver nenhuma e esta existir —
       * tenta-se ENVIÁ-LA outra vez. É o gesto que a pessoa faria se soubesse
       * que tinha de o fazer, feito sem ela ter de saber.
       *
       * Só quando a leitura CORREU BEM. Se o `GET` falhou não se sabe o que
       * está lá; escrever por cima às cegas podia apagar uma versão mais
       * recente feita noutro dispositivo, e trocar uma perda por outra não é
       * resgate nenhum.
       */
      if (leituraOk && docLocal && typeof docLocal === "object" && (localMaisRecente || !draft)) {
        // Os marcadores provisórios saem, como em qualquer gravação. Mas se o
        // rascunho preso for de uma versão antiga e não tiver a forma toda, o
        // que se envia é o que lá está: entre enviar com um marcador a mais e
        // não enviar de todo, envia-se — é isto que está a resgatar trabalho.
        let paraEnviar: unknown = docLocal;
        try {
          paraEnviar = stripPendingImages(docLocal as StudioDoc);
        } catch {
          /* fica o original */
        }
        void (async () => {
          const r = await enviarParaServidor(paraEnviar);
          // Dizer que o resgate aconteceu é metade do resgate: sem isto ela não
          // tem como saber que o que estava preso já está a salvo, e continua a
          // não fechar o portátil.
          if (active && r.estado === "guardado") {
            toast(
              "O rascunho que estava guardado só neste computador foi enviado para o servidor. Já pode ser aberto noutro dispositivo.",
              "success",
            );
          }
        })();
      }

      if (!draft?.doc || typeof draft.doc !== "object") return;
      // A local só ganha se for MESMO mais recente; em empate vale a do
      // servidor, que é a que os outros dispositivos veem.
      if (localMaisRecente) return;
      // ── O VALOR É A EXCEPÇÃO, AQUI TAMBÉM ───────────────────────────
      //
      // A montagem aplica o "Preço final" do PEDIDO por cima do rascunho,
      // de propósito e com a razão escrita lá em cima: é o mesmo número
      // visto de dois sítios. Este merge, 100–300 ms depois, punha o
      // `totalAmount` do rascunho por cima outra vez — e ganhava quase
      // sempre, porque o carimbo local é escrito ANTES do PUT e o
      // `updatedAt` do servidor DEPOIS, portanto a comparação de datas
      // acima está estruturalmente a favor do servidor.
      //
      // O percurso: ela corrigia o preço de 8.100 para 9.400 na Gestão do
      // pedido, voltava ao estúdio, e o campo voltava sozinho a 8.100. Ao
      // enviar, gravava 8.100 e a correcção desaparecia dos DOIS lados.
      //
      // O rascunho traz o texto, as fotos e as condições — tudo menos o
      // valor. Quem manda no valor é o pedido, e só quando ele tem um.
      const doPedido = quote.quotedPrice;
      const mandaOPedido = typeof doPedido === "number" && doPedido > 0;
      const doDoServidor = draft.doc as Partial<StudioDoc>;
      /**
       * ── E OS CAMPOS EM QUE ELA JÁ ESTÁ COM AS MÃOS FICAM DE FORA ────────
       *
       * Ver o bloco do `camposTocados`, mais abaixo. Sem isto, escrever no
       * primeiro segundo depois de o ecrã abrir perdia o princípio da frase —
       * medido, sete rondas em oito.
       */
      const semOsQueElaTocou = Object.fromEntries(
        Object.entries(doDoServidor).filter(([chave]) => !camposTocados.current.has(chave)),
      ) as Partial<StudioDoc>;
      // A abertura ACABA AQUI quando há rascunho no servidor.
      //
      // Sem isto, o que este merge produz — o rascunho do servidor com o preço
      // do pedido por cima, e sem os marcadores provisórios — ficava por
      // gravar: era «a abertura», e a abertura não se grava. Mas isto não é
      // uma abertura derivada do pedido, é trabalho vindo de outro dispositivo
      // com uma correcção aplicada em cima. Ver o bloco «A ABERTURA TAMBÉM NÃO
      // É TRABALHO POR GRAVAR».
      aAbrir.current = false;
      setDoc((d) => {
        const merged = { ...d, ...semOsQueElaTocou };
        const limpo = stripPendingImages({
          ...merged,
          coverImages: normaliseCoverImages(merged.coverImages),
        });
        /**
         * ── E O PREÇO DO PEDIDO ATRAVESSA PELA CONVERSÃO, COMO NA MONTAGEM ──
         *
         * Aqui estava `aplicarBase(limpo, doPedido)`: o «Preço final» do pedido
         * — que é o que o casal paga, adicionais INCLUÍDOS — escrito em cru no
         * campo que significa só os SERVIÇOS. `dinheiroDaProposta` somava-lhe
         * a deslocação outra vez por baixo, e o total subia exactamente o valor
         * dos adicionais. Medido numa proposta já enviada, com 895,00 € de
         * deslocação: o PDF dizia 10.778,74 € sem IVA e o estúdio reabria a
         * dizer 11.673,74 €.
         *
         * É o MESMO defeito que a montagem já tinha fechado (ver «AQUI ESTAVA
         * O VALOR A CRESCER SOZINHO») — sobrevivia neste segundo efeito, que é
         * o que corre quase sempre: o carimbo local é escrito ANTES do PUT e o
         * `updatedAt` do servidor DEPOIS, portanto a comparação de datas está
         * estruturalmente a favor do servidor. E é também o caminho do
         * telemóvel que abre dias depois sem rascunho guardado nenhum.
         *
         * E ESCALAVA: o número inflacionado ficava no `totalAmount` do rascunho
         * gravado a seguir, e a visita seguinte partia de lá.
         *
         * `null` = a conta não dá (o preço do pedido é menor do que os
         * adicionais escritos). Deixa-se o documento como está, pela razão que
         * está escrita em `baseParaOEstudio`: o aviso de desalinhamento já diz
         * o que se passa, e inventar um número aqui fazia o preço do PEDIDO
         * subir na gravação seguinte.
         */
        const paraOEcra = mandaOPedido ? baseDoPedidoParaOEcra(doPedido, limpo) : null;
        // O campo do total é estado à parte e a conversão precisa do documento
        // MERGIDO (dos adicionais e do modo de IVA que vieram do servidor), por
        // isso lê-se aqui dentro — a mesma razão que a montagem tem escrita.
        const base = mandaOPedido ? paraOEcra : (baseDoDoc(doDoServidor) ?? null);
        if (base != null && !camposTocados.current.has("__total")) {
          setTotalInput(textoDoTotal(base));
        }
        const adoptado = paraOEcra == null ? limpo : aplicarBase(limpo, paraOEcra);
        // O ponto de partida do ⌘Z passa a ser ESTE documento: desfazer não
        // pode voltar ao que estava no ecrã antes de o rascunho do servidor
        // chegar (revisão de 13/11) — e a gravação seguinte escrevê-lo-ia por
        // cima do trabalho bom.
        docAssente.current = adoptado;
        historico.current = [];
        return adoptado;
      });
      // O que estava marcado como «vindo do pedido» deixou de estar no ecrã: o
      // que se vê agora é o rascunho dela, feito noutro dispositivo. Manter os
      // anéis pedia confirmação de texto que ela já escreveu — e o anel só vale
      // enquanto quiser dizer «isto não é teu».
      setPorConfirmar(new Set());
      // O documento do servidor pode trazer traduções que este computador nunca
      // viu — é o caso de abrir a proposta noutro portátil. As caixas inglesas
      // acendem-se, pela mesma razão do restauro local.
      if (docTemIngles(doDoServidor)) setBilingue(true);
    })()
      // A abertura ASSENTOU — o rascunho local já foi restaurado e o do
      // servidor já foi lido (ou já se sabe que não há, ou que não dá para
      // perguntar). É a partir daqui que a conferência com o documento que
      // seguiu para o cliente pode olhar para números estáveis; antes disto
      // olhava para um ecrã a meio de ser montado e acusava diferenças que se
      // desfaziam sozinhas 200 ms depois.
      .finally(() => {
        if (active) setAberturaAssente(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);
}
