"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import { relatarFalhaDeImagem } from "../../relatar-falha";
import type { PropriedadesDaCelula } from "./propriedades-da-celula";
import { useRecusaDaPolitica } from "./recusa-da-politica";
import { useSrcSemPiscar } from "./useSrcSemPiscar";
import { useVezNaFila } from "./useVezNaFila";

type Entrada = Pick<
  PropriedadesDaCelula,
  "url" | "planoB" | "pendente" | "onde" | "refDoc" | "estadoDosUrls" | "aoMorrer" | "onMedida"
>;

/**
 * O que a célula de uma fotografia SABE: que morada pedir (a cascata e a vez
 * na fila), se a foto desistiu e porquê, se já está pintada, e a medida que
 * diz ao estúdio. O desenho fica no `Thumb`; isto é só o estado e as regras.
 */
export function useCelulaDaFoto({
  url,
  planoB,
  pendente = false,
  onde = "estúdio",
  refDoc,
  estadoDosUrls = "pronto",
  aoMorrer,
  onMedida,
}: Entrada) {
  /**
   * Não foi a fotografia: foi este sítio que a recusou. Ver a escuta acima.
   *
   * Perguntado com `planoB ?? url` e ANTES da cascata, de propósito: a resposta
   * é por ORIGEM, e as duas moradas desta foto têm a mesma — portanto sabe-se
   * já, sem esperar pelo `ultimoAlvo`, e a cascata pode receber a resposta em
   * vez de gastar uma volta a descobrir o que já se sabia.
   */
  /**
   * O último degrau da cascata — o ficheiro grande. É por ele que se pergunta a
   * recusa da política (todas as moradas desta foto têm a mesma origem) e é ele
   * que o «Abrir ficheiro» abre.
   */
  const original = [...(Array.isArray(planoB) ? planoB : [planoB])].reverse().find(Boolean);
  const recusadaPeloSitio = useRecusaDaPolitica(original ?? url);
  const {
    alvo,
    desistiu: failed,
    aoFalhar,
    tentarDeNovo,
    ultimoAlvo,
  } = useFotoComPlanoB(url, planoB, recusadaPeloSitio);

  /**
   * UMA FOTO A CAMINHO NÃO É UMA FOTO PARTIDA.
   *
   * Enquanto a cópia não confirma, a célula desenha a miniatura que o seletor
   * já tinha — e essa é provisória por natureza. Dizer «não foi possível
   * pré-visualizar» a meio disso é acusar de avaria o que ainda está a
   * acontecer. Espera-se pelo caminho definitivo, que traz URL novo e uma
   * oportunidade nova.
   */
  const semRemedio = failed && !pendente;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CÉLULA QUE PUXA O ORIGINAL ESPERA PELA VEZ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Pesada» é `alvo === planoB`, e é literalmente isso: o URL que esta célula
   * está prestes a pedir É o do original. Acontece nos dois casos que importam
   * — a foto não tem derivada leve nenhuma, ou a que tinha falhou e a cascata
   * caiu para o original (`useFotoComPlanoB`). É o caso caro: medido no estúdio
   * a 1,6 Mbps com 24 células, cada original pesa **1099 KB** (26,4 MB nas 24),
   * a primeira fotografia chega aos **34,0 s** e a grelha que está no ecrã só
   * fica completa aos **67,6 s** — porque as vinte e quatro repartem o mesmo
   * canal e acabam todas no fim. Com a fila: 13,3 MB e 49,4 s.
   *
   * A fila (`fila-de-imagens`) deixa passar três de cada vez, pela ordem da
   * grelha. É o mesmo desenho que a Biblioteca de Temas já usa, e é lá que está
   * medido o que ele vale: a primeira foto passou de 26 s para 1,4 s.
   *
   * ── A PRIORIDADE NÃO FURA A FILA ──────────────────────────────────────────
   * A primeira versão deixava as células da primeira dobra passar à frente sem
   * pedir vez. MEDIDO: quatro prioritárias mais três da fila são sete originais
   * em voo, e a grelha do ecrã ficou completa aos **56,5 s** contra os 49,4 s
   * do tecto de três. Com sete a repartir o canal, cada uma continua a esperar
   * pelas outras seis.
   *
   * A ordem da fila JÁ é a ordem da grelha (as células pedem vez pela ordem em
   * que montam), portanto as de cima são servidas primeiro sem precisarem de
   * excepção. O que a prioridade faz é o que deve fazer: `eager` e
   * `fetchPriority="high"`, para o navegador não as adiar nem as despriorizar.
   * É também o que a Biblioteca de Temas faz, e é lá que está medido o que
   * vale — a primeira foto passou de 26 s para 1,4 s.
   */
  /**
   * ── O QUE É «PESADA» DEPOIS DE HAVER TRÊS DEGRAUS ────────────────────────
   *
   * Era `alvo === planoB`, que com dois degraus queria dizer exactamente «é o
   * original». Com três, o plano B do meio é a derivada de 1200 px — ~200 KB,
   * dez vezes a miniatura — e essa também não pode ir vinte e quatro ao mesmo
   * tempo para o mesmo canal.
   *
   * Portanto: pesada é TUDO menos o primeiro degrau. E é também o primeiro
   * degrau quando ele É o original — uma fotografia sem miniatura nenhuma chega
   * aqui com o mesmo endereço nos dois lugares, e a cascata guarda-o uma vez
   * só; sem esta segunda metade da condição, essa célula deixava de esperar
   * pela vez e voltávamos às 24 a repartir o canal.
   */
  const pesada = alvo != null && (alvo !== url || alvo === original);
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  const { temVez, largarAVez } = useVezNaFila(pesada, alvo);
  /**
   * O URL EFECTIVO — e é aqui que a fila vale alguma coisa.
   *
   * Uma célula à espera de vez fica sem URL nenhum. Não basta não desenhar a
   * imagem: o `useSrcSemPiscar` PRÉ-CARREGA o que lhe passarem (`new Image()`),
   * e passar-lhe o alvo enquanto ela espera era começar o download que a fila
   * está ali para adiar — a fila ficava a contar vezes e o canal continuava
   * repartido pelas vinte e quatro.
   */
  const src = useSrcSemPiscar(pesada && !temVez ? undefined : alvo);

  // O registo sai UMA vez por célula que desiste, com o caminho e o código de
  // estado — que é o que nem ela nem eu tínhamos quando isto apareceu.
  useEffect(() => {
    if (semRemedio && ultimoAlvo) {
      void relatarFalhaDeImagem({ onde, ref: refDoc, url: ultimoAlvo });
      // E fica sabido AQUI dentro também: sem isto, a leitura seguinte da
      // lista devolvia URLs frescos e o mapa continuava a preferir este, que
      // acabou de dar erro. Ver `urlsMortos` no estúdio.
      //
      // MENOS quando quem recusou foi o sítio: aí o URL está impecável e
      // marcá-lo como morto fazia a hidratação seguinte deitar fora
      // assinaturas boas — trinta downloads a mais para corrigir um problema
      // que não é do endereço.
      if (!recusadaPeloSitio) {
        aoMorrer?.(ultimoAlvo);
        if (url && url !== ultimoAlvo) aoMorrer?.(url);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semRemedio]);

  /**
   * Mede e diz. Vive numa `ref` para o `ref={}` da imagem poder ser uma função
   * ESTÁVEL: uma função nova a cada desenho fazia o React desligar e voltar a
   * ligar a referência da imagem em cada tecla escrita na secção.
   *
   * Chamado nos dois momentos possíveis — quando a imagem acaba de carregar, e
   * quando o elemento aparece já completo (o navegador serviu-a da cache, que é
   * o caso normal aqui: o `useSrcSemPiscar` pré-carrega-a antes de a desenhar).
   */
  const medidaRef = useRef(onMedida);
  useEffect(() => {
    medidaRef.current = onMedida;
  }, [onMedida]);
  const medir = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w > 0 && h > 0) medidaRef.current?.(w / h);
    // E JÁ ESTÁ PINTADA. Uma imagem servida da cache pode chegar completa antes
    // de o `onLoad` ter a quem tocar — e sem isto o esqueleto por cima ficava
    // lá para sempre, sobre uma fotografia que está a ser desenhada por baixo.
    if (w > 0) setPintada(true);
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS TRÊS ESTADOS DE UMA CÉLULA SEM FOTOGRAFIA, QUE ERAM UM SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Tudo o que não fosse uma imagem pintada dava a MESMA caixa cinzenta com a
   * palavra «Imagem». As capturas dela mostram exactamente isso — e essa caixa
   * pode querer dizer três coisas com três respostas diferentes:
   *
   *   · a caminho     → esperar (medido: a primeira foto sem miniatura demorou
   *                     34,0 s em 4G, e a grelha do ecrã 67,6 s);
   *   · não veio      → tentar outra vez a leitura da lista;
   *   · não abre      → tentar outra vez ESTA foto, ou abri-la à parte.
   *
   * Uma caixa parada com «Imagem» é indistinguível de uma que falhou, e foi
   * isso que fez a dona do negócio concluir que não conseguia ver as
   * fotografias — quando, em parte, o que se passava era estarem a caminho.
   */
  /**
   * Não há URL, e a leitura da lista JÁ ACABOU — portanto não vem mais nenhum.
   *
   * Duas maneiras de aqui chegar, e as duas davam a mesma caixa cinzenta com a
   * palavra «Imagem»: a leitura falhou (rede, sessão caducada, Storage em
   * baixo), ou a leitura correu e esta fotografia não veio na lista. A segunda
   * é a mais traiçoeira — o `listProposalImages` devolve `[]` em vez de atirar
   * quando não alcança o bucket, e uma grelha inteira sem uma única fotografia
   * lia-se como «as fotos desapareceram».
   */
  const semUrlEFalhou = !alvo && estadoDosUrls !== "a-caminho";
  const desenhaImagem = Boolean(src) && !semRemedio;
  const aCarregar = !pintada && !semRemedio && !semUrlEFalhou;

  return {
    src,
    pesada,
    semRemedio,
    recusadaPeloSitio,
    semUrlEFalhou,
    ultimoAlvo,
    desenhaImagem,
    aCarregar,
    medir,
    largarAVez,
    setPintada,
    aoFalhar,
    tentarDeNovo,
  };
}
