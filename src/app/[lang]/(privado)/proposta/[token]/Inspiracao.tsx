"use client";

import { enderecoDaRotaDaFoto } from "./endereco-da-foto";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { contar, type TextosDaPagina } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MOOD BOARDS EM ECRÃ INTEIRO — A RAZÃO DE ESTA PÁGINA EXISTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «46 fotos de mood board comprimidas em páginas A4 ficam
 * pequenas, quando o trabalho é visual e merece ecrã inteiro.»
 *
 * ── O QUE ISTO NÃO É: UMA FOLHA A4 ────────────────────────────────────────
 *
 * Já existe um desenho fiel de uma página de mood board — o `PreviaDaPagina`
 * do estúdio, que lê as caixas de `proposal-geometria` e as divide pela folha.
 * Não se reaproveita AQUI, e não é distração: a folha A4 é exactamente o
 * problema que esta página existe para resolver. Aqui não há caixas, não há
 * pontos de PDF, não há uma proporção de página a respeitar. Há uma coluna de
 * fotografias com a largura do ecrã.
 *
 * ── A GRELHA: COLUNAS QUE FLUEM, SEM RECORTAR ─────────────────────────────
 *
 * `columns` do CSS, e não uma grelha de células de proporção fixa. A razão é
 * dela e está escrita no `ProposalDoc.enquadramento`: uma foto ao alto metida
 * numa célula ao baixo perde 68% da área — «uma foto de um portão coberto de
 * flores chegava à proposta com dois terços do portão de fora». Aqui cada
 * fotografia tem a forma que tem, e o que se ajusta é a coluna.
 *
 * UMA coluna no telemóvel, de propósito. Duas dariam ~185 px de largura num
 * ecrã de 390 — que é, ao pixel, o tamanho a que as fotografias já saem na
 * folha A4. Voltar a esse tamanho num ecrã seria fazer o trabalho todo para
 * não resolver nada.
 *
 * MEDIDO no mesmo documento de 46 fotografias:
 *
 *      390 px   1 coluna    fotografia com 350 px de largura
 *      768 px   2 colunas
 *     1440 px   3 colunas   fotografia com 333 px (a principal, 1024)
 *
 * e nenhuma das duas larguras faz a página rolar na horizontal
 * (`scrollWidth === clientWidth` nas duas).
 *
 * ── PORQUE É QUE A CÉLULA NASCE COM ALTURA ────────────────────────────────
 *
 * Cada foto declara o seu `aspect-ratio` a partir da forma guardada
 * (`formasDeCaminhos`). Sem isso, 46 células nascem com altura zero e a página
 * salta por baixo do dedo de quem está a ler.
 *
 * MEDIDO num Chromium a 390×844, com um documento de três boards e 46
 * fotografias, comparando a página sem imagens carregadas com a página depois
 * de todas chegarem:
 *
 *     com a forma guardada    o «Orçamento» fica onde estava       0 px
 *     sem a forma guardada    o «Orçamento» desce            10 833 px
 *
 * Dez mil pixels é o documento inteiro a fugir por baixo de quem estava a ler
 * uma condição. Num ecrã de 1440 o desvio com a forma é o mesmo: zero.
 *
 * Quando a forma não se sabe — fotografias anteriores às colunas de dimensão —
 * a célula fica sem `aspect-ratio` nenhum e cresce com a imagem: um salto, e
 * não uma mentira sobre a forma da fotografia.
 *
 * ── OS BYTES ──────────────────────────────────────────────────────────────
 *
 * A grelha pede as MINIATURAS (~30–60 KB); o original (~2,6 MB) só entra
 * quando a lupa abre. Com 46 fotografias é a diferença entre ~2 MB e ~120 MB.
 * O `/_next/image` está desligado neste projecto, portanto não há
 * redimensionamento a pedido: ou se pede a derivada certa, ou se paga o
 * ficheiro inteiro. Ver o cabeçalho de `proposta-fotos.ts`.
 *
 * ── PORQUE É QUE ISTO NÃO REAPROVEITA O `PhotoLightbox` DO ESTÚDIO ────────
 *
 * Porque ele é do estúdio: as palavras estão em português à letra (esta página
 * é bilingue e segue a língua da PROPOSTA), traz o botão «Transferir» (a
 * biblioteca do estúdio é para escolher fotos; a proposta é para as ver) e
 * puxa as peças de interface do back office (`./ui`, `AvisoDeFalha`).
 * Importá-lo era pendurar o que o casal vê num ramo do back office.
 *
 * O que É partilhado é a parte que tem de ser a mesma: a cascata de uma
 * fotografia cujo URL assinado morreu (`useFotoComPlanoB`) e o contrato de
 * teclado — Escape fecha, setas andam, o foco fica preso enquanto está aberto.
 * Fica DITO que as mecânicas do diálogo estão escritas duas vezes: extrair um
 * `useLightbox` comum é o passo certo e mexe num ficheiro com testes seus, por
 * isso não se faz de passagem.
 */

