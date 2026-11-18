"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_HISTORICO } from "../limites";
import { isPendingImage, stripPendingImages } from "@/lib/proposal-doc";
import type { useNucleoDoEstudio } from "./useNucleoDoEstudio";

export function useRascunhoGuardaSozinho({
  avisos,
  chavesDoRascunho,
  documento,
  fotos,
  pedido,
  rascunho,
  rascunhoSobreposto,
  referencia,
  servidor,
  traducoes,
}: Pick<
  ReturnType<typeof useNucleoDoEstudio>,
  | "avisos"
  | "chavesDoRascunho"
  | "documento"
  | "fotos"
  | "pedido"
  | "rascunho"
  | "rascunhoSobreposto"
  | "referencia"
  | "servidor"
  | "traducoes"
>) {
  const {
    aGravarNoServidor,
    avisoDoSoLocalPorDar,
    avisouJuncaoRef,
    flushDraftRef,
    hydratedRef,
    jaGravouRef,
    nadaPorGravar,
    porGravarRef,
    setGravadoEm,
    setPorGravar,
    soNesteComputador,
    warnedOverwriteRef,
  } = rascunho;
  const { doc, docAssenteRef, historicoRef, setPodeDesfazer } = documento;
  const { DRAFT_KEY, SIDE_KEY } = chavesDoRascunho;
  const { assetCores, assetMedias, assetOriginais, assetUrls, themeOrigins } = fotos;
  const { refEdited } = referencia;
  const { bilingue, idiomaDoPdf } = traducoes;
  const { enviarParaServidor } = servidor;
  const { toast } = avisos;
  const { setSobreposto } = rascunhoSobreposto;
  const { quote } = pedido;

  useEffect(() => {
    if (!hydratedRef.current) return;
    const save = () => {
      // Uma fotografia para o Cmd+Z, tirada quando ela pára de escrever. Se
      // fosse a cada tecla, desfazer andava letra a letra e não servia para
      // nada; se fosse só nas remoções, não desfazia um texto trocado.
      const ultimo = historicoRef.current[historicoRef.current.length - 1];
      if (!ultimo || JSON.stringify(ultimo) !== JSON.stringify(doc)) {
        historicoRef.current = [...historicoRef.current, doc].slice(-MAX_HISTORICO);
      }
      docAssenteRef.current = doc;
      // Dois, e não um: o último do histórico é o documento ACTUAL, portanto
      // com uma só fotografia não há nada anterior para onde voltar.
      setPodeDesfazer(historicoRef.current.length >= 2);

      // NADA DE MARCADORES PROVISÓRIOS NO RASCUNHO GRAVADO.
      //
      // Um `pending:<uuid>` é uma promessa viva na memória desta aba: a cópia
      // que lhe vai dar morada corre aqui, e mais ninguém a conhece. Gravado,
      // sobreviveria ao recarregar da página como um caminho que nunca vai
      // existir — uma foto fantasma no mood board, e um buraco silencioso no
      // PDF que ninguém volta a saber explicar. Sai do documento e sai também
      // dos mapas de apoio, que são gravados ao lado dele.
      const gravavel = stripPendingImages(doc);
      const semProvisorios = <T>(mapa: Record<string, T>): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(mapa)) if (!isPendingImage(k)) out[k] = v;
        return out;
      };
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RASCUNHO FICA NESTE COMPUTADOR — E ISSO É O QUE SE QUER
       * ══════════════════════════════════════════════════════════════════════
       *
       * O CodeQL assinala estas linhas com «Clear text storage of sensitive
       * information», severidade alta. O que ele vê é verdade: o documento tem
       * o nome do casal e a morada do espaço, e é gravado em claro no
       * `localStorage` desta máquina.
       *
       * É o comportamento pretendido, e a alternativa é pior. Uma proposta
       * demora horas a montar; a rede de casa dela cai; o portátil vai para a
       * quinta no dia da montagem. Sem esta cópia, uma gravação falhada ao
       * servidor é trabalho perdido — e foi exactamente isso que aconteceu
       * antes de isto existir. Cifrar não resolveria nada: a chave teria de
       * viver ao lado, no mesmo browser.
       *
       * O que NÃO está aqui, e é o que importa: não há segredos nenhuns. Nem
       * palavra-passe, nem sessão, nem chaves de armazenamento. Os marcadores
       * provisórios são filtrados acima (`semProvisorios`), e os preços de
       * custo, que são o único número verdadeiramente interno, nunca saem para
       * o cliente por outro caminho — ver `proposal-doc-pdf`.
       *
       * Quem tem acesso a este `localStorage` já tem acesso à sessão aberta do
       * back office no mesmo browser, e daí a tudo.
       */
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(gravavel));
        localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
        localStorage.setItem(
          SIDE_KEY,
          JSON.stringify({
            urls: semProvisorios(assetUrls),
            // O plano B viaja com o rascunho. Sem isto, reabrir num sítio sem
            // rede (ou antes de a hidratação responder) deixava as células sem
            // para onde cair — que é exactamente quando mais falta faz.
            originais: semProvisorios(assetOriginais),
            // E o degrau do meio, para uma reabertura sem rede não ter de cair
            // de 20 KB direita a 1099 — que é precisamente quando não há linha
            // para os pagar.
            medias: semProvisorios(assetMedias),
            // As cores viajam com o rascunho pela mesma razão que o plano B:
            // reabrir sem rede (ou antes de a hidratação responder) deixava o
            // aviso de paleta mudo justamente quando ele ainda faz falta.
            cores: semProvisorios(assetCores),
            themeOrigins: semProvisorios(themeOrigins),
            refEdited,
            // O interruptor das caixas inglesas. É CONVENIÊNCIA e não
            // correcção: se este `meta` se perder, o interruptor abre ligado na
            // mesma quando o documento tem traduções lá dentro. Nenhum trabalho
            // dela depende de isto sobreviver.
            bilingue,
            // A língua escolhida. Ao lado do rascunho e não dentro dele: não é
            // conteúdo da proposta — o mesmo documento sai nas duas línguas —,
            // é a escolha que ela fez para ESTE envio. E é a única das três
            // linhas daqui que, perdida, muda o que o cliente recebe.
            idioma: idiomaDoPdf,
          }),
        );
        setGravadoEm(new Date());
        // A partir daqui há rascunho gravado, e voltar ao estado de abertura
        // deixa de ser «nada por gravar» — ver o bloco da abertura.
        jaGravouRef.current = true;
        porGravarRef.current = false;
        setPorGravar(false);
      } catch {
        /* quota / unavailable — non-fatal */
      }
      // E no servidor, que é o que sobrevive à mudança de dispositivo. Falhar
      // aqui não interrompe o trabalho: a cópia local continua a valer e a
      // gravação seguinte tenta de novo. O que NÃO pode acontecer é falhar sem
      // se ver — era isso que fazia o indicador dizer «guardado» a uma proposta
      // que só existia neste portátil.
      return (async () => {
        const r = await enviarParaServidor(gravavel);
        if (r.estado === "so-local") return r;
        // Alguém gravou entre a nossa leitura e esta escrita. A nossa versão
        // fica (a última vence), mas dizê-lo é o mínimo — desaparecer com o
        // trabalho de outra pessoa em silêncio, não.
        // Juntou-se sem pisar ninguém: dizê-lo uma vez, para ela saber porque
        // é que apareceu no ecrã texto que não escreveu.
        if (r.juntou && !r.overwrote && !avisouJuncaoRef.current) {
          avisouJuncaoRef.current = true;
          const quem = r.previousBy ? `por ${r.previousBy}` : "noutro sítio";
          toast(
            `Este rascunho estava a ser alterado ${quem}. Juntei as duas versões: o que mudaste ficou teu, e o que mudaram lá já está no ecrã.`,
            "info",
          );
        }
        if (r.overwrote && !warnedOverwriteRef.current) {
          warnedOverwriteRef.current = true;
          /**
           * ── A FRASE MUDOU, E A MUDANÇA É O PONTO ─────────────────────────
           *
           * Dizia «Ficou a tua versão.» e acabava ali. É verdade, e mesmo
           * assim era a pior coisa a dizer: quem lê aquilo conclui que o
           * trabalho da outra pessoa acabou. Não acabou — o servidor guarda-o
           * sempre —, mas ninguém tinha como saber, e sobretudo ninguém tinha
           * como lá chegar.
           *
           * Quando há gaveta (`r.resgate`), a frase deixa de fechar a porta e
           * manda-a olhar para a barra, que é onde a decisão vive. Quando não
           * há — o servidor não conseguiu guardar a cópia, e regista-o —, a
           * frase antiga é a honesta e fica.
           */
          const quem = r.previousBy ? `por ${r.previousBy}` : "noutro sítio";
          toast(
            r.resgate
              ? `Este rascunho tinha sido alterado ${quem}. Ficou a tua versão, e a outra está guardada — vê em cima.`
              : `Este rascunho tinha sido alterado ${quem}. Ficou a tua versão.`,
            "info",
          );
        }
        // A barra, ao contrário do aviso, actualiza-se a cada sobreposição: a
        // gaveta tem UMA ranhura e guarda sempre a última, portanto apontar
        // para uma anterior seria apontar para o sítio errado.
        if (r.overwrote && r.resgate) {
          setSobreposto({ chave: r.resgate, quem: r.previousBy, quando: r.resgateEm });
        }
        return r;
      })();
    };
    flushDraftRef.current = save;
    // A abertura não se grava. O `flushDraft` fica montado à mesma — o
    // Ctrl/Cmd+Enter dos Serviços tem de continuar a poder gravar à ordem —,
    // mas o relógio dos 800 ms não arranca por causa de um documento que
    // ninguém escreveu. Ver o bloco «A ABERTURA TAMBÉM NÃO É TRABALHO POR
    // GRAVAR».
    if (nadaPorGravar()) return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [
    doc,
    assetUrls,
    assetOriginais,
    assetMedias,
    assetCores,
    themeOrigins,
    refEdited,
    // O mesmo para o interruptor: sem ele aqui, ligá-lo e fechar o separador
    // devolvia o ecrã de uma língua só na abertura seguinte.
    bilingue,
    // E o mesmo para a língua: sem ela aqui, escolher «Inglês» não voltava a
    // agendar a gravação, e o `meta` guardado continuava a dizer «pt».
    idiomaDoPdf,
    DRAFT_KEY,
    SIDE_KEY,
    quote.id,
    toast,
    enviarParaServidor,
    nadaPorGravar,
    hydratedRef,
    flushDraftRef,
    historicoRef,
    docAssenteRef,
    setPodeDesfazer,
    setGravadoEm,
    jaGravouRef,
    porGravarRef,
    setPorGravar,
    avisouJuncaoRef,
    warnedOverwriteRef,
    setSobreposto,
  ]);

  /**
   * ── AO DESMONTAR, GRAVA-SE O QUE FALTAVA ──────────────────────────────
   *
   * A gravação acima é um `setTimeout` a 800 ms, e a sua limpeza corre em
   * QUALQUER desmontagem. A única protecção era um `beforeunload`, que apanha
   * fechar o separador — e mais nada.
   *
   * Só que o estúdio é desmontado por gestos normais, e frequentes: «Trocar de
   * cliente» (o `key` em `FazerProposta`), o link «Rápida» do `AdminClient`, e
   * mudar de separador de detalhe. O percurso: ela escreve a última linha de
   * um grupo e clica em «Trocar de cliente» dentro de 800 ms. A gravação era
   * cancelada, o indicador continuava a dizer «Guardado às 14:32» — a hora da
   * gravação ANTERIOR — e ao voltar faltava a linha. Um indicador que diz que
   * gravou aquilo que não gravou é pior do que não haver indicador nenhum.
   *
   * Corre DEPOIS da limpeza de cima (as limpezas seguem a ordem de declaração
   * dos efeitos), portanto o `setTimeout` já foi cancelado e não há gravação a
   * dobrar. E só grava quando há mesmo trabalho por gravar: sem o `ref`, cada
   * troca de separador pagava um PUT para reescrever o que já lá estava.
   *
   * O `flushDraft.current` é reatribuído a cada alteração do documento, por
   * isso o que aqui corre é a gravação da ÚLTIMA versão, não a da montagem.
   */
  useEffect(() => {
    return () => {
      if (porGravarRef.current) void flushDraftRef.current();
    };
  }, [flushDraftRef, porGravarRef]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * «GUARDAR AGORA» — O BOTÃO, O ⌘S E O CTRL/CMD+ENTER DOS SERVIÇOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero que haja um botão para guardar onde se ficou». O
   * estúdio grava sozinho ao fim de 800 ms — e isso é invisível. Um botão
   * continua a valer com o automático a funcionar: é o gesto de quem se vai
   * levantar da secretária e quer ter a CERTEZA antes de fechar o portátil.
   *
   * E é justamente por ser esse o gesto que este é o sítio da página onde uma
   * mentira custa mais caro. Três respostas, e nenhuma delas inventada:
   *
   *  · GUARDOU — di-lo depois de o SERVIDOR o ter confirmado, nunca no instante
   *    do clique. Dizia «Rascunho guardado» sem esperar por resposta nenhuma:
   *    era o mesmo erro do indicador, à escala de uma mensagem.
   *
   *  · NÃO CHEGOU AO SERVIDOR — di-lo com as palavras do indicador («guardado
   *    só neste computador»), porque ela não pode ter de aprender duas
   *    linguagens no mesmo back office. Cala-se apenas quando o aviso grande
   *    de `registarSoLocal` está a aparecer NESTE momento — esse diz tudo isto
   *    e mais o que fazer a seguir, e duas mensagens ao mesmo tempo seriam
   *    ruído. Mas o aviso grande só aparece UMA vez por avaria; à segunda vez
   *    que ela carregue no botão é esta mensagem que fala, senão um botão
   *    calado passaria por um botão que guardou.
   *
   *  · NÃO HAVIA NADA POR GRAVAR — di-lo. A alternativa era responder
   *    «guardado» a um gesto que não guardou coisa nenhuma, e ensinar que a
   *    palavra «guardado» aparece sempre, carregue-se quando se carregar.
   *
   * O `soNesteComputador` entra na conta do «nada por gravar» de propósito: com
   * o servidor a recusar, a cópia local está feita (portanto `porGravarRef` é
   * falso) e o trabalho continua a não existir em mais lado nenhum. É o caso em
   * que mais falta faz voltar a tentar — e entre gravar a mais e gravar a
   * menos, grava-se a mais.
   */
  const [aGuardarAgora, setAGuardarAgora] = useState(false);
  const guardarAgora = useCallback(() => {
    void (async () => {
      // `aGravarNoServidor` entra na conta com a mesma lógica: a cópia local é
      // síncrona e apaga o «por gravar» ANTES de o servidor responder. Nessa
      // janela, dizer «já está guardado no servidor» era dizer uma coisa que
      // ainda ninguém sabe — grava-se outra vez e responde-se pelo que voltar.
      if (!porGravarRef.current && !soNesteComputador && aGravarNoServidor === 0) {
        toast("Não havia nada por gravar — o rascunho já está guardado no servidor.", "info");
        return;
      }
      // Lido ANTES da gravação: é o que distingue «o aviso grande vai falar» de
      // «o aviso grande já falou e agora é comigo».
      const avisoGrandeVaiFalar = avisoDoSoLocalPorDar();
      setAGuardarAgora(true);
      try {
        const r = await flushDraftRef.current();
        if (r.estado === "guardado") {
          toast("Rascunho guardado no servidor.", "success");
        } else if (!avisoGrandeVaiFalar) {
          toast("Guardado só neste computador — não chegou ao servidor.", "error");
        }
      } finally {
        setAGuardarAgora(false);
      }
    })();
  }, [
    toast,
    soNesteComputador,
    aGravarNoServidor,
    avisoDoSoLocalPorDar,
    porGravarRef,
    flushDraftRef,
  ]);

  return { guardar: { aGuardarAgora, guardarAgora } };
}
