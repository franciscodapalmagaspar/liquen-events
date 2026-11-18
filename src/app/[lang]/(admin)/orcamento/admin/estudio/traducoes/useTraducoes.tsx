"use client";
import { useMemo, useState } from "react";
import { useToast } from "../../Toast";
import {
  IDIOMA_POR_OMISSAO,
  ehIdiomaDaProposta,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { type CampoDeTexto } from "@/lib/proposal-ortografia";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import CaixaInglesa from "../../CaixaInglesa";
import {
  aplicarTraducao,
  motorPelaRota,
  traduzirParaIngles,
  type EstadoDaTraducao,
} from "@/lib/proposal-traducao";
import {
  docTemIngles,
  confirmarTraducao,
  escreverEn,
  estadoDoIngles,
  lerEn,
  porTraduzirPorSeccao,
} from "@/lib/proposal-doc-bilingue";
import { initialDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";

export interface EntradaTraducoes {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  quote: Quote;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useTraducoes({ documento, quote, toast }: EntradaTraducoes) {
  const { doc, docRef, setDoc } = documento;
  /**
   * ── A LÍNGUA ESCOLHE-SE AO GERAR ──────────────────────────────────────────
   *
   * Não entra no `doc` e não é gravada no rascunho, de propósito: o documento
   * guardado é UM só, em português, e a língua é uma decisão que se toma sobre
   * ESTE clique — como escolher a impressora. Guardá-la era passar a ter uma
   * proposta com uma língua colada, que ninguém voltaria a rever.
   */
  // Parte da língua em que o casal FEZ o pedido (auditoria 13/11, estúdio n.º 9):
  // noutro aparelho, sem o rascunho local, partia sempre do português — e uma
  // proposta para um casal que pediu em inglês seguia em português.
  const [idiomaDoPdf, setIdiomaDoPdf] = useState<IdiomaDaProposta>(() =>
    ehIdiomaDaProposta(quote.locale) ? quote.locale : IDIOMA_POR_OMISSAO,
  );
  /**
   * ── A PROPOSTA É BILINGUE: CADA CAMPO DE PROSA COM DUAS CAIXAS ────────────
   *
   * Estado do ECRÃ, não do documento — como as dobras dos mood boards, o
   * `refEdited` e os mapas de URLs, e pela mesma razão: não diz nada sobre a
   * proposta. Posto no `doc`, ia para a coluna `proposals.doc`, para a cópia de
   * segurança, para a cópia entre pedidos e para a comparação de versões.
   *
   * Desligado por omissão, e desligado o ecrã é o de hoje ao pixel: o
   * `ServicesEditor` é o ecrã mais escrito da casa, e dobrar-lhe a altura para
   * toda a gente — incluindo as propostas que nunca vão a inglês — era pagar
   * todos os dias por um caso ocasional.
   *
   * ── E ABRE LIGADO QUANDO O DOCUMENTO JÁ TRAZ INGLÊS ──────────────────────
   * O `meta` fica neste computador. Abrir a proposta noutro portátil,
   * restaurá-la do servidor ou copiá-la de outra deixa-o para trás — e sem essa
   * regra os textos ingleses existiam no documento e o ecrã não os mostrava:
   * invisíveis e editáveis por acidente, que é a pior combinação. A regra
   * aplica-se no restauro (ver o efeito «CORRE UMA VEZ SÓ») e aqui, para a
   * proposta que já abre com inglês vindo do pedido.
   */
  const [bilingue, setBilingue] = useState(() => docTemIngles(initialDoc(quote)));
  /** A tradução automática está a correr. Trava o botão para não haver duas a
   *  escrever no mesmo documento — a segunda escreveria por cima da primeira. */
  const [aTraduzir, setATraduzir] = useState(false);
  /**
   * O servidor tem serviço de tradução configurado?
   *
   * Pergunta-se, não se adivinha: a chave vive do lado do servidor e o estúdio
   * corre no navegador, onde ela nunca pode chegar. Começa em `"desligada"` — o
   * lado seguro: um botão desligado que diz porquê é melhor do que um botão que
   * promete uma tradução que não vai acontecer.
   *
   * ── E SÃO TRÊS ESTADOS E NÃO DOIS, PORQUE A FRASE MUDA ────────────────────
   *
   * `"indisponivel"` — a pergunta não chegou a ter resposta — desliga o botão
   * exactamente como `"desligada"`, e isso está certo. O que não pode ser igual
   * é o que se lê por baixo: «ainda não está ligada neste servidor» é uma
   * afirmação sobre a CONFIGURAÇÃO, e dita sobre uma sessão caducada manda-a
   * procurar uma chave em falta em vez de recarregar a página.
   */
  const [traducao, setTraducao] = useState<EstadoDaTraducao>("desligada");
  const traducaoLigada = traducao === "ligada";

  /**
   * ── IR AO CAMPO ONDE A PALAVRA ESTÁ ─────────────────────────────────────
   *
   * Do aviso de ortografia (que vive no passo do envio) até ao controlo (que
   * vive no do conteúdo, e pode estar dentro de um mood board fechado).
   *
   * Três coisas antes do salto, e só a última é o salto: voltar ao conteúdo,
   * abrir a dobra do board se for um campo de board — saltar para dentro de uma
   * dobra fechada deixava-a a olhar para um cartão que «não abriu» —, e só
   * então marcar o alvo, para o efeito o encontrar depois de desenhado.
   */
  /**
   * A caixa inglesa de um campo — ou nada, com o interruptor desligado.
   *
   * Um só sítio a desenhá-las: são catorze famílias de campo espalhadas por
   * duas secções e dois ficheiros, e catorze cópias desta caixa eram catorze
   * sítios onde o `data-campo`, o `aria-label` ou a marca de «por traduzir`
   * podiam divergir. Ver `CaixaInglesa.tsx`.
   */
  function caixaDeIngles(
    campo: CampoDeTexto,
    rotulo: string,
    opts: {
      className?: string;
      as?: "input" | "textarea";
      rows?: number;
      /** A caixa cresce com o texto, a partir de uma linha — ver `CaixaInglesa`. */
      cresce?: boolean;
      readOnly?: boolean;
      placeholder?: string;
      /**
       * Este par NÃO fica lado a lado.
       *
       * A marca é ao contrário — todas ficam, e diz-se quais não — porque o
       * desenho normal passa a ser o par numa linha só, e uma excepção que se
       * esquece de se declarar é uma caixa empilhada no meio de doze ao lado,
       * que se vê. Uma que se esquecesse ao contrário era uma caixa ao lado de
       * uma coisa que não é o seu par, que também se vê.
       */
      empilhada?: boolean;
    } = {},
  ) {
    if (!bilingue) return null;
    const en = lerEn(doc as ProposalDoc, campo) ?? "";
    /**
     * Vazia, para trás, ou em dia — e as três leem-se diferentes.
     *
     * Era `pt !== "" && en === ""`, que só sabia responder «vazia». Um inglês
     * escrito contra um português que entretanto mudou passava por bom, e é
     * esse o defeito que ela apanhou: «Reunião Inicial» com «Ceremony Decor».
     */
    const estado = estadoDoIngles(doc as ProposalDoc, campo);
    // `empilhada` é desta função e não da caixa: separa-se antes de passar o
    // resto, para não escorregar para o DOM como um atributo inventado.
    const { empilhada, ...daCaixa } = opts;
    return (
      <CaixaInglesa
        campo={campo}
        rotulo={rotulo}
        valor={en}
        onChange={(texto) => setDoc((d) => escreverEn(d, campo, texto))}
        porTraduzir={estado === "por-traduzir"}
        desactualizada={estado === "desactualizado"}
        aoConfirmar={() => setDoc((d) => confirmarTraducao(d, campo))}
        aoLado={!empilhada}
        {...daCaixa}
      />
    );
  }

  /**
   * Manda traduzir tudo o que ainda não tem versão inglesa.
   *
   * O documento só muda se a resposta vier ALINHADA — a trava vive na fronteira
   * (`traduzirParaIngles`), e a razão está lá escrita: uma resposta a que
   * faltem textos punha a tradução de um campo noutro campo, em silêncio.
   * Falhando, o que se vê é uma frase a dizê-lo e o documento como estava.
   *
   * ── E O QUE ELA FIZER ENQUANTO A TRADUÇÃO VEM A CAMINHO ──────────────────
   *
   * Fica. O relato que trouxe isto, à letra: «quando alterou para inglês, deu,
   * mas já estava a alterar fotos». A tradução DEU — e as fotos que ela mexeu
   * nos segundos da ida à rede desapareceram, porque o que voltava era o
   * documento de há dez segundos, posto de volta inteiro. A gravação automática
   * gravava a versão amputada logo a seguir, no `localStorage` e no servidor:
   * trabalho perdido nos dois sítios, sem uma palavra.
   *
   * Por isso o que se aplica NÃO é o documento traduzido: são as traduções, uma
   * a uma, escritas no documento como ele estiver neste instante — e só nos
   * campos cujo português ainda é o que foi mandado traduzir (ver
   * `aplicarTraducao`). É a mesma disciplina da cópia de fotos de um modelo
   * parcial, aqui ao lado.
   */
  async function traduzirTudo() {
    if (!traducaoLigada || aTraduzir) return;
    setATraduzir(true);
    try {
      const r = await traduzirParaIngles(doc as ProposalDoc, motorPelaRota());
      if (r.porqueFalhou) {
        toast(`Não deu para traduzir: ${r.porqueFalhou}. O documento ficou como estava.`, "error");
        return;
      }
      // «Não havia nada por traduzir» só é verdade quando não se pediu nada ao
      // serviço. Pedir e não receber é outra coisa — e dizer-lhe que não havia
      // nada a fazer sobre uma proposta que ficou inteira em português é a
      // mentira mais cara que este botão pode contar.
      if (r.escritos === 0 && r.naoVieram === 0) {
        toast("Não havia nada por traduzir.", "info");
        return;
      }
      // O documento de AGORA, e não o que foi mandado traduzir. A contagem sai
      // daqui; a escrita passa pela forma funcional, que é a que o React
      // garante actualizada mesmo que este `ref` esteja um instante atrás.
      const antes = docRef.current;
      const aplicado = aplicarTraducao(antes, r.escritas);
      setDoc((d) => (d === antes ? aplicado.doc : aplicarTraducao(d, r.escritas).doc));
      if (aplicado.escritos > 0) {
        toast(
          aplicado.escritos === 1
            ? "1 campo traduzido. Vale a pena passar os olhos."
            : `${aplicado.escritos} campos traduzidos. Vale a pena passar os olhos.`,
          "success",
        );
      }
      /**
       * ── O QUE FOI PEDIDO AO SERVIÇO E NÃO VOLTOU ─────────────────────────
       *
       * O motor manda os textos em lotes de 50 e um lote que falhe volta VAZIO
       * nas suas posições, de propósito: os que já vieram não se deitam fora
       * nem se pagam duas vezes. Só atira quando NENHUM lote passa.
       *
       * Sem esta frase, uma proposta grande com um 429 (ou uma quota que acaba
       * no segundo lote) mostrava «50 campos traduzidos», a verde, e deixava 70
       * em português sem uma palavra. Do lado dela isso é «não está a dar» —
       * dá numa proposta pequena e não dá numa grande, e o número que aparece
       * está certo.
       *
       * Diz-se também que vale a pena insistir, porque vale: o que já veio está
       * escrito, e a carregada seguinte só manda o que falta.
       */
      if (r.naoVieram > 0) {
        toast(
          r.naoVieram === 1
            ? "1 campo não voltou do serviço de tradução e ficou em português. Carrega outra vez — o que já veio fica como está."
            : `${r.naoVieram} campos não voltaram do serviço de tradução e ficaram em português. Carrega outra vez — o que já veio fica como está.`,
          "error",
        );
      }
      // Os campos que mudaram debaixo da tradução ficam por traduzir, e é isso
      // que eles são. Dizê-lo aqui evita a única leitura errada possível — «eu
      // traduzi isto» sobre um campo que ficou em português.
      if (aplicado.ignorados.length > 0) {
        toast(
          aplicado.ignorados.length === 1
            ? "1 campo mudou enquanto a tradução vinha e ficou por traduzir."
            : `${aplicado.ignorados.length} campos mudaram enquanto a tradução vinha e ficaram por traduzir.`,
          "info",
        );
      }
    } finally {
      setATraduzir(false);
    }
  }

  const traducoesPorSeccao = useMemo(
    () => (idiomaDoPdf === "en" ? porTraduzirPorSeccao(doc as ProposalDoc) : undefined),
    [idiomaDoPdf, doc],
  );

  return {
    aTraduzir,
    bilingue,
    caixaDeIngles,
    idiomaDoPdf,
    setBilingue,
    setIdiomaDoPdf,
    setTraducao,
    traducao,
    traducaoLigada,
    traducoesPorSeccao,
    traduzirTudo,
  };
}