/** Um board como o ecrã precisa dele: sem geometria, só o que se lê e vê. */
export interface BoardParaEcra {
  /** Identidade estável, para chaves de React. */
  chave: string;
  titulo: string;
  subtitulo?: string;
  nota?: string;
  /** Os ids das fotografias deste board, pela ordem dela. */
  fotos: string[];
  /**
   * A foto que manda na página — POSIÇÃO dentro de `fotos`.
   *
   * No papel, duas das cinco disposições dão-lhe muito mais área
   * (`proposal-moodboard.ts`). Aqui não há disposições: dá-se-lhe a largura
   * toda, sozinha em cima, e o resto flui por baixo. É a mesma intenção dela
   * traduzida para um ecrã — e não a geometria do PDF, que não se partilha.
   */
  principal?: number;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUMA FOTOGRAFIA DE BOARD ENTRA COM PRESSA — NENHUMA SE VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto foi 11, depois 4, e agora é 0. Vale a pena dizer porquê, porque as três
 * decisões foram tomadas com o mesmo cuidado e só a última olhou para a ORDEM
 * das secções.
 *
 * O 11 era um defeito: o contador reiniciava a cada mood board, portanto uma
 * proposta com três boards mandava onze fotografias sem espera. O 4 corrigiu a
 * contagem — passou a ser por documento — mas manteve a premissa de que as
 * primeiras fotografias da grelha se vêem cedo.
 *
 * Não se vêem. A ordem do documento é: capa → apresentação → índice → serviços
 * → cronograma → INSPIRAÇÃO. Num telemóvel de 390 pontos, a capa acaba por
 * volta dos 680 px e a primeira fotografia de board está milhares de pixéis
 * abaixo — depois de três secções de texto. Nenhuma das quatro estava à vista.
 *
 * O que elas faziam era competir. Cada uma é a candidata de 1200 px (105 KB em
 * AVIF, 130 em WebP), portanto eram 420 a 520 KB a disputar a ligação com a
 * CAPA, que é a única coisa que o casal está mesmo a ver. Num 4G de quinta,
 * isso é a capa a demorar segundos por causa de fotografias que ninguém pediu.
 *
 * ── E NÃO SE PERDE NADA ───────────────────────────────────────────────────
 *
 * `loading="lazy"` não quer dizer «só quando aparecer»: o navegador começa a
 * buscá-las com muita antecedência — milhares de pixéis, mais ainda numa
 * ligação lenta. E cada célula pinta o seu borrão a partir do HTML antes de
 * qualquer ida à rede, portanto nenhuma caixa fica vazia enquanto isso.
 *
 * ── PORQUE É QUE É ZERO E NÃO UM ──────────────────────────────────────────
 *
 * Porque nem no documento sem capa a primeira fotografia de board está à vista:
 * continua a haver a apresentação, o índice e os serviços pelo meio. Nesse
 * caso o elemento de maior pintura é o TÍTULO — os nomes do casal — que é
 * texto, e o que o serve é a letra, não uma imagem.
 */
const FOTOS_ANSIOSAS = 0;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMA DE UMA FOTOGRAFIA QUE AINDA NÃO SE MEDIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três por dois deitada — a forma mais comum num mood board de decoração. Uma
 * foto sem medida não pode ficar de fora do equilíbrio: seria uma coluna a
 * crescer sem que a conta desse por isso.
 *
 * ── E É A MESMA QUE A CÉLULA DESENHA ─────────────────────────────────────
 *
 * Palavras dela: «Seating Plan e Corredor Nupcial, colunas que acabam antes das
 * outras».
 *
 * Era aqui que estava. A conta que reparte as fotografias pelas colunas assumia
 * três por dois para as que não têm medida guardada; a CÉLULA dessas mesmas
 * fotografias não reservava forma nenhuma e ficava com a altura natural do
 * ficheiro. Uma coluna com duas fotos de retrato sem medida crescia o dobro do
 * que a conta julgava — e o resultado é exactamente o que ela viu: uma coluna a
 * acabar muito antes da outra.
 *
 * Não é um defeito da repartição: é as duas metades a usarem números
 * diferentes para a mesma fotografia. Passam a usar este.
 *
 * O preço é uma foto sem medida poder sair recortada para três por dois em vez
 * de sair inteira. É o preço certo: as fotografias medidas — que são a esmagadora
 * maioria — saem com a forma delas como sempre saíram, e as outras deixam de
 * partir a página das que saem bem.
 */
const FORMA_POR_OMISSAO = { largura: 3, altura: 2 } as const;
/** A altura por unidade de largura — é assim que a repartição por colunas soma. */
const ALTURA_POR_OMISSAO = FORMA_POR_OMISSAO.altura / FORMA_POR_OMISSAO.largura;
/** A mesma forma, como o CSS a escreve. Uma forma só, em duas gramáticas. */
const PROPORCAO_POR_OMISSAO = `${FORMA_POR_OMISSAO.largura} / ${FORMA_POR_OMISSAO.altura}`;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COLUNAS ACABAM À MESMA ALTURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «há buracos visíveis onde uma coluna acaba antes da outra
 * (notório na Decoração Jantar)».
 *
 * O `columns` do CSS enche uma coluna de cima a baixo antes de começar a
 * seguinte e equilibra-as por conta própria — mas com `break-inside: avoid`
 * (que é o que impede uma fotografia de ser partida ao meio) o equilíbrio é o
 * melhor que ele consegue com blocos indivisíveis, e sobra sempre um degrau.
 *
 * Aqui as colunas são arrumadas ANTES de a página se desenhar, com as formas
 * das fotografias já conhecidas: cada uma vai para a coluna que está mais
 * curta nesse momento. É o empacotamento guloso de sempre, e dá o degrau
 * mínimo que existe sem experimentar todas as combinações.
 *
 * ── O QUE ISTO CUSTA, E A DECISÃO DELA ───────────────────────────────────
 *
 * A ordem de leitura. Uma fotografia pode saltar de coluna para equilibrar, e
 * por isso a ordem que ela arrumou no estúdio deixa de se ler exactamente da
 * esquerda para a direita. Numa página desenhada no servidor, sem JavaScript a
 * medir o ecrã, é uma coisa ou a outra — e a escolha foi dela, com a pergunta
 * feita nestes termos: colunas equilibradas.
 *
 * ── E NO TELEMÓVEL NÃO SE PERDE NADA ─────────────────────────────────────
 *
 * Porque lá só há uma coluna, e uma coluna não tem nada para equilibrar. O
 * desenho devolve-lhe a ordem dela — ver o `display: contents` e o `order` no
 * sítio onde isto se desenha.
 */
function arrumarPorColunas<T>(
  itens: readonly T[],
  quantas: number,
  alturaDe: (item: T) => number,
): T[][] {
  const colunas: T[][] = Array.from({ length: quantas }, () => []);
  const alturas = new Array(quantas).fill(0);
  for (const item of itens) {
    let maisCurta = 0;
    for (let c = 1; c < quantas; c += 1) if (alturas[c] < alturas[maisCurta]) maisCurta = c;
    colunas[maisCurta].push(item);
    alturas[maisCurta] += alturaDe(item);
  }
  return colunas;
}

/**
 * A posição da foto marcada como principal, ou `null` quando não há marca.
 *
 * `null` e não «a primeira»: no papel, ausente quer dizer «a primeira», porque
 * ALGUMA foto tem sempre de calhar à caixa grande. Aqui não há caixa grande a
 * preencher — sem marca dela, a grelha trata as fotografias todas por igual, e
 * não se inventa um destaque que ela não pediu.
 */
function destacada(board: BoardParaEcra): number | null {
  const p = board.principal;
  if (typeof p !== "number" || !Number.isInteger(p)) return null;
  if (p < 0 || p >= board.fotos.length) return null;
  return p;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOMENTO DE RESPIRAÇÃO — A FOTOGRAFIA QUE ABRE CADA SECÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «A capa (arco em azulejo) é a única imagem grande da página.
 * Devia haver mais momentos assim, a separar secções: uma foto a toda a
 * largura entre blocos.»
 *
 * É a posição da fotografia que sobe da grelha para cima do título e se
 * desenha com a largura toda do documento, como a capa. Não é uma cópia: a
 * foto SAI da grelha, e por isso não se vê duas vezes.
 *
 * ── PORQUE É QUE HÁ UMA SEGUNDA ESCOLHA ──────────────────────────────────
 *
 * O `destacada` devolve `null` quando ela não marcou nada, e essa decisão
 * mantém-se para a GRELHA: sem marca, as fotografias são todas iguais e não se
 * inventa um destaque. Mas o que ela pediu aqui não foi um destaque — foi ar
 * entre secções, em TODAS. Sem marca, abre a primeira que resolve, que é a
 * ordem que ela própria arrumou no estúdio.
 *
 * ── E PORQUE É QUE TEM DE RESOLVER ───────────────────────────────────────
 *
 * Porque uma célula que não abre a fotografia desaparece em silêncio (é a
 * regra desta página), e um respiro que desaparece deixa o título encostado ao
 * bloco anterior — o buraco exactamente onde se queria o ar.
 */
/**
 * O nome do momento SEM fotografia por baixo — a preto sobre o papel.
 *
 * Existia inline, no caminho «nenhuma das fotografias resolveu». Passa a ser
 * partilhado porque há um SEGUNDO caminho para o mesmo sítio, e era ele que
 * estava a falhar: ver `Respiro`.
 */
function TituloDoMomento({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <>
      <h3
        className="text-foreground/90 text-balance"
        style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 3.4vw, 34px)" }}
      >
        {titulo}
      </h3>
      {subtitulo && (
        <p className="text-foreground/72 mt-1.5 text-sm leading-relaxed">{subtitulo}</p>
      )}
    </>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOMENTO DE RESPIRAÇÃO — e o título que desiste com a fotografia
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era um bloco inline. Passa a componente por uma razão só, e ela é um
 * defeito que a dona do negócio viu no telemóvel dela, na proposta a sério:
 *
 *     um rectângulo cinzento, sem fotografia nenhuma, com «Saída dos noivos»
 *     escrito por cima
 *
 * ── PORQUE É QUE A REDE QUE JÁ EXISTIA NÃO O APANHOU ──────────────────────
 *
 * O ficheiro já dizia a coisa certa, e por extenso: «um título branco sobre
 * nada nenhum é o defeito que isto existe para não ter». Só que essa guarda é
 * o `respiro()`, que corre UMA vez, no servidor, e pergunta se a fotografia
 * TEM endereço. Tinha.
 *
 * O que falhou foi o endereço, já depois de a página estar desenhada — uma
 * assinatura expirada, uma derivada que não chegou a ser feita. Aí a célula
 * desiste e devolve `null`, e a faixa do título, que é irmã dela e não filha,
 * fica desenhada por cima do vazio: o véu escuro sobre o papel branco dá o
 * cinzento, e o nome do momento por cima dele.
 *
 * Havia dois caminhos para o mesmo sítio e só um estava tapado. Aqui os dois
 * convergem no `TituloDoMomento` — o nome volta a preto, sobre o papel, como
 * já acontecia quando a fotografia faltava desde o início.
 */
function Respiro({
  chave,
  token,
  foto,
  ansiosa,
  rotulo,
  textos,
  aoAmpliar,
  aoDesistir,
  titulo,
  subtitulo,
}: {
  /** O nome desta fotografia na página — ver `chave`, na `Celula`. */
  chave: string;
  token: string;
  foto?: FotoDaProposta;
  ansiosa: boolean;
  rotulo: string;
  textos: TextosDaPagina;
  aoAmpliar: (alvo: HTMLElement | null) => void;
  aoDesistir: () => void;
  titulo: string;
  subtitulo?: string;
}) {
  /**
   * ── CAÍDO ENQUANTO FOR O MESMO ENDEREÇO, E NÃO PARA SEMPRE ──────────────
   *
   * A primeira versão disto era um `caiu: boolean`, e a rede que já existia
   * apanhou-a: quando as assinaturas morrem, esta página tem um botão que as
   * VOLTA A PEDIR — e com um booleano o momento nunca regressava. O casal
   * carregava em «recarregar» e ficava com o nome a preto e a fotografia por
   * baixo dele para sempre.
   *
   * Guardar QUAL endereço falhou resolve-o sem efeito nenhum: assinaturas
   * novas mudam o endereço, a comparação deixa de bater, e o momento volta.
   * Um endereço novo é uma hipótese nova.
   */
  const [enderecoQueFalhou, setEnderecoQueFalhou] = useState<string | null>(null);
  const endereco = foto?.miniatura ?? foto?.original ?? null;
  const caiu = enderecoQueFalhou !== null && enderecoQueFalhou === endereco;

  const desistir = useCallback(() => {
    setEnderecoQueFalhou(endereco);
    aoDesistir();
  }, [aoDesistir, endereco]);

  if (caiu) return <TituloDoMomento titulo={titulo} subtitulo={subtitulo} />;

  return (
    /* Sem `mb-9`: o afastamento até à grelha é do PAR, e vive agora na
       grelha — que só é desenhada quando tem fotografias. Ver o comentário
       lá em baixo: com ele aqui, um board de uma só fotografia levava 36 px
       a separá-lo de uma grelha vazia. */
    /* ── A CHEGADA DO MOMENTO ─────────────────────────────────────────────
       O respiro é a abertura de cada mood board, e o nome do momento lê-se COM
       a fotografia e não depois dela — por isso sobem juntos, num só gesto, e
       o título nunca leva movimento próprio.

       16 px: um degrau acima da fotografia da grelha (12) e da secção (14),
       porque isto é o que anuncia um momento novo do dia. A escada vive no
       `globals.css`; aqui só se diz o PAPEL. */
    <div className="relative" data-sobe="respiro">
      <Celula
        semDegrau
        chave={chave}
        token={token}
        foto={foto}
        /* Só o do PRIMEIRO board entra ansioso. Os outros estão a
                   milhares de pixéis de distância, e três fotografias
                   grandes a carregar de uma vez são meio megabyte gasto
                   antes de a primeira secção acabar de se desenhar. */
        ansiosa={ansiosa}
        /* Mais alta do que a capa (que ainda tem a página toda por
                 baixo dela) e com tecto: uma foto ao alto a 1024 px de
                 largura são 1500 px de altura, e isso não é um respiro, é um
                 ecrã inteiro sem uma palavra. */
        tecto="min(64vh, 560px)"
        larguraNoEcra="(min-width: 1024px) 1024px, 100vw"
        rotulo={rotulo}
        textos={textos}
        aoAmpliar={aoAmpliar}
        aoDesistir={desistir}
      />
      {/*
       * ── O NOME DO MOMENTO POR CIMA DA FOTOGRAFIA ──────────────
       *
       * Palavras dela: «as secções principais abrem com uma imagem a
       * toda a largura e o nome do momento por cima». O título
       * estava por baixo, e por baixo ele é uma legenda: lê-se
       * depois da fotografia, e o que ela quer é que se leia COM ela.
       *
       * `pointer-events-none` porque a fotografia por baixo é
       * clicável (amplia), e uma faixa de texto por cima roubava-lhe
       * metade da área de toque sem dizer que o fazia.
       *
       * O véu escuro não é decoração: sem ele, um título branco
       * sobre uma fotografia de mesa posta em luz alta desaparece.
       * Começa em transparente a meio da altura para não escurecer a
       * fotografia inteira — o que se quer é ler o texto, não pôr um
       * filtro na foto dela.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-sm bg-gradient-to-t from-black/60 via-black/25 to-transparent"
        style={{ height: "58%" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <h3
          className="text-balance text-white"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(22px, 3.4vw, 34px)",
            textShadow: "0 1px 12px rgba(0,0,0,0.35)",
          }}
        >
          {titulo}
        </h3>
        {subtitulo && (
          <p
            className="mt-1.5 text-sm leading-relaxed text-white/85"
            style={{ textShadow: "0 1px 10px rgba(0,0,0,0.35)" }}
          >
            {subtitulo}
          </p>
        )}
      </div>
    </div>
  );
}

function respiro(board: BoardParaEcra, fotos: Record<string, FotoDaProposta>): number | null {
  const resolve = (i: number) => {
    const f = fotos[board.fotos[i]];
    return !!(f?.miniatura || f?.original);
  };
  const marcada = destacada(board);
  if (marcada !== null && resolve(marcada)) return marcada;
  const primeira = board.fotos.findIndex((_, i) => resolve(i));
  return primeira === -1 ? null : primeira;
}

export default function Inspiracao({
  boards,
  fotosIniciais,
  token,
  textos,
}: {
  boards: BoardParaEcra[];
  /** O mapa `id → fotografia`, já assinado no servidor. Sem cascata na 1.ª pintura. */
  fotosIniciais: Record<string, FotoDaProposta>;
  /** Para voltar a pedir assinaturas quando as de agora morrerem. */
  token: string;
  textos: TextosDaPagina;
}) {
  const [fotos, setFotos] = useState(fotosIniciais);
  /**
   * A LUPA. Guarda-se o board e a posição, e não a fotografia: as setas andam
   * DENTRO do board, que é como o documento está organizado — saltar de
   * «Decoração Cerimónia» para «Copo de água» a meio de uma seta seria uma
   * viagem que ninguém pediu.
   */
  const [aberta, setAberta] = useState<{ board: number; i: number } | null>(null);
  /**
   * A fotografia a voltar para a miniatura, DEPOIS de a lupa já ter saído.
   * Ver o `fechar`, aqui em baixo: fechar é uma tarefa, o voo é decoração.
   */
  const [regresso, setRegresso] = useState<RegressoDaLupa | null>(null);
  const [arecarregar, setARecarregar] = useState(false);
  /**
   * Alguma célula desistiu de mostrar a fotografia?
   *
   * É o que decide se o botão de voltar a pedir as assinaturas existe. Um botão
   * «Voltar a carregar as fotografias» sempre à vista, numa proposta de vinte
   * mil euros, diz ao casal que o estúdio conta com isto avariar. Quando
   * avariar mesmo, aparece.
   */
  const [houveFalha, setHouveFalha] = useState(false);
  // Identidade estável: a célula avisa dentro de um efeito, e um retorno novo a
  // cada desenho punha esse efeito a correr em cada pintura.
  const marcarFalha = useCallback(() => setHouveFalha(true), []);
  /** Quem abriu a lupa, para o foco voltar exactamente ao sítio de onde saiu. */
  const origemDoFoco = useRef<HTMLElement | null>(null);

  /**
   * ── VOLTAR A PEDIR AS ASSINATURAS ────────────────────────────────────────
   *
   * Os URLs da Biblioteca de Temas valem 6 horas. Um separador deixado aberto
   * durante uma tarde fica com fotografias mortas, e sem isto a única saída era
   * recarregar a página inteira e voltar a pagar tudo. Pede-se a rota, que
   * reassina o que está NAQUELE documento — nunca se lhe manda um caminho.
   */
  // A9-008: uma resposta que não servia (`!r.ok`, sem fotos) saía calada — o
  // casal carregava, nada mudava, e não sabia se tinha resultado. Agora diz.
  const [recarregarFalhou, setRecarregarFalhou] = useState(false);
  const recarregar = useCallback(async () => {
    setARecarregar(true);
    setRecarregarFalhou(false);
    try {
      const r = await fetch(`/api/proposta/${encodeURIComponent(token)}/fotos`, {
        cache: "no-store",
        signal: AbortSignal.timeout?.(20_000),
      });
      const corpo = r.ok ? ((await r.json()) as { fotos?: FotoDaProposta[] }) : null;
      if (!corpo?.fotos) {
        setRecarregarFalhou(true);
        return;
      }
      setFotos(Object.fromEntries(corpo.fotos.map((f) => [f.id, f])));
    } catch {
      // Sem rede: fica o que está, o botão continua lá, e diz-se.
      setRecarregarFalhou(true);
    } finally {
      setARecarregar(false);
    }
  }, [token]);

  const abrir = useCallback((board: number, i: number, alvo: HTMLElement | null) => {
    origemDoFoco.current = alvo;
    // Um regresso ainda a voar, com a lupa a abrir por cima, seria um véu preto
    // a esbater-se sobre uma fotografia que está a nascer. Corta-se.
    setRegresso(null);
    setAberta({ board, i });
  }, []);

  /**
   * ── FECHAR É UMA TAREFA; O VOO DE VOLTA É DECORAÇÃO ─────────────────────
   *
   * As três primeiras linhas acontecem no MESMO instante do gesto: a lupa sai
   * do documento, o foco volta ao botão, o corpo volta a rolar. É a regra dela
   * — nenhuma animação atrasa uma tarefa — e é também o que mantém os 42 casos
   * que guardam a lupa: o `queryByRole("dialog")` continua a dar `null` logo a
   * seguir ao Escape.
   *
   * A quarta linha pendura uma fotografia a encolher, que NÃO é diálogo, não
   * tem foco e não recebe toques. Se o casal fizer outra coisa a meio, não
   * interrompe nada — não há nada para interromper.
   *
   * Uma animação de saída DENTRO da lupa obrigaria o diálogo a ficar montado
   * mais 240 ms depois de alguém mandar fechar, e com ele o foco preso e a
   * página que não rola. Era trocar a regra dela por um efeito.
   */
  const fechar = useCallback((voo: RegressoDaLupa | null) => {
    setAberta(null);
    // O foco volta ao botão que abriu — sem isto, quem navega por teclado sai
    // do diálogo e reaparece no topo da página, dez mil pixels acima.
    origemDoFoco.current?.focus();
    setRegresso(voo);
  }, []);

  const limparRegresso = useCallback(() => setRegresso(null), []);

  const andar = useCallback(
    (delta: number) => {
      setAberta((a) => {
        if (!a) return a;
        const n = boards[a.board]?.fotos.length ?? 0;
        const i = a.i + delta;
        if (i < 0 || i >= n) return a;
        return { ...a, i };
      });
    },
    [boards],
  );

  const boardAberto = aberta ? boards[aberta.board] : null;
  const fotoAberta = boardAberto ? fotos[boardAberto.fotos[aberta!.i]] : undefined;

  /**
   * ── QUANTAS FOTOGRAFIAS VÊM ANTES DE CADA BOARD ────────────────────────
   *
   * O `FOTOS_ANSIOSAS` diz «quantas fotos entram antes de o navegador deixar
   * de carregar à frente» — uma frase sobre o DOCUMENTO. Só que a conta era
   * feita com o índice dentro de cada board, e portanto recomeçava do zero em
   * cada um.
   *
   * MEDIDO numa proposta de três boards e 46 fotografias, com os pesos que
   * este ficheiro já tem escritos (105,3 KB a 1200 px em AVIF): saíam ONZE
   * pedidos com pressa — a capa, o respiro do primeiro board e três células
   * por board. Dessas onze, UMA está no ecrã; as outras dez estão entre mil e
   * quinhentos e quinze mil píxeis abaixo.
   *
   * Num 4G de 1,5 Mbps são 1 158 KB antes de a página servir para alguma
   * coisa — 6,2 s —, e o pior nem é o total: é a capa, que é a única que o
   * casal está a ver, ficar em fila atrás de dez fotografias que ele não
   * alcança sem rolar meio minuto.
   *
   * Com a conta no documento ficam quatro, que é o que o número sempre disse.
   * O número não muda; muda o sítio onde se conta.
   */
  const fotosAntesDoBoard: number[] = [];
  {
    let contadas = 0;
    for (const board of boards) {
      fotosAntesDoBoard.push(contadas);
      contadas += board.fotos.length;
    }
  }

  return (
    <>
      {boards.map((board, b) => {
        /** A posição desta fotografia no documento inteiro, e não no board. */
        const noDocumento = (i: number) => (fotosAntesDoBoard[b] ?? 0) + i;
        const oRespiro = respiro(board, fotos);
        /**
         * ── QUANTAS COLUNAS TEM ESTA SECÇÃO ────────────────────────────────
         *
         * «A proposta está densa e monótona: quase tudo a três colunas, sem
         * pausas. Variar o número de colunas entre secções.»
         *
         * A variação nasce do CONTEÚDO e não de um contador. Um board com duas
         * ou três fotografias em duas colunas fica com uma coluna a metade e a
         * outra vazia — é a secção que parece por acabar. Sozinhas e à largura
         * toda, essas mesmas fotografias são o destaque que ela quer. A partir
         * de quatro, duas colunas dão o ritmo de grelha sem encolher nada.
         *
         * Um índice (`b % 2`) daria variação também, e daria a secção errada:
         * a mesma proposta arrumada por outra ordem mudava de desenho sem que
         * nada no conteúdo tivesse mudado.
         */
        const naGrelha = board.fotos.map((id, i) => ({ id, i })).filter(({ i }) => i !== oRespiro);
        const quantasColunas = naGrelha.length <= 3 ? 1 : 2;
        const arrumadas = arrumarPorColunas(naGrelha, quantasColunas, ({ id }) => {
          const f = fotos[id];
          return f?.largura && f?.altura ? f.altura / f.largura : ALTURA_POR_OMISSAO;
        });
        return (
          /**
           * ── O AFASTAMENTO ENTRE MOOD BOARDS ─────────────────────────────
           *
           * Era `mt-24 sm:mt-36` — 96 px no telemóvel. Palavras dela: os
           * «buracos brancos» entre os mood boards.
           *
           * MEDIDO num 390×844, com oito boards: o branco entre dois boards
           * era de 96 px, e o branco entre dois CAPÍTULOS do documento — entre
           * «Serviços» e «Orçamento Proposto», que são secções de topo — é de
           * 64 px (`Documento.tsx`, `mt-16 sm:mt-24`).
           *
           * A hierarquia estava ao contrário. Um mood board não é um capítulo:
           * é uma parte DENTRO do capítulo «Inspiração». Separá-lo do vizinho
           * com uma vez e meia o intervalo que separa dois capítulos diz ao
           * olho que ali acabou alguma coisa maior do que acabou — e é isso
           * que se lê como buraco, e não como respiração.
           *
           * `mt-12 sm:mt-16` (48/64) põe-no um degrau ABAIXO do capítulo, que
           * é onde ele vive. E não é pouco: cada board abre com uma fotografia
           * a toda a largura com o nome do momento por cima — o separador mais
           * forte desta página inteira não precisa de 96 px de branco a
           * anunciá-lo.
           */
          /* ── O BOARD NÃO SE MOVE. MOVEM-SE AS FOTOGRAFIAS DELE ──────────
             Isto levou `data-sobe="bloco"` (8 px) e CONTÉM as fotografias, que
             levam `data-sobe="foto"` (12). Um `transform` no pai desloca o
             filho: cada fotografia andava 20 px em vez dos 12 que a escada lhe
             dá. Um board de fotografias é onde a escada mais tem de ser exacta,
             porque são dezenas de gestos seguidos.

             O gesto do board não se perdeu: passou para o respiro, a fotografia
             a toda a largura que o abre — que é o separador mais forte desta
             página e o sítio certo para o anúncio de um momento novo. */
          <section key={board.chave} className="mt-12 first:mt-6 sm:mt-16">
            {/* ── O MOMENTO DE RESPIRAÇÃO ──────────────────────────────────────
              «Devia haver mais momentos assim, a separar secções: uma foto a
              toda a largura entre blocos.» Vem ANTES do título de propósito:
              é o que separa o bloco que acabou do que começa, e é a primeira
              coisa que se vê da secção nova. A largura é a mesma da capa
              (a do documento), porque foi a capa que ela deu como exemplo.

              Ver `respiro`, acima, para qual das fotografias é. */}
            {oRespiro !== null && (
              <Respiro
                chave={`${b}-${oRespiro}`}
                token={token}
                foto={fotos[board.fotos[oRespiro]]}
                ansiosa={noDocumento(oRespiro) < FOTOS_ANSIOSAS}
                rotulo={contar(textos.contagem, oRespiro + 1, board.fotos.length)}
                textos={textos}
                aoAmpliar={(alvo) => abrir(b, oRespiro, alvo)}
                aoDesistir={marcarFalha}
                titulo={board.titulo}
                subtitulo={board.subtitulo}
              />
            )}
            {/*
             * Sem respiro — a secção cujas fotografias nenhuma resolveu — o
             * título volta ao sítio de sempre. Não há fotografia por cima de
             * que ele possa estar, e um título branco sobre nada nenhum é o
             * defeito que isto existe para não ter.
             */}
            {oRespiro === null && (
              <TituloDoMomento titulo={board.titulo} subtitulo={board.subtitulo} />
            )}

            {/* ── A GRELHA ─────────────────────────────────────────────────────
              `columns` e não `grid`: a fotografia entra com a forma que tem.
              O `break-inside: avoid` (a classe `.foto-inteira`, em globals.css)
              é o que impede uma foto de ser partida ao meio entre colunas. */}
            {/* ── MENOS COLUNAS, FOTOGRAFIAS MAIORES ─────────────────────
              Eram três a partir de `lg`, e as palavras dela sobre o resultado
              não deixam dúvidas: «uma foto de decoração a 200px de largura não
              vende nada». Duas colunas num ecrã de 1440 dão ~430 px por
              fotografia em vez de ~280 — mais de metade da área. No telemóvel
              continua uma, pela razão que já estava escrita aqui: duas a 390
              px davam o mesmo tamanho a que elas já saem na folha A4, e voltar
              a esse tamanho num ecrã era fazer o trabalho todo para não
              resolver nada. */}
            {/**
             * ── A GRELHA SÓ EXISTE QUANDO TEM FOTOGRAFIAS ───────────────
             *
             * MEDIDO: num board cuja ÚNICA fotografia é o respiro, o branco
             * até ao board seguinte era de 132 px em vez dos 96 dos outros.
             * Os 36 px a mais eram o `mb-9` do respiro — que existe para o
             * separar da grelha — a separá-lo de uma grelha VAZIA.
             *
             * O afastamento é do PAR, não do respiro: passa para a grelha, e
             * a grelha deixa de ser desenhada quando não tem nada dentro.
             * Assim o intervalo entre boards é o mesmo em todos, que é o que
             * faz um ritmo ser um ritmo.
             */}
            {naGrelha.length > 0 && (
              <div
                className={`flex flex-col gap-4 sm:flex-row ${oRespiro !== null ? "mt-9" : "mt-3"}`}
              >
                {arrumadas.map((coluna, c) => (
                  /*
                   * ── UMA COLUNA, E NO TELEMÓVEL NENHUMA ──────────────────
                   *
                   * `contents` faz este `div` desaparecer da disposição e deixa
                   * as fotografias serem filhas directas do `flex` de cima. É o
                   * que permite ter as duas coisas: acima de `sm` são duas
                   * colunas equilibradas, e abaixo é uma coluna só onde o
                   * `order` de cada fotografia lhe devolve a ordem que ELA
                   * arrumou no estúdio.
                   *
                   * O `order` não faz mal nenhum do lado de cima: dentro de cada
                   * coluna os índices já são crescentes (o empacotamento nunca
                   * recua), portanto ordená-los por ele é deixá-los como estão.
                   */
                  <div
                    key={c}
                    className="contents sm:flex sm:flex-1 sm:flex-col sm:gap-4"
                    style={{ minWidth: 0 }}
                  >
                    {coluna.map(({ id, i }) => (
                      <Celula
                        key={id}
                        chave={`${b}-${i}`}
                        token={token}
                        foto={fotos[id]}
                        ansiosa={noDocumento(i) < FOTOS_ANSIOSAS}
                        rotulo={contar(textos.contagem, i + 1, board.fotos.length)}
                        textos={textos}
                        aoAmpliar={(alvo) => abrir(b, i, alvo)}
                        aoDesistir={marcarFalha}
                        ordem={i}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/*
             * ── A PAUSA DE LEITURA ────────────────────────────────────────
             *
             * «Uma frase curta ou citação entre blocos, como pausa de leitura.»
             *
             * A frase já existia e já era escrita por ela — a anotação do mood
             * board —, desenhada como uma nota de rodapé encostada à esquerda
             * com uma barra verde. Lia-se como um aviso técnico.
             *
             * É a mesma frase, no mesmo sítio, com o desenho do que ela é:
             * centrada, na serifada do documento, com ar dos dois lados. Não se
             * inventou conteúdo nenhum para isto — uma pausa escrita pelo
             * programa seria uma frase de embrulho entre duas secções de
             * trabalho verdadeiro.
             */}
            {board.nota && (
              <p
                className="text-foreground/70 mx-auto mt-10 max-w-xl text-center leading-relaxed text-balance sm:mt-14"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(16px, 2vw, 19px)" }}
              >
                {board.nota}
              </p>
            )}
          </section>
        );
      })}

      {/* O botão de reassinar só existe quando alguma coisa correu mal. Ver
          `houveFalha`. */}
      {houveFalha && (
        <p className="mt-10 text-center">
          <button
            type="button"
            onClick={recarregar}
            disabled={arecarregar}
            className="alvo-toque text-foreground/60 hover:text-moss inline-flex items-center justify-center text-[11px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50"
          >
            {textos.recarregarFotos}
          </button>
          {recarregarFalhou && (
            <span role="status" className="mt-2 block text-[11px] text-foreground/70">
              {textos.recarregarFalhou}
            </span>
          )}
        </p>
      )}

      {boardAberto && aberta && (
        <Lupa
          foto={fotoAberta}
          /* De onde ela nasce. Segue a fotografia ABERTA e não a que abriu a
             lupa: depois de duas setas, voltar à primeira miniatura era nascer
             do sítio errado. */
          chaveDoAlvo={`${aberta.board}-${aberta.i}`}
          rotulo={contar(textos.contagem, aberta.i + 1, boardAberto.fotos.length)}
          temAnterior={aberta.i > 0}
          temSeguinte={aberta.i < boardAberto.fotos.length - 1}
          textos={textos}
          aoFechar={fechar}
          aoAndar={andar}
        />
      )}

      {regresso && <Regresso voo={regresso} aoAcabar={limparRegresso} />}
    </>
  );
}

/**
 * Uma célula da grelha.
 *
 * É um `<button>` e não uma `<div>` com `onClick`: quem navega por teclado tem
 * de lá chegar com Tab e abrir com Enter, e um `role="button"` inventado à mão
 * não traz nada disso de borla.
 */
function Celula({
  foto,
  ansiosa,
  rotulo,
  chave,
  semDegrau = false,
  textos,
  token,
  tecto,
  larguraNoEcra,
  aoAmpliar,
  aoDesistir,
  ordem,
}: {
  foto?: FotoDaProposta;
  ansiosa: boolean;
  rotulo: string;
  /**
   * O nome desta célula na página, para a lupa saber de onde nasceu.
   *
   * Um atributo no DOM e não um `ref` guardado num mapa, de propósito: quem
   * pergunta é a lupa, que monta noutro sítio da árvore, e uma pergunta ao
   * documento é a verdade daquele fotograma — um mapa mantido por outro
   * componente é exactamente o tipo de estado que fica desactualizado sem
   * ninguém dar por isso.
   */
  chave?: string;
  /**
   * Esta fotografia já vem dentro de um gesto — o do respiro — e por isso não
   * leva degrau próprio. Somar-lhe-o dava 28 px onde a escada declara 16, e a
   * escada só vale enquanto disser a verdade.
   */
  semDegrau?: boolean;
  textos: TextosDaPagina;
  /** Para pedir a derivada intermédia desta fotografia — ver o `srcset`. */
  token: string;
  /**
   * A posição desta fotografia na ordem DELA.
   *
   * Só serve num sítio: no telemóvel, onde as colunas equilibradas deixam de
   * existir (`display: contents`) e as fotografias passam a ser filhas do
   * mesmo `flex`. Aí é este número que lhes devolve a ordem do estúdio. Acima
   * de `sm` não faz diferença nenhuma — dentro de cada coluna os índices já
   * são crescentes.
   */
  ordem?: number;
  /**
   * Um tecto de altura, para a célula que se desenha à largura toda.
   *
   * Sem ele, uma fotografia ao alto a 1024 px de largura dá 1500 px de altura
   * e come o ecrã inteiro antes de se chegar a uma palavra. Com ele, a caixa
   * pára na altura escrita e o `object-cover` recorta — a mesma decisão que a
   * capa já tomava. Nas células da grelha não existe: é lá que a regra dela
   * manda («cada fotografia com a forma que tem»).
   */
  tecto?: string;
  /** O que dizer ao `sizes` quando esta célula não é uma célula da grelha. */
  larguraNoEcra?: string;
  aoAmpliar: (alvo: HTMLElement | null) => void;
  /** Esta célula esgotou as tentativas. Ver `houveFalha`, acima. */
  aoDesistir: () => void;
}) {
  /**
   * A derivada intermédia desta fotografia.
   *
   * Assinada, quando já foi fabricada: vem do CDN do Storage directamente ao
   * telemóvel, sem passar pela nossa função. Enquanto não existir, é a rota que
   * a fabrica, guarda e serve — pelo id OPACO, nunca por um caminho (ver
   * `api/proposta/[token]/foto/[id]`). Ver `signProposalMids` para o porquê de
   * a rota ter deixado de ser o caminho de todos os dias.
   */
  const media = foto ? (foto.media ?? enderecoDaRotaDaFoto(token, foto)) : "";

  /**
   * ── A GRELHA DEIXA DE CAIR NO ORIGINAL ─────────────────────────────────
   *
   * A cascata era `miniatura ?? original` com o original como plano B. Numa
   * fotografia SEM miniatura — o caso das anteriores ao bucket, que são
   * precisamente as das propostas antigas que estão nas caixas de correio —
   * isso punha o ficheiro inteiro dentro de uma caixa de 350 px.
   *
   * O degrau do meio existia e estava a ser saltado: a derivada de 1200 px
   * está calculada aqui em cima e existe SEMPRE, porque quando ainda não foi
   * fabricada cai na rota que a fabrica.
   *
   * A conta, com os pesos medidos neste ficheiro e um 4G de 1,5 Mbps:
   *
   *     original   2 600 KB ÷ 187,5 KB/s = 13,9 s
   *     1200 px      105 KB ÷ 187,5 KB/s =  0,56 s
   *
   * Treze segundos por fotografia, numa página que é feita de fotografias. O
   * próprio `useFotoComPlanoB` foi escrito por causa deste defeito e tem a
   * medição no cabeçalho — aceita uma lista desde então, e esta página era a
   * única que continuava a passar-lhe uma cadeia só.
   *
   * O original fica onde deve estar: em último, para quando nem a derivada
   * responde. Sem `tentarDeNovo` — a célula que desiste desaparece, e quem a
   * faz voltar é o botão do pé da galeria, que reassina o documento inteiro.
   */
  const { alvo, desistiu, aoFalhar } = useFotoComPlanoB(foto?.miniatura ?? media, [
    media,
    foto?.original,
  ]);
  // Sem medida guardada, vale a forma que a repartição por colunas assumiu —
  // ver `PROPORCAO_POR_OMISSAO`. Deixá-la em branco era o que punha uma coluna
  // a acabar antes da outra.
  const proporcao =
    foto?.largura && foto?.altura ? `${foto.largura} / ${foto.altura}` : PROPORCAO_POR_OMISSAO;
  /**
   * O `srcset` só vale enquanto a primeira escolha está de pé.
   *
   * Depois de a cascata cair para o plano B, o que interessa é servir ALGUMA
   * COISA — e um `srcset` deixaria o navegador voltar a escolher o candidato
   * que acabou de falhar.
   */
  const temSrcset = !!foto?.miniatura && alvo === foto.miniatura;
  // A oferta em AVIF da de 1200 saiu a 14/11 — um segundo ficheiro do mesmo
  // tamanho (`derivadas.ts`, «E JÁ NÃO HÁ AVIF AO LADO»).

  // Avisar o pai NUM EFEITO, e não durante o desenho: mudar estado do pai a
  // meio do render de um filho é o aviso que o React dá («Cannot update a
  // component while rendering a different component»).
  useEffect(() => {
    if (desistiu) aoDesistir();
  }, [desistiu, aoDesistir]);

  /**
   * ── UMA FOTO QUE NÃO ABRE DESAPARECE. NÃO SE EXPLICA. ────────────────────
   *
   * Palavras dela, a olhar para a página de uma proposta que já tinha seguido:
   * «quatro barras cinzentas com ícone de imagem quebrada onde devia estar a
   * primeira foto. Um cliente que veja isto conclui que a empresa é
   * descuidada.»
   *
   * Aqui estava a nossa própria mensagem de falha — «Não foi possível mostrar
   * esta fotografia» e um «Tentar de novo» — repetida célula a célula. Escrita
   * para ajudar, e a fazer exactamente o contrário: quatro caixas cinzentas a
   * meio de um mood board, numa proposta de vinte mil euros, dizem ao casal
   * que o estúdio nem sabe o que tem no documento.
   *
   * O aviso não desaparece do produto — mudou de sítio. Sobe para o pé da
   * galeria, UMA vez («Voltar a carregar as fotografias», ver `houveFalha`),
   * que é onde ele serve para alguma coisa: o caso comum é um separador aberto
   * há seis horas com as assinaturas caducadas, e aí um só botão resolve tudo.
   * E o caso do ficheiro que não existe passou a ser apanhado ANTES do envio —
   * ver `proposta-fotos-verificacao.ts`, que é o sítio certo para o descobrir:
   * do lado de cá, com tempo de o corrigir.
   *
   * O `aoDesistir` acima é o que faz o botão do pé aparecer, e por isso corre
   * antes deste regresso.
   */
  if (desistiu || !alvo) return null;

  return (
    /* O `order` só tem efeito quando as colunas desaparecem (telemóvel, com o
       `display: contents`); acima de `sm` as fotografias já estão em ordem
       crescente dentro da sua coluna. Ver `arrumarPorColunas`. */
    /* O `data-sobe` vai na `<figure>` e NUNCA no `<button>` lá dentro: é o
       botão que leva `content-visibility: auto` (`.foto-adiavel`), e uma
       animação numa caixa cuja pintura o browser está a saltar é uma
       negociação que não vale a pena ter. Aqui fora não há nada a negociar. */
    <figure
      className="foto-inteira m-0"
      /* ── QUEM JÁ VEM DENTRO DE UM GESTO NÃO LEVA OUTRO ──────────────────
         No respiro, o gesto é do RESPIRO — a fotografia e o nome do momento
         sobem juntos, que é como se lê um anúncio. Um degrau próprio aqui
         somava-se ao dele (16 + 12 = 28 px) e a escada deixava de dizer o que
         diz. É a mesma armadilha que já custou os 32 px do total a pagar. */
      data-sobe={semDegrau ? undefined : "foto"}
      style={ordem === undefined ? undefined : { order: ordem }}
    >
      <button
        type="button"
        onClick={(e) => aoAmpliar(e.currentTarget)}
        disabled={!alvo || desistiu}
        data-lupa={chave}
        aria-label={`${textos.ampliar}: ${rotulo}`}
        /* `foto-adiavel` SÓ com a forma conhecida — a razão está escrita na
           classe, em `globals.css`: saltar o desenho de uma caixa cuja altura
           venha do conteúdo faz a página encolher por baixo do dedo. Com
           `aspectRatio` a altura é da CAIXA e não do conteúdo, e aí é seguro. */
        className={`group focus-visible:outline-moss relative block w-full cursor-zoom-in overflow-hidden rounded-sm bg-[color-mix(in_srgb,var(--color-moss)_12%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default${proporcao ? " foto-adiavel" : ""}`}
        style={
          proporcao || tecto
            ? {
                ...(proporcao ? { aspectRatio: proporcao } : {}),
                ...(tecto ? { maxHeight: tecto } : {}),
              }
            : undefined
        }
      >
        {/* O `lqip` é um `data:` de poucos bytes que já vem no HTML: a célula
            nunca é um rectângulo vazio, nem sequer no primeiro fotograma. */}
        {foto?.lqip && !desistiu && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.lqip}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-md"
          />
        )}
        <picture>
          {}
          <img
            key={alvo}
            src={alvo}
            {...(temSrcset
              ? {
                  /**
                   * ── DOIS TAMANHOS, E O NAVEGADOR ESCOLHE ─────────────────
                   *
                   * MEDIDO, e é a razão disto existir: a grelha pedia SEMPRE a
                   * miniatura de 400 px. Num iPhone a fotografia ocupa ~343
                   * pontos e o ecrã tem três pixéis por ponto — pede ~1030. Era
                   * uma imagem de 400 esticada duas vezes e meia, e via-se:
                   * «essas imagens parecem estar desfocadas».
                   *
                   * O original resolvia a nitidez e punha 120 MB numa página de
                   * 46 fotografias. A terceira medida (1200 px, ~200 KB) é a
                   * que serve as duas coisas — e quem escolhe é o navegador,
                   * que sabe a largura e a densidade do ecrã e nós não.
                   *
                   * O `src` fica: é o que um navegador sem `srcset` usa, e é
                   * para onde a cascata de falhas volta (aí o `srcset` sai).
                   */
                  srcSet: `${foto?.miniatura} 400w, ${media} 1200w`,
                  /* A largura que a fotografia OCUPA, por ecrã — a grelha é de
                     uma coluna no telemóvel e de duas a partir de `sm`. Sem
                     isto o navegador assume a largura toda da página e pede
                     sempre a maior. */
                  sizes: larguraNoEcra ?? "(min-width: 640px) 46vw, 92vw",
                }
              : {})}
            alt=""
            /* `loading="lazy"` em tudo menos nas primeiras: com 46 fotografias,
               carregá-las todas de uma vez é a conta que esta página existe
               para não fazer. As primeiras entram ansiosas porque estão à
               vista antes de qualquer rolar. */
            loading={ansiosa ? "eager" : "lazy"}
            decoding="async"
            onError={aoFalhar}
            /* `foto-deriva`: a fotografia move-se dentro da moldura enquanto
               PASSA, e não só quando chega. O porquê e o custo estão na regra,
               em `globals.css`. */
            className="foto-deriva relative block h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.02]"
          />
        </picture>
      </button>
    </figure>
  );
}

/**
 * A LUPA — uma fotografia a ocupar o ecrã.
 *
 * Teclado: Escape fecha, ← e → andam, e o Tab não sai daqui enquanto isto está
 * aberto (senão o cursor desaparecia para uma página que está tapada).
 * Gesto: arrastar para o lado anda; a distância mínima existe para um toque
 * trémulo não passar de fotografia sem querer.
 */
const DISTANCIA_DO_GESTO = 48;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONTA DO VOO — o que leva uma caixa exactamente a outra
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Escreve no elemento as três variáveis que os fotogramas da `lupa-nasce`
 * lêem, e devolve se conseguiu. Devolver `false` não é uma falha: é a decisão
 * de NÃO voar — e o que se vê então é a lupa a aparecer, como aparecia antes
 * disto existir. Nunca um salto.
 *
 * ── `max` E NÃO `min`, E A RAZÃO É O RECORTE ──────────────────────────────
 *
 * A miniatura da grelha é `object-cover`: está recortada. A escala que TAPA a
 * caixa dela é a que faz as duas imagens coincidirem — com `min` sobrava papel
 * à volta e via-se a fotografia a saltar de tamanho no primeiro fotograma.
 *
 * ── E PORQUE É QUE UMA MINIATURA FORA DO ECRÃ NÃO SERVE ───────────────────
 *
 * Porque as setas andam DENTRO do board sem a página rolar: ao fim de três
 * setas, a miniatura da fotografia aberta pode estar dois ecrãs abaixo. Uma
 * fotografia a nascer de um sítio que ninguém vê não se lê como «é aquela» —
 * lê-se como um erro.
 */
/** O que o regresso precisa de saber, medido no instante em que se fecha. */
type RegressoDaLupa = {
  /**
   * Os pixéis que estavam NO ECRÃ — nunca o melhor que existe. Se o original
   * ainda vem a caminho, o que se está a mostrar é a miniatura, e é ela que
   * tem de voar: mandar o original voar era começar o regresso com um pedido à
   * rede, ou seja um rectângulo vazio a encolher.
   */
  src: string;
  /** De onde parte (a caixa da fotografia aberta) e para onde vai. */
  noEcra: DOMRect;
  miniatura: DOMRect;
};

/** Quem pediu menos movimento não leva nenhum — nem uma fotografia a voar. */
function reduzMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function marcarVoo(el: HTMLElement, miniatura: DOMRect, noEcra: DOMRect): boolean {
  if (miniatura.width <= 0 || noEcra.width <= 0) return false;
  if (miniatura.bottom <= 0 || miniatura.top >= window.innerHeight) return false;
  const s = Math.max(miniatura.width / noEcra.width, miniatura.height / noEcra.height);
  el.style.setProperty(
    "--lupa-dx",
    `${miniatura.left + (miniatura.width - noEcra.width * s) / 2 - noEcra.left}px`,
  );
  el.style.setProperty(
    "--lupa-dy",
    `${miniatura.top + (miniatura.height - noEcra.height * s) / 2 - noEcra.top}px`,
  );
  el.style.setProperty("--lupa-s", `${s}`);
  return true;
}

function Lupa({
  foto,
  chaveDoAlvo,
  rotulo,
  temAnterior,
  temSeguinte,
  textos,
  aoFechar,
  aoAndar,
}: {
  foto?: FotoDaProposta;
  /**
   * O nome da fotografia ABERTA na página — não o da que abriu a lupa. Depois
   * de duas setas, nascer da primeira miniatura era nascer do sítio errado.
   */
  chaveDoAlvo: string;
  rotulo: string;
  temAnterior: boolean;
  temSeguinte: boolean;
  textos: TextosDaPagina;
  aoFechar: (voo: RegressoDaLupa | null) => void;
  aoAndar: (delta: number) => void;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [carregou, setCarregou] = useState(false);
  /**
   * A MOLDURA — a caixa com a forma da fotografia.
   *
   * Existe por uma razão que é toda da quinta com 4G: numa rede má o original
   * chega segundos depois de a lupa abrir. Se o que crescesse fosse o `<img>`,
   * ele mediria zero por zero no fotograma da abertura e a coreografia tocava
   * para uma sala vazia — ou, pior, começava tarde e a fotografia dava um
   * salto de tamanho a meio.
   *
   * Com o `aspect-ratio` declarado, a caixa é a do `object-contain` desde o
   * primeiro fotograma, e as duas imagens (o borrão e o original) ocupam-na
   * inteira — portanto estão sempre registadas uma sobre a outra.
   */
  const moldura = useRef<HTMLDivElement>(null);
  /**
   * Sem medida guardada não há moldura, e sem moldura não há voo.
   *
   * As fotografias anteriores às colunas de dimensão não têm forma conhecida.
   * A GRELHA reserva-lhes três por dois e recorta; aqui isso não serve — a
   * lupa é `object-contain`, e a caixa de uma forma inventada é a caixa
   * errada: a fotografia cresceria para um sítio e saltaria para outro quando
   * chegasse. Nessas, a lupa faz o que sempre fez.
   */
  const forma = foto?.largura && foto?.altura ? `${foto.largura} / ${foto.altura}` : null;

  // AQUI o original é a primeira escolha e a miniatura é o plano B: é o único
  // sítio da página em que os pixéis todos valem os bytes.
  const { alvo, desistiu, aoFalhar, tentarDeNovo } = useFotoComPlanoB(
    foto?.original ?? foto?.miniatura,
    foto?.miniatura,
  );

  // Recomeçar a cada alvo novo, DURANTE o desenho — o padrão da casa (ver
  // `PhotoLightbox`): assim não há um fotograma com a opacidade da fotografia
  // anterior por cima de uma imagem que ainda não pediu nada.
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvoVisto !== alvo) {
    setAlvoVisto(alvo);
    setCarregou(false);
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        sair();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        aoAndar(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        aoAndar(-1);
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = dialogo.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, aoAndar]);

  useEffect(() => {
    botaoFechar.current?.focus();
  }, []);

  /**
   * ── O VOO DE ENTRADA — MEDIDO PRIMEIRO, POSTO DEPOIS ────────────────────
   *
   * A classe NÃO vai no JSX, e a diferença importa. Posta no desenho, a
   * animação arrancava com as variáveis por omissão e via-as mudar a meio —
   * um salto. Posta aqui, o browser vê as três variáveis e a classe na mesma
   * volta, antes de pintar seja o que for.
   *
   * `useLayoutEffect` e não `useEffect`: as duas caixas têm de ser medidas na
   * MESMA volta de layout em que a lupa monta, e antes da pintura. Com
   * `useEffect` já havia um fotograma pintado com a fotografia no sítio final,
   * e o voo começava do fim.
   *
   * E é a regra da casa por outra porta: se isto não correr — um erro, uma
   * miniatura que já saiu do ecrã, um browser sem `matchMedia` — não se
   * acrescenta classe nenhuma e a lupa está lá, no sítio, inteira. O estado
   * escondido continua a não existir sem JavaScript.
   *
   * Só à MONTAGEM: as setas mudam a fotografia sem remontar a lupa, e uma
   * fotografia a nascer da miniatura a cada seta seria uma discoteca.
   */
  useLayoutEffect(() => {
    const caixa = moldura.current;
    const daGrelha = document.querySelector<HTMLElement>(`[data-lupa="${chaveDoAlvo}"]`);
    if (!caixa || !daGrelha) return;
    if (!marcarVoo(caixa, daGrelha.getBoundingClientRect(), caixa.getBoundingClientRect())) return;
    caixa.classList.add("lupa-nasce");
    // A chave não muda enquanto esta lupa vive, e o voo é o da ABERTURA.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ── O REGRESSO, MEDIDO NO INSTANTE EM QUE SE FECHA ──────────────────────
   *
   * Medir AQUI e não no elemento que voa: no fotograma seguinte a lupa já não
   * existe, e a caixa da fotografia grande — de onde o voo parte — já não é
   * mensurável.
   *
   * E o que voa é o que está NO ECRÃ: se o original ainda vem a caminho, o que
   * o casal está a ver é a miniatura, e é ela que tem de voltar. Mandar o
   * original voar era começar o regresso com um pedido à rede.
   */
  const sair = useCallback(() => {
    const caixa = moldura.current;
    const daGrelha = document.querySelector<HTMLElement>(`[data-lupa="${chaveDoAlvo}"]`);
    const src = carregou ? alvo : (foto?.miniatura ?? alvo);
    if (!caixa || !daGrelha || !src || reduzMovimento()) return aoFechar(null);
    const noEcra = caixa.getBoundingClientRect();
    if (noEcra.width <= 0) return aoFechar(null);
    aoFechar({ src, noEcra, miniatura: daGrelha.getBoundingClientRect() });
  }, [aoFechar, chaveDoAlvo, carregou, alvo, foto?.miniatura]);

  // Enquanto a lupa está aberta, a página por baixo não rola.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A LUPA TEM DE SAIR DA SECÇÃO — SENÃO NÃO TAPA O ECRÃ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um elemento `position: fixed` é medido pelo ECRÃ — excepto se algum
   * antepassado tiver um `transform`, e aí passa a ser medido por esse
   * antepassado. É a regra do «bloco de contenção», e apanhou-nos aqui.
   *
   * A secção da Inspiração leva `data-sobe`, e o guião do movimento arma-a
   * com um `transform` enquanto ela espera a sua vez (`globals.css`).
   *
   * (Esta nota dizia `prop-chega`, a animação de scroll que aqui esteve. Ela
   * saiu por somar degraus e por não assentar — e o perigo passou de
   * permanente a passageiro, não desapareceu. Medido: com o bloco armado, um
   * `fixed` lá dentro mede 1028 px num ecrã de 780; largado, volta aos 780.
   * Um perigo que dura o tempo de alguém tocar numa fotografia é um perigo.)
   *
   * ── E A CAUSA NÃO É O PREENCHIMENTO, AO CONTRÁRIO DO QUE AQUI ESTAVA ─────
   *
   * Esta nota dizia que a culpa era do `animation-fill-mode: both`, que deixa
   * um `translateY(0)` calculado no fim. É verdade que o deixa — mas NÃO é
   * essa a causa, e a diferença importa para quem vier corrigir isto.
   *
   * MEDIDO num Chromium a 390×780, sete variantes com uma lupa `fixed` dentro:
   *
   *   both                      transform calculado: matrix(1,0,0,1,0,0)  presa
   *   backwards                 transform calculado: none                 PRESA
   *   fill: none                transform calculado: none                 PRESA
   *   só a linha de tempo       transform calculado: none                 livre
   *   both, mas anima opacity   transform calculado: none                 livre
   *   nada                      transform calculado: none                 livre
   *
   * Repare-se nas linhas 2 e 3: com o `transform` calculado a dizer `none`, a
   * lupa CONTINUA presa. E na linha 5: a animar a opacidade, com o mesmo
   * `both`, fica livre.
   *
   * A regra verdadeira é esta: BASTA A ANIMAÇÃO TOCAR EM `transform` para o
   * elemento ser bloco de contenção dos `position: fixed` lá dentro — seja
   * qual for o preenchimento e seja qual for o valor calculado.
   *
   * Ou seja: trocar `both` por `backwards` seria um placebo. Não há maneira de
   * a secção deixar de conter a lupa sem lhe tirar a animação — que é
   * precisamente o que ela quer lá. O portal não é o remédio conveniente: é o
   * único.
   *
   * MEDIDO num Chromium a 390×780, com a mesma regra de CSS: com uma
   * fotografia à vista e o dedo em cima dela, o diálogo ia de 270 a 3202 px
   * num ecrã de 0 a 780 — ou seja, do tamanho da SECÇÃO. Não tapava o ecrã.
   * Um casal que carregasse numa fotografia via meio ecrã preto e a fotografia
   * fora dele.
   *
   * O portal resolve-o pela raiz, e não por remendo: a lupa passa a ser filha
   * do `<body>`, onde não há antepassado nenhum com `transform`. É o que a
   * galeria pública desta casa já faz (`GaleriaClient.tsx`), e a partir de hoje
   * qualquer animação nova numa secção da proposta é inofensiva para ela.
   *
   * O React mantém o contexto e a subida dos eventos através de um portal —
   * o foco, o Escape e o gesto lateral continuam a funcionar como antes.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogo}
      role="dialog"
      aria-modal="true"
      aria-label={rotulo}
      /* O fundo saiu daqui e passou a ser um filho: é ele que se esbate, e o
         diálogo fica SEM animação nenhuma. Uma animação de `transform` no
         diálogo faria dele bloco de contenção de tudo o que lá vier a estar —
         é a armadilha que já custou uma lupa que não tapava o ecrã. E uma de
         `opacity` esbateria a fotografia junto com o fundo, que é o contrário
         do que se quer: o mundo escurece, a fotografia cresce. */
      className="fixed inset-0 z-50 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) sair();
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        toque.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const inicio = toque.current;
        toque.current = null;
        const t = e.changedTouches[0];
        if (!inicio || !t) return;
        const dx = t.clientX - inicio.x;
        const dy = t.clientY - inicio.y;
        // Horizontal a sério: um dedo a rolar a página não pode mudar de foto.
        if (Math.abs(dx) < DISTANCIA_DO_GESTO || Math.abs(dx) <= Math.abs(dy)) return;
        aoAndar(dx < 0 ? 1 : -1);
      }}
    >
      {/* O véu. `pointer-events-none` para o toque continuar a chegar ao
          diálogo, que é quem fecha ao toque fora da fotografia. */}
      <div aria-hidden className="lupa-veu pointer-events-none absolute inset-0 bg-black/94" />

      <div className="lupa-pecas relative flex items-center gap-3 px-4 py-3">
        <span className="text-xs tabular-nums text-white/70">{rotulo}</span>
        <button
          ref={botaoFechar}
          type="button"
          onClick={sair}
          aria-label={textos.fechar}
          className="alvo-toque ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          ×
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) sair();
        }}
      >
        {temAnterior && (
          <button
            type="button"
            onClick={() => aoAndar(-1)}
            aria-label={textos.anterior}
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ‹
          </button>
        )}

        {desistiu || !alvo ? (
          <div className="max-w-xs text-center">
            <p className="text-sm leading-relaxed text-white/80">{textos.fotoFalhou}</p>
            <button
              type="button"
              onClick={tentarDeNovo}
              className="alvo-toque mt-4 inline-flex items-center justify-center rounded-md border border-white/30 px-5 py-2.5 text-xs tracking-[0.16em] text-white uppercase hover:bg-white/10"
            >
              {textos.tentarDeNovo}
            </button>
          </div>
        ) : (
          /*
           * ── A MOLDURA ─────────────────────────────────────────────────
           *
           * A caixa que cresce. Tem a FORMA da fotografia, portanto é do
           * tamanho exacto a que o `object-contain` a vai desenhar — antes de
           * o original ter chegado. As duas imagens são filhas dela e ocupam-na
           * inteira, logo o borrão e a fotografia final estão sempre registados
           * um sobre o outro: não há troca de tamanho quando o grande chega.
           *
           * Sem forma conhecida não há moldura — e o `contents` faz-a
           * desaparecer da disposição, devolvendo as duas imagens ao que eram.
           */
          <div
            ref={moldura}
            className={`relative m-auto h-auto max-h-full w-full max-w-full${forma ? "" : " contents"}`}
            style={forma ? { aspectRatio: forma } : undefined}
          >
            {/* A miniatura por baixo enquanto o original não chega — há sempre
                fotografia no ecrã, em vez de um rectângulo preto. E é ela que
                CRESCE numa ligação lenta: é a única que existe no fotograma da
                abertura, e está na cache, porque é a mesma que está na grelha
                (ver `cache-das-fotos.ts`, um ano de validade). */}
            {!carregou && !desistiu && foto?.miniatura && alvo !== foto.miniatura && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto.miniatura}
                alt=""
                aria-hidden
                className={
                  forma
                    ? "absolute inset-0 h-full w-full object-contain blur-sm"
                    : "absolute max-h-full max-w-full object-contain blur-sm"
                }
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={alvo}
              src={alvo}
              alt=""
              onLoad={() => setCarregou(true)}
              onError={aoFalhar}
              className={`object-contain motion-safe:transition-opacity ${
                forma ? "absolute inset-0 h-full w-full" : "max-h-full max-w-full"
              } ${carregou ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        )}

        {temSeguinte && (
          <button
            type="button"
            onClick={() => aoAndar(1)}
            aria-label={textos.seguinte}
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ›
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGRESSO — a fotografia volta à miniatura DEPOIS de a lupa já ter ido
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Não é um diálogo a fechar-se devagar: é uma fotografia sem papel nenhum na
 * árvore de acessibilidade, sem foco, sem eventos. Existe por uma razão
 * exacta — nenhuma animação atrasa uma tarefa, e fechar é uma tarefa. Se a
 * saída vivesse dentro da lupa, o diálogo teria de ficar montado mais 240 ms
 * depois do gesto, e com ele o foco preso e a página que não rola. Os 42 casos
 * que guardam a lupa passariam a esperar por um relógio.
 *
 * ── O QUE O PODE DEIXAR PENDURADO, E O QUE O TIRA ─────────────────────────
 *
 * O `animationend` é o caminho normal. Só que ele não vem se a animação nunca
 * começar — um separador em segundo plano, uma folha de estilos que não
 * chegou. Um véu preto pendurado por cima do documento é o pior defeito que
 * isto podia ter, por isso há um relógio a tirá-lo de qualquer maneira.
 *
 * Com movimento reduzido nem chega a ser montado: quem decide isso é o `sair`,
 * na lupa, antes de o mandar nascer.
 *
 * ── E A PÁGINA VOLTA A ROLAR ENQUANTO ELE VOA ─────────────────────────────
 *
 * De propósito: o corpo é destrancado no instante do gesto. Se o casal rolar
 * durante os 240 ms, o destino fica para trás — e é o preço certo. Prender a
 * página até a decoração acabar seria exactamente atrasar a tarefa.
 */
function Regresso({ voo, aoAcabar }: { voo: RegressoDaLupa; aoAcabar: () => void }) {
  const aVoar = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const el = aVoar.current;
    if (el) marcarVoo(el, voo.miniatura, voo.noEcra);
  }, [voo]);

  useEffect(() => {
    const relogio = window.setTimeout(aoAcabar, 900);
    return () => window.clearTimeout(relogio);
  }, [aoAcabar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    /* Filho do `<body>`, pela mesma razão que a lupa: aqui não há antepassado
       nenhum com `transform`, e um `fixed` medido por uma secção media
       milhares de pixéis num ecrã de oitocentos. */
    <div aria-hidden data-regresso className="pointer-events-none fixed inset-0 z-50">
      <div className="lupa-veu-sai absolute inset-0 bg-black/94" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={aVoar}
        src={voo.src}
        alt=""
        onAnimationEnd={aoAcabar}
        className="lupa-volta absolute block object-contain"
        /* Números e não cadeias: o React escreve os `px`. Uma cadeia como
           «366px» neste ficheiro tem a forma de uma fatia de `sizes` e é
           apanhada pelo `portao-do-avif.test.ts` — que já apagou uma escada
           inteira uma vez. */
        style={{
          left: voo.noEcra.left,
          top: voo.noEcra.top,
          width: voo.noEcra.width,
          height: voo.noEcra.height,
        }}
      />
    </div>,
    document.body,
  );
}
