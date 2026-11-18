"use client";
import { useEffect } from "react";

import { normaliseCoverImages, stripPendingImages } from "@/lib/proposal-doc";
import { ehIdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import { semAssinaturasMortas } from "../../assinatura";

import { docTemIngles } from "@/lib/proposal-doc-bilingue";
import {
  baseDoPedidoParaOEcra,
  seedDefaults,
  type StudioDoc,
} from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { aplicarBase, baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";

import type { EntradaAberturaDoEstudio } from "./entrada-da-abertura";

/** A abertura do estúdio, 1.º tempo: o rascunho deste computador (`localStorage`), uma vez só. */
export function useAbrirORascunhoLocal({
  DRAFT_KEY,
  SIDE_KEY,
  camposPorConfirmar,
  documento,
  fotos,
  quote,
  rascunho,
  setRefEdited,
  total,
  traducoes,
}: EntradaAberturaDoEstudio) {
  const { setPorConfirmar } = camposPorConfirmar;
  const { setDoc } = documento;
  const { setAssetCores, setAssetMedias, setAssetOriginais, setAssetUrls, setThemeOrigins } = fotos;
  const { aAbrirRef, hydratedRef } = rascunho;

  const { persistirPreco, precoEnviadoRef, setTotalInput } = total;
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
    if (hydratedRef.current) return;
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
      precoEnviadoRef.current = doPedido;
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
    hydratedRef.current = true;
    // SÓ quando não havia rascunho nenhum. Ver o bloco «A ABERTURA TAMBÉM NÃO
    // É TRABALHO POR GRAVAR»: abrir um pedido virgem é semear o que veio do
    // pedido, e isso não se grava; abrir um pedido COM rascunho é outra coisa
    // — o restauro corrige o que lá está (tira marcadores provisórios de fotos
    // que nunca chegaram a existir, acerta o total pelo «Preço final» do
    // pedido) e essas correcções TÊM de ficar gravadas.
    if (!hadDraft) aAbrirRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
