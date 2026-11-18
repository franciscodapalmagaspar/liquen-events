"use client";

import { useEffect, useRef } from "react";
import { haAssinaturaMorta, semAssinaturasJaMortas } from "../../assinatura";
import { estadoDaTraducao } from "@/lib/proposal-traducao";
import { lerPartilhado } from "@/lib/leitura-partilhada";
import { buildRef } from "@/lib/orcamento/estudio/documento-inicial";
import type { useNucleoDoEstudio } from "./useNucleoDoEstudio";

export function useEcraEmDia({
  documento,
  fotos,
  hidratar,
  rascunho,
  referencia,
  traducoes,
}: Pick<
  ReturnType<typeof useNucleoDoEstudio>,
  "documento" | "fotos" | "hidratar" | "rascunho" | "referencia" | "traducoes"
>) {
  const { hidratarAssets } = hidratar;
  const {
    assetMedias,
    assetOriginais,
    assetUrls,
    setAssetMedias,
    setAssetOriginais,
    setAssetUrls,
    themeOrigins,
  } = fotos;
  const { bilingue, setTraducao } = traducoes;
  const { refEdited } = referencia;
  const { doc, docAssenteRef, historicoRef, setDoc, setPodeDesfazer } = documento;
  const {
    aAbrirRef,
    hydratedRef,
    marcaDaAberturaRef,
    marcaDoTrabalho,
    montagemRef,
    nadaPorGravar,
    porGravarRef,
    setPorGravar,
  } = rascunho;

  useEffect(() => {
    let alive = true;
    void hidratarAssets(() => alive, { daAbertura: true });
    return () => {
      alive = false;
    };
  }, [hidratarAssets]);

  /**
   * ── O ESTÚDIO ABERTO DE UM DIA PARA O OUTRO (14/11) ────────────────────
   * A hidratação corria UMA vez, à entrada. Com o separador aberto mais de
   * seis horas, as assinaturas da Biblioteca morriam com o ecrã à frente dela,
   * e cada célula nova (um passo aberto, uma pré-visualização) pedia ao
   * Storage um URL que ele recusa com 400.
   *
   * Ao voltar ao separador pergunta-se aos URLs que estão no ecrã se algum já
   * morreu; só então se pede a lista outra vez, e o `urlAindaBom` troca os
   * mortos e deixa os bons (a cache do browser continua a valer). Custo: zero
   * pedidos enquanto tudo serve; uma leitura do `/assets` por regresso depois
   * de expirar. Nenhum relógio a bater.
   */
  const urlsNoEcra = useRef<Record<string, string>[]>([]);
  useEffect(() => {
    urlsNoEcra.current = [assetUrls, assetOriginais, assetMedias];
  }, [assetUrls, assetOriginais, assetMedias]);
  useEffect(() => {
    // O `focus` e o `visibilitychange` chegam os dois no mesmo regresso: uma
    // leitura só, não duas.
    let aCaminho = false;
    const aoVoltar = () => {
      if (aCaminho || document.visibilityState !== "visible") return;
      if (!haAssinaturaMorta(urlsNoEcra.current)) return;
      aCaminho = true;
      void hidratarAssets()
        .then((fim) => {
          // Só depois de a lista ter VINDO. Uma lista que falhou (sessão
          // caducada, Storage em baixo, sem rede) não diz nada sobre as fotos:
          // fica tudo como estava, e o próximo regresso volta a tentar.
          if (fim !== "pronto") return;
          // O que a lista não trouxe de volta (uma foto que só está no
          // rascunho deste computador) continuava morto — e cada regresso
          // pedia a lista outra vez. Sai só o que JÁ morreu: um URL dentro da
          // margem de cinco minutos ainda desenha a fotografia.
          setAssetUrls((m) => semAssinaturasJaMortas(m));
          setAssetOriginais((m) => semAssinaturasJaMortas(m));
          setAssetMedias((m) => semAssinaturasJaMortas(m));
        })
        .finally(() => {
          aCaminho = false;
        });
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [hidratarAssets, setAssetMedias, setAssetOriginais, setAssetUrls]);

  /**
   * ── HÁ SERVIÇO DE TRADUÇÃO NESTE SERVIDOR? ────────────────────────────────
   *
   * Uma pergunta, uma vez, ao abrir. A chave vive do lado do servidor — nunca
   * pode chegar ao navegador —, portanto o estúdio não tem como saber sozinho.
   *
   * Falhando (sem rede, sessão caducada), o botão fica desligado — o lado
   * seguro, e é o que já fazia. O que MUDOU é que a falha se distingue de um
   * «não»: `"indisponivel"` e não `"desligada"`, para a frase por baixo do
   * botão não culpar a configuração de um problema que não é dela. Nada aqui lê
   * o `localStorage`, e por isso não pisa o efeito de restauro (ver o bloco
   * «CORRE UMA VEZ SÓ»).
   */
  useEffect(() => {
    let vivo = true;
    // Pela leitura partilhada: o `StrictMode` (e um segundo estúdio) pedia-a duas vezes.
    void estadoDaTraducao((url, init) => lerPartilhado(String(url), init)).then((estado) => {
      if (vivo) setTraducao(estado);
    });
    return () => {
      vivo = false;
    };
  }, [setTraducao]);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited, setDoc]);
  /**
   * E a abertura acaba no PRIMEIRO GESTO DELA — não num relógio.
   *
   * É o único sinal honesto: um relógio ou uma contagem de passagens fazia a
   * fronteira depender da velocidade da rede desta manhã, e a partir daí
   * haveria manhãs em que a primeira letra escrita não contava como trabalho.
   * Daqui para a frente, tudo o que mexer no documento é dela até prova em
   * contrário.
   */
  useEffect(() => {
    const fechar = () => {
      aAbrirRef.current = false;
    };
    // `input` e `change` estão aqui por uma razão que não é teórica: nem toda a
    // escrita passa por uma tecla. O preenchimento automático do browser, um
    // gestor de palavras-passe, a ditadura de voz e os passeios automáticos
    // escrevem o valor e disparam só `input` — sem `keydown`. Sem estes dois,
    // esse texto ficava do lado da «abertura» e não era gravado.
    const gestos = ["pointerdown", "keydown", "input", "change", "drop", "paste"] as const;
    for (const g of gestos) window.addEventListener(g, fechar, true);
    return () => {
      for (const g of gestos) window.removeEventListener(g, fechar, true);
    };
  }, [aAbrirRef]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (montagemRef.current) {
      montagemRef.current = false;
      return;
    }
    if (aAbrirRef.current) {
      // Enquanto durar a abertura, o que está no ecrã É a abertura. Não se
      // fixa na primeira passagem porque a abertura não é uma: o restauro (ou
      // a semeadura) é a primeira, e atrás dela vêm as derivadas — os
      // identificadores estáveis dos grupos e das linhas, o merge do rascunho
      // do servidor, as fotos que a hidratação vai buscar. Nenhuma delas é
      // trabalho dela, e fixar a marca antes de todas fazia o alarme acender
      // por causa de um `id` que o próprio estúdio acabou de escrever.
      marcaDaAberturaRef.current = marcaDoTrabalho();
      docAssenteRef.current = doc;
      return;
    }
    if (nadaPorGravar()) return;
    /**
     * ── JÁ ESTÁ MARCADO: NÃO VOLTAR A MANDAR ─────────────────────────────
     *
     * Sem isto, este efeito chamava `setPorGravar(true)` a CADA passagem
     * enquanto houvesse trabalho por gravar. O valor é sempre o mesmo, e por
     * isso parece inofensivo — só que a lista de dependências aqui em baixo
     * tem objectos que nascem outra vez a cada desenho (`doc`, `assetUrls`,
     * `themeOrigins`). Efeito que corre em todos os desenhos + `setState` sem
     * guarda = desenho → efeito → `setState` → desenho, e o React corta ao fim
     * de algumas dezenas com «Maximum update depth exceeded».
     *
     * Apanhado no CI, no passeio de esforço do editor (50 linhas escritas
     * seguidas), e antes disso na Biblioteca de Temas: dois erros de runtime
     * por corrida, INTERMITENTES — passavam à repetição. Um erro que passa à
     * repetição é o pior tipo: existe, faz o ecrã cair no aviso global, e
     * ninguém o vai investigar porque «às vezes passa».
     *
     * `porGravarRef` é um espelho fiel do estado — sobem juntos aqui e descem
     * juntos ao gravar — portanto perguntar-lhe é perguntar ao estado sem o
     * pôr nas dependências.
     */
    if (porGravarRef.current) return;
    porGravarRef.current = true;
    setPorGravar(true);
    // A primeira mudança desde o documento assente (a abertura, ou a última
    // gravação): ele entra no histórico, para a PRIMEIRA mudança também se
    // poder desfazer — e logo, sem esperar pela fotografia dos 800 ms.
    if (historicoRef.current.length === 0 && docAssenteRef.current) {
      historicoRef.current = [docAssenteRef.current];
    }
    if (historicoRef.current.length > 0) setPodeDesfazer(true);
    // A mensagem do envio conta como trabalho por gravar: sem ela nesta lista, o
    // indicador dizia «guardado às 14:32» com o texto dela ainda por escrever no
    // rascunho — e é essa frase que faz uma pessoa fechar o portátil descansada.
    // `marcaDoTrabalho` na lista não muda nada: o `nadaPorGravar` já depende
    // dela, e o efeito já corria quando ela mudava. Fica escrita para a regra
    // das dependências não ter de ser lida duas vezes.
  }, [
    doc,
    assetUrls,
    themeOrigins,
    refEdited,
    bilingue,
    nadaPorGravar,
    marcaDoTrabalho,
    hydratedRef,
    montagemRef,
    aAbrirRef,
    porGravarRef,
    setPorGravar,
    historicoRef,
    docAssenteRef,
    setPodeDesfazer,
    marcaDaAberturaRef,
  ]);
}
