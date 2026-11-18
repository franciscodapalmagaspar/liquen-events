"use client";
import { useEffect } from "react";

import { normaliseCoverImages, stripPendingImages } from "@/lib/proposal-doc";

import { docTemIngles } from "@/lib/proposal-doc-bilingue";
import { baseDoPedidoParaOEcra, type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { aplicarBase, baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { ehObjecto } from "@/lib/orcamento/estudio/eh-objecto";

import type { EntradaAberturaDoEstudio } from "./entrada-da-abertura";

/** A abertura do estúdio, 2.º tempo: o rascunho do servidor, que vale se for mais recente. */
export function useAbrirORascunhoDoServidor({
  DRAFT_KEY,
  camposPorConfirmar,
  documento,
  quote,
  rascunho,
  servidor,
  toast,
  total,
  traducoes,
}: EntradaAberturaDoEstudio) {
  const { setPorConfirmar } = camposPorConfirmar;
  const { camposTocadosRef, docAssenteRef, historicoRef, setDoc } = documento;

  const { aAbrirRef, docDoServidorRef, serverStampRef, setAberturaAssente } = rascunho;
  const { enviarParaServidor } = servidor;
  const { setTotalInput } = total;
  const { setBilingue } = traducoes;

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
        serverStampRef.current = typeof draft.updatedAt === "string" ? draft.updatedAt : null;
        docDoServidorRef.current = ehObjecto(draft.doc) ? draft.doc : null;
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
        Object.entries(doDoServidor).filter(([chave]) => !camposTocadosRef.current.has(chave)),
      ) as Partial<StudioDoc>;
      // A abertura ACABA AQUI quando há rascunho no servidor.
      //
      // Sem isto, o que este merge produz — o rascunho do servidor com o preço
      // do pedido por cima, e sem os marcadores provisórios — ficava por
      // gravar: era «a abertura», e a abertura não se grava. Mas isto não é
      // uma abertura derivada do pedido, é trabalho vindo de outro dispositivo
      // com uma correcção aplicada em cima. Ver o bloco «A ABERTURA TAMBÉM NÃO
      // É TRABALHO POR GRAVAR».
      aAbrirRef.current = false;
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
        if (base != null && !camposTocadosRef.current.has("__total")) {
          setTotalInput(textoDoTotal(base));
        }
        const adoptado = paraOEcra == null ? limpo : aplicarBase(limpo, paraOEcra);
        // O ponto de partida do ⌘Z passa a ser ESTE documento: desfazer não
        // pode voltar ao que estava no ecrã antes de o rascunho do servidor
        // chegar (revisão de 13/11) — e a gravação seguinte escrevê-lo-ia por
        // cima do trabalho bom.
        docAssenteRef.current = adoptado;
        historicoRef.current = [];
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
