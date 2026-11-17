"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relatarFalhaDeImagem } from "../../relatar-falha";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import type { EstadoDosUrls } from "../tipos";
import { CelulaSemFotografia } from "./CelulaSemFotografia";
import { EsqueletoPorCima } from "./EsqueletoPorCima";
import { useRecusaDaPolitica } from "./recusa-da-politica";
import { useSrcSemPiscar } from "./useSrcSemPiscar";
import { useVezNaFila } from "./useVezNaFila";

export function Thumb({
  url,
  planoB,
  onRemove,
  className = "",
  aspeto,
  onMedida,
  foraDoPdf = false,
  pendente = false,
  semRemover = false,
  onde = "estúdio",
  estadoDosUrls = "pronto",
  aoTentarDeNovo,
  aoMorrer,
  priority = false,
  // `refDoc` e não `ref`: o React trata `ref` como prop especial, e uma string
  // ali dentro é o padrão antigo das string refs, que ele recusa.
  refDoc,
  posicao,
}: {
  /** O `object-position` da imagem — o enquadramento da capa (`focoDaCapa`). */
  posicao?: string;
  url?: string;
  /**
   * PARA ONDE CAIR, do mais leve para o mais pesado.
   *
   * Uma cadeia é o caso antigo («cai para o original»). Uma lista é a cascata
   * inteira — nas grelhas do estúdio, `[derivada de 1200 px, original]`. Ver
   * `assetMedias`: entre a miniatura de 20 KB e o original de 1099 KB não havia
   * nada, e a queda custava cinquenta e cinco vezes o peso para desenhar a
   * mesma caixa de ~100 px.
   */
  planoB?: string | readonly (string | undefined)[];
  /** Em que pé está a leitura dos URL — ver `estadoDosUrls` no estúdio. */
  estadoDosUrls?: EstadoDosUrls;
  /** Ir buscar os URL outra vez, a pedido dela. */
  aoTentarDeNovo?: () => void;
  /**
   * Este URL não abre — dito ao estúdio, para a hidratação seguinte deixar de
   * o preferir ao fresco. Ver `urlsMortos`.
   */
  aoMorrer?: (url: string) => void;
  /** Está na primeira dobra: não espera pela fila nem pelo `lazy`. */
  priority?: boolean;
  onRemove: () => void;
  className?: string;
  /**
   * O ASPECTO DA CAIXA QUE ESTA FOTO VAI OCUPAR NO PDF.
   *
   * A célula pré-visualizava as capas em 4:3 e as fotos dos mood boards em
   * quadrado — e o documento não desenha NENHUMA foto em 4:3 nem NENHUMA em
   * quadrado. As capas são tiras altas (≈ 0,47:1, quase 1:2) e as células do
   * collage mudam de forma consoante o número de fotos do board.
   *
   * O resultado era ela escolher uma foto pelo que via e o cliente receber
   * outra coisa: a MESMA fotografia, cortada noutro sítio. Com uma tira de capa
   * tão estreita, os dois recortes podem não ter nada em comum — é a definição
   * de «desconfigurada», e não havia como descobri-lo sem gerar o PDF.
   *
   * Vem de `proposal-geometria`, a mesma função que o desenho usa. Em falta,
   * mantém-se o que o `className` disser.
   */
  aspeto?: number;
  /**
   * A FORMA REAL DESTA FOTOGRAFIA, dita assim que a célula consegue medi-la.
   *
   * A imagem que está aqui já foi descodificada pelo navegador — tem
   * `naturalWidth`/`naturalHeight` e não custa mais nada perguntar. É daqui que
   * o selector de disposição tira os aspectos com que desenha os diagramas (ver
   * `aspetosDasFotos`), em vez de haver um pedido novo por foto só para saber a
   * forma. Quando o URL é o da miniatura serve na mesma: a miniatura é gerada
   * dentro de uma caixa, conservando as proporções (ver `image-prep`).
   */
  onMedida?: (aspeto: number) => void;
  /** Esta foto está no rascunho mas a página do PDF já não a desenha. */
  foraDoPdf?: boolean;
  /** A foto já ocupa este lugar mas a cópia ainda não confirmou. */
  pendente?: boolean;
  /** Onde está esta célula, para os registos do servidor dizerem qual falhou. */
  onde?: string;
  /** O caminho no documento — o que se procura no Storage quando isto falha. */
  refDoc?: string;
  /**
   * Não desenhar o × desta célula.
   *
   * Nas grelhas dos mood boards a remoção passou para a barra de acções, que é
   * visível ao toque; o × da miniatura só aparecia em hover, e num telemóvel um
   * botão que só aparece em hover é um botão que não existe. As capas continuam
   * com ele — ali há duas células e nenhuma barra.
   */
  semRemover?: boolean;
}) {
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

  return (
    <div
      // `aria-busy` e não só a opacidade: quem não vê a célula esbatida tem de
      // saber na mesma que esta foto ainda está a entrar (a pastilha «X a
      // caminho» diz o total, isto diz QUAL).
      //
      // SÓ o `pendente`, e é deliberado: aqui `aria-busy` quer dizer «esta foto
      // ainda não está na proposta», que é um estado do NEGÓCIO. Juntar-lhe «os
      // bytes ainda vêm a caminho» dava o mesmo sinal a duas coisas com
      // consequências opostas — uma impede o envio, a outra passa sozinha — e
      // os testes que lêem este atributo para contar fotos por confirmar
      // passariam a contar fotos que já lá estão. Quem diz que a fotografia vem
      // a caminho é o esqueleto, que é visível e não precisa de ser lido.
      aria-busy={pendente || undefined}
      // A PEGA DOS TESTES. Uma célula de foto identificava-se pelo seu «×» —
      // e o × saiu daqui para a barra de acções, que é visível ao toque. Um
      // atributo próprio diz o que a célula É, em vez de a fazer depender de
      // que botões calha ter naquele sítio.
      data-foto=""
      // `self-start` com o aspecto: dentro de uma grelha, sem isto a célula
      // esticava-se à altura da linha e o `aspect-ratio` era ignorado — que é
      // exactamente o contrário do que se quer aqui.
      style={aspeto ? { aspectRatio: String(aspeto) } : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] motion-safe:transition-opacity motion-safe:duration-500 ${
        foraDoPdf ? "border-[var(--bo-perigo)]/60 opacity-60" : "border-[var(--bo-hairline-strong)]"
      } ${pendente ? "opacity-45" : ""} ${aspeto ? "self-start" : ""} ${className}`}
    >
      {desenhaImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A forma desta fotografia sai desta imagem, que já cá está e já foi
          // descodificada — ver `onMedida`.
          ref={medir}
          onLoad={(e) => {
            largarAVez();
            setPintada(true);
            medir(e.currentTarget);
          }}
          // As PESADAS são geridas pela fila; pô-las também em `lazy` fazia uma
          // célula fora do ecrã ficar com a vez sem chegar a pedir nada. As
          // leves (a miniatura, ~20 KB) continuam em `lazy`, que é o que impede
          // as fotos dos boards lá de baixo de disputarem o canal com as que
          // estão à vista. E a primeira dobra não espera por nenhum dos dois.
          loading={pesada || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="h-full w-full object-cover"
          style={posicao ? { objectPosition: posicao } : undefined}
          draggable={false}
          onError={(e) => {
            largarAVez();
            aoFalhar();
            void e;
          }}
        />
      ) : (
        <CelulaSemFotografia
          semRemedio={semRemedio}
          recusadaPeloSitio={recusadaPeloSitio}
          semUrlEFalhou={semUrlEFalhou}
          ultimoAlvo={ultimoAlvo}
          estadoDosUrls={estadoDosUrls}
          aoTentarDeNovo={aoTentarDeNovo}
          tentarDeNovo={tentarDeNovo}
        />
      )}
      {/* ── ENQUANTO A FOTOGRAFIA VEM ─────────────────────────────────────
          Por CIMA e em posição absoluta, e não no fluxo: pôr o esqueleto no
          lugar da imagem obrigava a célula a mudar de conteúdo no instante em
          que a foto chega, e o `src` está posto muito antes de os bytes
          chegarem — a caixa ficava cinzenta e calada durante os 34 s medidos.
          Assim há sempre alguma coisa a dizer «isto está a acontecer». */}
      <EsqueletoPorCima aCarregar={aCarregar} comPega />
      {/* Sobreposta, nunca no fluxo: a célula tem de ter exatamente o mesmo
          tamanho antes e depois de a foto assentar. */}
      {pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          a entrar…
        </span>
      )}
      {foraDoPdf && !pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-[var(--bo-perigo)]/85 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          fora do PDF
        </span>
      )}
      {!semRemover && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover imagem"
          /**
           * ── INVISÍVEL E TOCÁVEL AO MESMO TEMPO ────────────────────────
           *
           * Isto era `opacity-0 group-hover:opacity-100`. Num ecrã táctil não
           * há hover nenhum, portanto o botão NUNCA se via — e `opacity: 0`
           * não desliga o toque: um dedo no canto da miniatura apagava a
           * fotografia sem que nada tivesse aparecido primeiro. É o único
           * botão destrutivo do back office assim, e no telemóvel o engano nem
           * se desfaz (o Cmd+Z do estúdio não existe lá).
           *
           * O par é o da casa (`globals.css:98`), e é o mesmo que o
           * `ServicesEditor` e os `Fornecedores` já usam: à vista no dedo,
           * escondido até ao hover só onde HÁ rato.
           *
           * 20 px é menos de metade do mínimo de toque, e o `alvo-toque` (44
           * px) não serve aqui: a miniatura tem pouco mais de 100 px de largo
           * e um alvo de 44 px no canto engolia um terço dela — num botão que
           * APAGA, um alvo grande de mais é tão mau como um pequeno de mais.
           * 32 px no dedo é o meio-termo, e é o que cabe.
           */
          className={`absolute top-1 right-1 flex h-5 w-5 pointer-coarse:h-8 pointer-coarse:w-8 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 ${ESTADO} ${PRESSAO}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
