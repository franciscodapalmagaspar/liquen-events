"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeCopyMode, ThemeImage, ThemeSummary } from "@/lib/theme-types";
import PhotoLightbox from "./PhotoLightbox";
import ThemeCopyDialog, { type ThemeCopyOutcome } from "./ThemeCopyDialog";
import FundirTemas, { type ThemeMergeOutcome } from "./FundirTemas";
import { avisoDeTemaParecido, temasParecidos } from "@/lib/temas-parecidos";
import { downloadMany, downloadName } from "./photo-download";
import { guardarBlob, useDescarga } from "./ui/descarregar";
import {
  CHECK_CHUNK,
  MAX_PHOTO_ORDER,
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  THEME_COPY_CHUNK,
  THEME_PAGE_SIZE,
  normalizedThemeName,
  type SkipReason,
  type ThemeDuplicate,
} from "@/lib/theme-types";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import { textoDaRecusa, tituloDaRecusa } from "@/lib/erro-do-servidor";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar, useDepoisDeApagarVarios } from "./ui/depois-de-apagar";
import { prepareImageWithThumb } from "./image-prep";
import {
  Button,
  Card,
  EmCurso,
  EmptyState,
  Field,
  MenuDeAccoes,
  emGrupos,
  PerguntaDestrutiva,
  Toolbar,
  type AccaoDeItem,
  Escolha,
  EsqueletoDeCor,
  Glass,
} from "./ui";
import { esquecerBiblioteca } from "./theme-picker-cache";
import BibliotecaRevisao from "./BibliotecaRevisao";
import ImagemComPlanoB from "./ImagemComPlanoB";
import { capaDaFoto, comCapa, type CapaDoCartao } from "./capa-do-cartao";
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";
import { useSaidaDeUmSo } from "./ui/saida";
import { adiantarTema, paginaDaResposta, usarAdiantada } from "./prefetch-de-tema";
import { SugestaoDeNome } from "./SugestaoDeNome";
import { NomesPorArrumar } from "./NomesPorArrumar";
import { MenuDeContexto, type PedidoDeMenu } from "./MenuDeContexto";
import {
  AMBITOS,
  ambitosDisponiveis,
  filtrarPorAmbito,
  type Ambito,
  type DadosDeUso,
} from "@/lib/temas-filtros";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import { porqueNaoLeu, porqueNaoLeuDoErro, type LeituraFalhada } from "@/lib/porque-nao-leu";
import ListaDeTemas from "./ListaDeTemas";
import { fotoPelaTecla } from "@/lib/temas-grelha";
import {
  escreverCarga,
  fotosQueViajam,
  fraseDeMovimentoFalhado,
  fraseDoMovimento,
  fraseDoRegresso,
  type CargaDeFotos,
} from "@/lib/temas-arrasto";

/**
 * Biblioteca de Temas — o sítio onde o estúdio guarda, uma vez, as fotos de
 * inspiração que usa em quase todos os casamentos ("Itália", "Terracotta",
 * "Branco & Verde"…).
 *
 * Depois, ao montar uma proposta, o estúdio abre "Da biblioteca" no mood board,
 * escolhe o tema e as fotos entram na proposta — sem ir ao Pinterest nem
 * procurar pastas no computador.
 *
 * Ecrã em dois níveis: a lista de temas (cartões com capa + nº de fotos) e,
 * ao abrir um, a pasta desse tema com carregamento e remoção de fotos.
 *
 * ESTE ECRÃ É DIMENSIONADO PARA MILHARES DE FOTOS. As três regras que o mantêm
 * utilizável com 8 temas e 4000 fotos:
 *
 *  1. A grelha mostra MINIATURAS (~400 px, ~40 KB), nunca os originais de
 *     3000 px — e nunca mais do que uma página de cada vez.
 *  2. Só se pede ao servidor a página que está à vista: assinar URLs é o passo
 *     caro, e assinar 4000 para mostrar 60 era o que fazia um tema demorar.
 *  3. Nada acontece em silêncio: há sempre uma contagem verdadeira à vista
 *     ("47 de 312"), e o que falha fica no ecrã com forma de voltar a tentar.
 */

/**
 * Quantos carregamentos em voo ao mesmo tempo.
 *
 * Quatro, e não mais: cada pedido leva um JPEG de ~3 MB, por isso o gargalo é
 * o canal de SUBIDA (uma ligação doméstica sobe ~10–20 Mbit/s). Mais ligações
 * não somam largura de banda — repartem a mesma —, e cada uma paga o seu pico
 * de memória (a bitmap descodificada + os canvas). Quatro, e não menos:
 * preparar a foto seguinte (descodificar + redimensionar + codificar) é
 * trabalho de CPU no fio principal, e é durante essa preparação que as outras
 * três mantêm o canal cheio. O browser abre ~6 ligações por servidor em
 * HTTP/1.1; deixar duas de fora mantém a grelha e as miniaturas a responder
 * enquanto um lote de 300 fotos sobe.
 */
const UPLOAD_CONCURRENCY = 4;

/** Remoções em voo ao mesmo tempo (pedidos vazios: mais folga do que a subida). */
const DELETE_CONCURRENCY = 6;

/**
 * Quantos ficheiros são lidos ao mesmo tempo para lhes calcular a impressão
 * digital.
 *
 * O `crypto.subtle.digest` não bloqueia o fio principal (o browser resolve-o
 * fora dele) e é barato ao lado do resto — MEDIDO em Chromium nesta caixa:
 * 42,9 ms numa foto de 8,1 MB (181 MB/s), contra 337 ms para PREPARAR a mesma
 * foto. O que aqui se limita não é o CPU, é a MEMÓRIA: cada ficheiro tem de
 * estar inteiro em `ArrayBuffer` para ser resumido, e um arrasto de 300 fotos
 * de 8 MB lidas de uma vez seriam 2,4 GB. Quatro em voo são ~32 MB de pico — o
 * mesmo teto de quatro que os carregamentos já usam, pela mesma razão.
 */
const FINGERPRINT_CONCURRENCY = 4;

/** Quantas fotos saltadas mostram miniatura no relatório. As restantes
 *  aparecem só pelo nome: desenhar 150 pré-visualizações de fotos que NÃO
 *  foram adicionadas custaria mais do que a informação vale. */
const SKIPPED_PREVIEWS = 12;

/**
 * QUANTOS ORIGINAIS A GRELHA DESCARREGA AO MESMO TEMPO — o número que decide
 * se a primeira foto aparece a 1 segundo ou aos 26.
 *
 * Isto só se aplica às fotos SEM miniatura (a biblioteca anterior às
 * miniaturas). Uma célula dessas puxa o original: ~2,6 MB para desenhar 150 px.
 *
 * Medido em Chromium, HTTP/2 (é o que o Storage fala), 60 fotos, 50 Mbit/s
 * partilhados, TTFB de 60 ms — mediana de 2 corridas:
 *
 *   como estava (60 pedidos ao mesmo tempo) → 1ª foto aos 26 351 ms
 *   tecto de 6 em voo                       → 1ª foto aos  2 634 ms
 *   tecto de 3 em voo                       → 1ª foto aos  1 405 ms
 *   tecto de 2 em voo                       → 1ª foto aos    928 ms
 *
 * A última foto chega ao mesmo tempo em todos (~26 s): o canal está cheio de
 * qualquer maneira. O que muda é a ORDEM — sem tecto, os 60 downloads
 * repartem o canal e acabam todos no fim, ou seja, a foto que está no ecrã
 * espera pelas 59 que não estão.
 *
 * Três e não dois: a mesma medição a 300 Mbit/s (fibra) mostra que um tecto de
 * 2 deixa de encher o canal — a última foto passa de 5316 ms (como estava)
 * para 5389 ms, enquanto com 3 fica em 4936 ms. Com 3, a primeira foto aparece
 * aos 297 ms a 300 Mbit/s e aos 1405 ms a 50 Mbit/s, e a última NUNCA chega
 * depois do que chegava.
 *
 * As fotos COM miniatura não passam por aqui: são ~25 KB e medir mostrou que
 * pôr-lhes um tecto PIORA (60 × 25 KB em ondas de 6 = 1019 ms contra 350 ms
 * sem tecto). O que é caro é o byte, não o pedido.
 */
const HEAVY_IMAGE_CONCURRENCY = 3;

/** Quantas células entram na primeira dobra — carregam já, e com prioridade.
 *  Doze cobre duas linhas em ecrã largo (a grelha faz 6 colunas). */
const ABOVE_FOLD = 12;

/** Teto de ficheiros aceites de uma pasta largada — trava um engano
 *  ("larguei a pasta Fotos toda") antes de ele encher a memória do browser. */
const MAX_DROP_FILES = 5000;

/** Teto de entradas percorridas ao expandir pastas largadas (anel de segurança
 *  contra árvores patológicas / atalhos circulares). */
const MAX_DROP_ENTRIES = 20_000;

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const FolderIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      strokeLinejoin="round"
    />
    <circle cx="9.5" cy="12.5" r="1.5" />
    <path d="m6 17 3.5-3 3 2.5L16 13l3 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── OS ÍCONES DO MENU DO TEMA ───────────────────────────────────────────
   «Dentro de um grupo, ou todos têm ícone ou nenhum tem» (Parte 9.7). O menu
   já os tinha todos; os quatro itens novos da Fase 2 vêm no mesmo traço
   (15 px, 1,7) para os grupos não ficarem mistos. */
const svgDoMenu = (filhos: React.ReactNode) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {filhos}
  </svg>
);
const ICONE_ABRIR = svgDoMenu(
  <>
    <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3" />
    <path d="M13 19h7m0 0-3-3m3 3-3 3" />
    <path d="M20 14v-1M4 6v10a2 2 0 0 0 2 2h4" />
  </>,
);
/** Uma fotografia com um «+». */
const ICONE_ADICIONAR = svgDoMenu(
  <>
    <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="m4 16 4.5-4 3.5 3 2.5-2 5.5 4.5" />
    <path d="M19 2v6M16 5h6" />
  </>,
);
/** Um lápis. */
const ICONE_RENOMEAR = svgDoMenu(
  <>
    <path d="M14.5 5.5 18.5 9.5" />
    <path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19 4 20Z" />
  </>,
);
/** Uma fotografia com a estrela da capa. */
const ICONE_CAPA = svgDoMenu(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="m12 8.6 1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3Z" />
  </>,
);

/**
 * O que a pergunta de eliminar um tema diz, com os números.
 *
 * As FOTOGRAFIAS: a contagem pode ser desconhecida (pasta ilegível —
 * `imageCount === null`), um mínimo (`truncated`, «500+») ou zero (a pasta
 * está vazia), e as três versões têm de fazer sentido.
 *
 * As PROPOSTAS: `propostas` é o número que o cartão mostra (`usos`, sem os
 * rascunhos). Com zero não há nada a dizer; sem número (a contagem ainda não
 * chegou, ou falhou) fica a frase de antes, que continua verdadeira: ao
 * eliminar, o servidor copia para cada proposta as fotos que ela usa
 * (`theme-materializar.ts`), e é por isso que elas não mudam.
 */
export function fraseDeEliminar(
  t: Pick<ThemeSummary, "imageCount" | "truncated">,
  propostas: number | null,
): { fotos: string; propostas: string | null } {
  const n = t.imageCount;
  const fotos =
    t.imageCount === null
      ? "As fotografias que estiverem lá dentro vão com ele."
      : n === 0
        ? "A pasta está vazia: não leva nenhuma fotografia."
        : n === 1 && !t.truncated
          ? "Leva 1 fotografia com ele."
          : `Leva ${n}${t.truncated ? "+" : ""} fotografias com ele.`;
  const frasePropostas =
    propostas === null
      ? "As propostas já feitas com estas fotos não são afectadas."
      : propostas === 0
        ? null
        : propostas === 1
          ? "Está em 1 proposta — essa guarda as fotos que usa e não muda."
          : `Está em ${propostas} propostas — essas guardam as fotos que usam e não mudam.`;
  return { fotos, propostas: frasePropostas };
}

/** A tecla que pede o menu de contexto: a tecla de menu, ou Shift+F10. */
function teclaDeMenu(e: React.KeyboardEvent): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}

/** Um pedido do menu do tema que só a PASTA sabe servir — ver `pedirAPasta`. */
interface PedidoAPasta {
  temaId: string;
  accao: "adicionar" | "renomear" | "capa";
}

const SearchIcon = (
  <svg
    className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

/** "1 foto" / "7 fotos" — o plural aparece em meia dúzia de frases. */
/** Por que ordem os temas aparecem. */
export type Ordem = "alfabetica" | "recentes" | "fotos" | "mais-usados" | "menos-usados";

/**
 * ── OS NOMES DIZEM O CRITÉRIO, E NÃO A DIRECÇÃO ────────────────────────────
 *
 * «A–Z» e «Recentes» eram o que estava. O `docs/APPLE-TEMAS.md` (Parte 6) pede
 * «Ordenar: Nome», com «Nome · Mais recentes · Mais usados · Menos usados» — a
 * lista escreve-se com o critério à frente, para o controlo dizer por que
 * ordem a grelha está sem ser preciso adivinhar o que «A–Z» quer dizer numa
 * biblioteca com acentos.
 *
 * «Com mais fotos» fica, e não é um quinto por gosto: já cá estava, é o que
 * responde a «qual é o tema que dá para montar um mood board hoje», e tirá-lo
 * seria desfazer trabalho para chegar ao número quatro do documento.
 *
 * As duas do USO só se OFERECEM quando a contagem de propostas chegou (vem
 * noutro pedido, ver `usos`) — e se a preferência guardada for uma delas antes
 * de ela chegar, a `ordenarTemas` cai no nome, que é a ordem de repouso.
 */
export const ORDENS: readonly { valor: Ordem; rotulo: string }[] = [
  { valor: "alfabetica", rotulo: "Nome" },
  { valor: "recentes", rotulo: "Mais recentes" },
  { valor: "fotos", rotulo: "Com mais fotos" },
  { valor: "mais-usados", rotulo: "Mais usados" },
  { valor: "menos-usados", rotulo: "Menos usados" },
];

/** As ordens que precisam da contagem de propostas para significarem alguma
 *  coisa. Sem ela não se mostram — ver `ORDENS`. */
export const ORDENS_DE_USO: readonly Ordem[] = ["mais-usados", "menos-usados"];

/** O que o «⋯» da barra de topo governa, para o rótulo acessível — «Acções de
 *  Biblioteca de Temas». Sem isto ele chamava-se «Acções» como os dos cartões,
 *  e numa grelha de 28 haveria 29 botões com o mesmo nome. */
const MENU_DA_BIBLIOTECA = "Biblioteca de Temas";

const ORDEM_KEY = "liquen-temas-ordem";

export function lerOrdem(): Ordem | null {
  try {
    const v = window.localStorage.getItem(ORDEM_KEY);
    return ORDENS.some((o) => o.valor === v) ? (v as Ordem) : null;
  } catch {
    return null;
  }
}

export function guardarOrdem(o: Ordem): void {
  try {
    window.localStorage.setItem(ORDEM_KEY, o);
  } catch {
    // Ver `guardarDensidade`.
  }
}

/**
 * Ordena os temas — puro, para se poder testar sem desenhar nada.
 *
 * OS FAVORITOS VÊM SEMPRE À FRENTE, seja qual for a ordem escolhida. É o que
 * fixar significa: um tema que se usa em quase todas as propostas não pode
 * andar a mudar de sítio porque se ordenou por data. Dentro de cada grupo é
 * que a ordem escolhida manda.
 *
 * Uma pasta ilegível (`imageCount: null`) fica no fim de "com mais fotos", em
 * vez de valer zero e passar à frente de um tema com uma foto — não sabemos
 * quantas tem, e adivinhar para baixo seria esconder o tema.
 *
 * `usos` é a contagem de propostas por tema, e chega depois dos cartões. Sem
 * ela, as duas ordens do USO não têm por onde ordenar e a lista fica pelo nome
 * — a ordem de repouso desta biblioteca. Um empate (dois temas com três
 * propostas cada) também desce ao nome, para a grelha não trocar de arrumação
 * entre dois desenhos.
 */
export function ordenarTemas(
  temas: readonly ThemeSummary[],
  ordem: Ordem,
  usos?: Record<string, number> | null,
): ThemeSummary[] {
  const porOrdem = (a: ThemeSummary, b: ThemeSummary): number => {
    if (ordem === "recentes") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (ordem === "fotos") {
      const na = a.imageCount ?? -1;
      const nb = b.imageCount ?? -1;
      if (na !== nb) return nb - na;
    }
    if (usos && (ordem === "mais-usados" || ordem === "menos-usados")) {
      const na = usos[a.id] ?? 0;
      const nb = usos[b.id] ?? 0;
      if (na !== nb) return ordem === "mais-usados" ? nb - na : na - nb;
    }
    return a.name.localeCompare(b.name, "pt");
  };
  return [...temas].sort((a, b) => Number(!!b.favorito) - Number(!!a.favorito) || porOrdem(a, b));
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS DA BIBLIOTECA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A biblioteca é o activo mais valioso do back office e não dizia o seu próprio
 * tamanho: era preciso somar 18 cartões à mão para responder a «quantas fotos
 * temos?».
 *
 * Uma pasta ILEGÍVEL (`imageCount: null`) não conta como zero — conta como
 * desconhecida, e o total di-lo. Somar zero calado transformava uma falha de
 * leitura numa biblioteca mais pequena do que é, que é a maneira mais fácil de
 * alguém concluir que faltam fotos e ir carregá-las outra vez.
 */
export function contarFotosDaBiblioteca(temas: readonly ThemeSummary[]): {
  fotos: number;
  temas: number;
  ilegiveis: number;
} {
  let fotos = 0;
  let ilegiveis = 0;
  for (const t of temas) {
    if (typeof t.imageCount === "number") fotos += t.imageCount;
    else ilegiveis += 1;
  }
  return { fotos, temas: temas.length, ilegiveis };
}

/**
 * Abaixo de quantas fotos um tema não serve para montar uma página.
 *
 * Um mood board enche-se com 6 a 8 fotografias (ver `proposal-moodboard.ts`).
 * Um tema com menos de três não dá para escolher: dá para usar o que lá está,
 * que é outra coisa. O aviso não julga o tema — diz que ele ainda está a meio.
 */
export const POUCAS_FOTOS = 3;

/** O tema tem poucas fotos para o que serve? `null` (ilegível) não é «poucas»:
 *  não se sabe, e um aviso a partir do que não se sabe é um aviso errado. */
export function temPoucasFotos(t: Pick<ThemeSummary, "imageCount">): boolean {
  return typeof t.imageCount === "number" && t.imageCount < POUCAS_FOTOS;
}

/** Quão apertada é a grelha de temas. */
export type Densidade = "confortavel" | "compacto";

const DENSIDADE_KEY = "liquen-temas-densidade";

/** Lê a preferência guardada. Nunca lança — um `localStorage` indisponível
 *  (janela privada, política do browser) vale como "não há preferência". */
export function lerDensidade(): Densidade | null {
  try {
    const v = window.localStorage.getItem(DENSIDADE_KEY);
    return v === "confortavel" || v === "compacto" ? v : null;
  } catch {
    return null;
  }
}

export function guardarDensidade(d: Densidade): void {
  try {
    window.localStorage.setItem(DENSIDADE_KEY, d);
  } catch {
    // Perder a preferência é um incómodo; deitar o ecrã abaixo por causa dela
    // não tem desculpa nenhuma.
  }
}

/**
 * As colunas de cada densidade.
 *
 * DUAS no telemóvel nas duas: uma coluna com cartões enormes obrigava a
 * percorrer a biblioteca inteira de baixo para cima.
 *
 * "Compacto" chega a seis colunas porque é exactamente o número de temas de
 * hoje — o pedido era vê-los todos de uma vez, sem scroll.
 */
/**
 * ── AS COLUNAS, E PORQUE É QUE A FOLGA NÃO É QUADRADA ─────────────────────
 *
 * Pedido dela, na Fase 3: «mais folga entre os cartões».
 *
 * A folga VERTICAL é maior do que a horizontal, e não por gosto: desde que um
 * cartão pode ter uma linha pendurada por baixo dele — «Lê-se como "italia" ·
 * Juntar» —, uma folga igual nos dois sentidos punha essa linha à mesma
 * distância do cartão a que pertence e do cartão de baixo. Lia-se como sendo
 * do outro.
 *
 * Horizontalmente muda pouco: a 390 px são duas colunas, e cada píxel de folga
 * sai da fotografia. É o lado onde a folga custa e o lado onde não fazia falta.
 */
export const COLUNAS: Record<Densidade, string> = {
  confortavel: "grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4",
  compacto: "grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6",
};

/**
 * AS COLUNAS DA GRELHA DE FOTOS DE UM TEMA — e porque são DUAS no telemóvel.
 *
 * Medido a 375 px (iPhone SE) com três colunas: cada célula ficava com
 * 97,7×97,7 px, e a 320 px com 79×79. Dentro dessa célula vivem TRÊS botões de
 * 28×28 — ampliar, mover para o início e remover — que onde não há rato estão
 * sempre visíveis (hoje `com-rato:opacity-0`; era um `@media (hover: none)`,
 * que deixava de fora o portátil com ecrã táctil), porque sem passar o rato
 * não há outra forma de lá chegar. Três alvos de 28 px, ou seja dois
 * terços do mínimo de 44, e o × que APAGA a foto é um deles.
 *
 * Pô-los nos 44 px que a casa exige (`.alvo-toque`) não cabia em 98 px: os
 * dois de baixo ficariam a 2 px um do outro e a foto desaparecia debaixo dos
 * botões. Por isso a grelha passa a duas colunas onde o telemóvel é estreito —
 * célula de 150,5 px a 375 e 123 px a 320, com 54 px e 27 px de folga entre os
 * botões de baixo — e volta às três colunas a partir de 26rem (416 px), que é
 * onde a célula (111 px) ainda as comporta.
 *
 * A biblioteca não fica mais curta de percorrer: são as mesmas fotos, maiores.
 * É a mesma decisão que o `COLUNAS` acima já tinha tomado para os cartões.
 *
 * O degrau seguinte passou de cinco colunas para quatro pela mesma conta, um
 * andar acima: num tablet de 640 px as cinco davam células de 105 px, e aí os
 * dois botões de baixo ficavam a 7 px um do outro — abaixo dos 8 px de
 * intervalo mínimo entre alvos. Com quatro são 133,5 px de célula e 37 px de
 * intervalo.
 *
 * ── E PORQUE É QUE OS DEGRAUS MEDEM O CONTENTOR, NÃO A JANELA ─────────────
 *
 * Toda a aritmética acima é sobre a largura da CÉLULA, e a célula não sabe o
 * tamanho do ecrã: sabe o tamanho da zona de largar onde vive. Os dois números
 * andaram juntos enquanto a navegação foi uma gaveta por cima da página — e
 * separaram-se exactamente em `lg`, que é onde ela deixa de ser gaveta e passa
 * a ser uma coluna `sticky` de 256 px em fluxo (`AdminClient.tsx`).
 *
 * A conta a 1024 px de janela: sobram 654 px para esta grelha — 1024 − 256 da
 * barra lateral − 80 do `lg:px-10` da vista − 34 da moldura e do `p-4` da zona
 * de largar. Seis colunas com `gap-2` davam células de 102,3 px, MENOS do que
 * os 111 px que o parágrafo acima fixa como o piso onde os três botões ainda
 * cabem. E num iPad Pro deitado — 1024 px de janela, e dedo — eram três alvos
 * de 44 px dentro de uma célula de 102. Era o caso do `MOBILE-AUDIT.md` («e
 * `sm:` não servia para o resolver») com a barra lateral no papel da gaveta.
 *
 * Por isso os degraus são `@container`: medem a zona de largar, que é o que
 * decide mesmo a célula. Cada limiar é a largura mínima a que aquele número de
 * colunas ainda dá os 111 px — `111·n + 8·(n−1)`, arredondado para cima ao rem
 * par seguinte:
 *
 *     colunas    mínimo    limiar
 *        3       349 px    22rem (352)
 *        4       468 px    30rem (480)
 *        5       587 px    38rem (608)
 *        6       706 px    46rem (736)
 *
 * A zona de largar mede 309 px a 375 de janela, 558 a 640, 654 a 1024 e 1070 a
 * 1440 — ou seja células de 150,5 px (2 colunas), 133,5 (4), 124,4 (5) e 171,7
 * (6). São as mesmas de hoje em todas as larguras onde hoje já estavam certas;
 * só o portátil a 1024 muda, e muda para cima.
 *
 * (O `md:grid-cols-5` que aqui vivia era a última infracção deste ficheiro ao
 * contrato dos cortes. Nunca tinha sido uma pergunta sobre a janela.)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * FASE 07 — A ESCADA DE DEGRAUS PASSA A `auto-fill`, E O PISO DE 2 FICA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `docs/APPLE-TEMAS.md`, ponto 21: «grelha `repeat(auto-fill, minmax(180px,
 * 1fr))`, RÁCIO FIXO 4:3 com `object-fit: cover`, gap de 12».
 *
 * A escada de cinco degraus acima fazia o trabalho de um `auto-fill` à mão —
 * e fazia-o com um número diferente do do documento. `auto-fill` diz a mesma
 * coisa numa linha e nunca desafina: a célula não desce de 180 px, aconteça o
 * que acontecer à zona de largar, e não há degrau nenhum para alguém esquecer
 * de acertar quando a coluna do split view lhe tirar 272 px de largura.
 *
 * ── MAS O PISO DE DUAS COLUNAS NÃO SE DEITA FORA ──────────────────────────
 *
 * `minmax(180px, 1fr)` sozinho dá UMA coluna abaixo de 372 px de contentor —
 * ou seja, uma fotografia por linha nos 309 px que um telemóvel de 375 dá a
 * esta grelha. A decisão medida que este comentário conta (duas colunas, 150,5
 * px de célula, três alvos de 44 px lá dentro) não é uma preferência: é o que
 * torna a pasta percorrível ao dedo. Por isso o `auto-fill` só entra a partir
 * de 24rem (384 px), que é a primeira largura onde ele próprio já dá duas
 * (2 × 180 + 12 = 372); abaixo disso mandam as duas colunas de sempre.
 *
 * A tabela que sai daqui, com o `gap-3` do documento:
 *
 *     zona de largar   colunas   célula
 *     309 (janela 375)    2       148,5
 *     558 (janela 640)    2       273
 *     654 (janela 1024)   3       210
 *     798 (1440, split)   4       190,5
 *    1070 (janela 1440)   5       204,4
 *
 * Menos fotos por linha do que antes, e maiores — é o que 180 px de mínimo
 * quer dizer. O piso dos 111 px continua garantido por construção em toda a
 * gama do `auto-fill`, e à mão nos 240–384 px que sobram (a 240, 114 px).
 */
/**
 * ── O PISO DE ALTURA DA CÉLULA, E PORQUE É QUE O 4:3 O OBRIGOU ────────────
 *
 * A célula era `aspect-square`; a fase 07 do `docs/APPLE-TEMAS.md` põe-na a
 * 4:3. Uma célula 4:3 é 25% MAIS BAIXA do que a quadrada com a mesma largura —
 * e a altura desta célula não é decoração: dentro dela vivem TRÊS alvos de
 * 44 px, um encostado ao topo (o `×`, que APAGA a foto) e dois encostados ao
 * fundo.
 *
 * A conta do que eles precisam, de cima para baixo:
 *
 *     4 (top-1) + 44 + 8 (intervalo mínimo entre alvos) + 44 + 4 (bottom-1)
 *   = 104 px
 *
 * MEDIDO com a grelha nova, à altura de cada janela:
 *
 *     janela   célula          folga entre o alvo de cima e o de baixo
 *      320     121,0 × 90,8    −5,2 px   ← SOBREPOSTOS
 *      375     148,5 × 111,4   +15,4 px
 *      390     156,0 × 117,0   +21,0 px
 *     1024     185,0 × 138,8   +42,8 px
 *     1440     190,5 × 142,9   +46,9 px
 *
 * A 320 px o `×` e o `↑` sobrepunham-se em 5 px, e quem ganha um toque na
 * zona sobreposta é o que vem depois no DOM — o `×`. Ou seja: o dedo ia a
 * «mover para o início» e apagava a fotografia.
 *
 * O piso corrige isso e não desfaz o 4:3: a partir de 138,7 px de célula (que
 * é toda a gama de 375 para cima) o rácio é exactamente 4:3 e este mínimo
 * nunca chega a pegar. Só nos últimos ~55 px antes dos 320 é que a célula fica
 * um pouco mais alta do que 4:3 — e a alternativa ali era dois alvos por cima
 * um do outro. «Onde este documento e a acessibilidade discordarem, ganha a
 * acessibilidade» (`docs/DESIGN-SYSTEM.md`, Parte −1, ponto 5).
 */
export const PISO_DA_CELULA_PX = 104;

export const GRELHA_DE_FOTOS =
  "grid grid-cols-2 gap-3 @min-[24rem]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]";

/**
 * "há 3 dias", "hoje" — a data como se fala, para o cartão poder dizer o que
 * está vivo e o que está parado sem gastar uma linha inteira com um formato
 * completo. Datas futuras (relógios trocados) contam como hoje, em vez de
 * dizerem "há -2 dias".
 */
/**
 * Quando foi mexido, como se diz — até um mês. Depois disso, a data.
 *
 * Ponto 13 da auditoria do `docs/APPLE-TEMAS.md`: «mantém o relativo e
 * acrescenta `title` com a data completa; a partir de 30 dias mostra a data».
 * «Há 2 meses» já não responde à pergunta de trabalho («foi antes ou depois do
 * casamento dos Ferreira?»), e dois temas com «há 1 ano» podem estar onze
 * meses afastados. Abaixo dos 30 dias o relativo é mais preciso do que a data
 * de relance; a partir daí é ao contrário.
 *
 * A data vai no formato da casa, `DD/MM/AAAA` (Parte 9.6 do sistema de
 * design), e não por extenso: está no fim de uma linha que trunca, e a
 * versão longa continua no `title` (`dataPorExtenso`).
 */
export function desdeQuando(iso: string | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((agora - t) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(t).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A data inteira, para o `title` de uma data relativa.
 *
 * «há 1 mês» é o que se lê de relance; «12 de agosto de 2026» é o que responde
 * quando a pergunta é «foi antes ou depois do casamento dos Ferreira?». As
 * duas, e não uma — é o ponto 13 da auditoria do `docs/APPLE-TEMAS.md` e a
 * última linha das proibições da Parte 9.
 *
 * Devolve `undefined` quando não há data ou ela não se deixa ler: um `title`
 * vazio é uma dica que aparece sem nada escrito.
 */
export function dataPorExtenso(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Quantas fotos tem o tema, em português e sem mentir:
 * `null` = a pasta NÃO pôde ser lida (dizer "0 fotos" leria-se como "as minhas
 * fotos desapareceram"); `truncated` = a contagem bateu no teto do servidor,
 * portanto é um MÍNIMO ("500+ fotos").
 */
function photoCountLabel(count: number | null, truncated?: boolean): string {
  if (count === null) return "Fotos indisponíveis";
  if (truncated) return `${count}+ fotos`;
  return plural(count, "foto", "fotos");
}

/**
 * Corre `worker` sobre `items` com no máximo `limit` em voo, pela ordem em que
 * vêm. `worker` NUNCA deve lançar — quem chama trata cada falha dentro dele e
 * guarda-a, para que um ficheiro mau não deite fora os 299 que faltam.
 * `stop` é consultado antes de cada item: é assim que sair da pasta trava o
 * que ainda não começou, sem cortar o que já vai a caminho.
 */
/**
 * Avisa o seletor da Biblioteca de Temas que o que ele tem em cache deixou de
 * corresponder à realidade.
 *
 * O seletor (ThemePicker) guarda temas e páginas de miniaturas em cache de
 * módulo, para reabrir sem disparar um pedido. Essa cache só é invalidada por
 * este evento — sem ele, acrescentar ou remover uma foto aqui deixava o
 * seletor a mostrar a biblioteca velha até a aba ser recarregada. Um evento em
 * `window` (e não um import) mantém os dois ecrãs sem se conhecerem.
 */
function bibliotecaAlterada(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("liquen:biblioteca-alterada"));
}

/**
 * O retrato de uma ação em bloco a decorrer, para o `EmCurso` da barra de
 * seleção. Transferir 40 fotos e remover 40 fotos são 40 coisas cada uma: há
 * sempre contagem, por isso a barra diz a verdade e nunca é uma estimativa.
 */
type AccaoEmBloco = { tipo: "transferir" | "remover"; feito: number; total: number };

async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || stop()) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Repõe fotos numa lista, cada uma no índice onde estava (puro — testado).
 *
 * É o que uma remoção falhada precisa: repor a lista inteira (o "snapshot" de
 * antes) deitava fora as fotos que um lote a decorrer tivesse entretanto
 * acrescentado. Insere-se de trás para a frente para que os índices guardados
 * continuem a valer à medida que a lista cresce.
 */
export function reinsertAt(
  list: ThemeImage[],
  items: ThemeImage[],
  positions: Map<string, number>,
): ThemeImage[] {
  const next = [...list];
  const ordered = [...items].sort(
    (a, b) => (positions.get(b.path) ?? 0) - (positions.get(a.path) ?? 0),
  );
  for (const im of ordered) {
    if (next.some((x) => x.path === im.path)) continue;
    next.splice(Math.min(positions.get(im.path) ?? next.length, next.length), 0, im);
  }
  return next;
}

/** Junta uma página nova ao que já está, sem duplicar (puro — testado).
 *  A ordem do servidor desloca-se enquanto se carregam fotos; a defesa é a
 *  chave estável (`path`), não a aritmética de offsets. */
export function mergePage(prev: ThemeImage[], page: ThemeImage[]): ThemeImage[] {
  const seen = new Set(prev.map((i) => i.path));
  return [...prev, ...page.filter((i) => i.path && !seen.has(i.path))];
}

/**
 * Move um item de `from` para `to` (puro — testado).
 *
 * É a operação por trás do arrasto e das setas: tirar a foto de onde está e
 * enfiá-la onde deve ficar, sem perder nem duplicar nada. Índices fora da
 * lista devolvem-na intacta.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Um ficheiro largado que é (ou parece ser) uma imagem. HEIC e ficheiros de
 *  câmara chegam por vezes com `type` vazio — aceitar também por extensão em
 *  vez de os descartar em silêncio. */
function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name);
}

/**
 * As "entries" de um arrasto — TÊM de ser lidas de forma SÍNCRONA dentro do
 * handler do drop: o `DataTransfer` é esvaziado assim que ele retorna, e um
 * único `await` antes disto deixava a lista vazia. Devolve [] em ambientes
 * sem a API (é o caso do jsdom, e de browsers antigos): aí usa-se
 * `dataTransfer.files`, que só traz ficheiros soltos.
 */
function readDropEntries(dt: DataTransfer | null): FileSystemEntry[] {
  const items = dt?.items;
  if (!items || typeof items.length !== "number") return [];
  const out: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item?.webkitGetAsEntry !== "function") continue;
    try {
      const entry = item.webkitGetAsEntry();
      if (entry) out.push(entry);
    } catch {
      // Um item que não é ficheiro (texto arrastado, por ex.) — ignora-se.
    }
  }
  return out;
}

/**
 * Expande pastas largadas até aos ficheiros, em largura.
 *
 * Vale a complexidade: a Catarina tem as fotos organizadas em pastas no
 * computador, e a alternativa é abrir a pasta, marcar tudo e arrastar — ou,
 * pior, largar a pasta e não perceber porque não aconteceu nada.
 *
 * O detalhe que costuma passar despercebido: `readEntries` devolve no máximo
 * ~100 entradas por chamada e tem de ser repetido até vir vazio — uma pasta de
 * 300 fotos largada assim carregava só as primeiras 100.
 */
async function expandDropEntries(entries: FileSystemEntry[]): Promise<{
  files: File[];
  capped: boolean;
}> {
  const files: File[] = [];
  const queue = [...entries];
  let seen = 0;
  while (queue.length > 0 && files.length < MAX_DROP_FILES && seen < MAX_DROP_ENTRIES) {
    const entry = queue.shift();
    if (!entry) break;
    seen += 1;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        try {
          (entry as FileSystemFileEntry).file(
            (f) => resolve(f),
            () => resolve(null),
          );
        } catch {
          resolve(null);
        }
      });
      if (file) files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          try {
            reader.readEntries(
              (e) => resolve(e),
              () => resolve([]),
            );
          } catch {
            resolve([]);
          }
        });
        if (batch.length === 0) break;
        queue.push(...batch);
        if (queue.length + files.length > MAX_DROP_ENTRIES) break;
      }
    }
  }
  return { files, capped: files.length >= MAX_DROP_FILES || queue.length > 0 };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI NÃO MUDA DE CONTEÚDO A MEIO DA SAÍDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três caixas desta vista fechavam A SECO porque quem as desmontava era ESTE
 * ficheiro: a folha de fundir temas, a de copiar fotos e o visualizador. As
 * três já sabem sair (as duas primeiras pelo `FolhaOuDialogo`, a terceira pela
 * `.bo-saida`); o que faltava era alguém segurá-las montadas os 200 ms — e esse
 * alguém é quem tem o estado, ou seja aqui.
 *
 * O `useSaidaDeUmSo` dá o «ainda está a sair». O que ele não resolve é este
 * outro problema, que só aparece quando o pai desmonta: **os dados de que a
 * caixa vive desaparecem no mesmo instante em que ela fecha.** O `aFundir` cai
 * para `null`, a seleção de fotos esvazia-se quando as fotos mudam de tema, o
 * `zoomAt` deixa de ser um índice. Sem isto, o que ficava a apagar-se durante
 * 200 ms era uma folha a dizer «0 fotos selecionadas» — ou um erro, porque a
 * caixa precisa de um tema que já não existe.
 *
 * Então guarda-se o último valor que esteve ABERTO e é esse que se desenha
 * enquanto sai. Devolve `null` quando não há nada para desenhar — fechado E sem
 * saída a correr —, que é o que apaga a caixa da árvore no fim.
 *
 * ── EM ESTADO, AJUSTADO NO DESENHO, E NÃO NUMA REFERÊNCIA ─────────────────
 *
 * A primeira versão disto era um `useRef` escrito durante o desenho. É o mesmo
 * defeito que a `react-hooks/refs` recusa, e recusa com razão: um valor lido no
 * desenho a partir de uma referência é um valor que o React não sabe que
 * existe — não re-desenha por causa dele, e no modo estrito (dois desenhos por
 * commit) a referência já foi escrita uma vez quando a segunda leitura
 * acontece. Ajustar ESTADO durante o desenho é o padrão que o React documenta
 * para reagir a uma prop, e re-desenha sem pintar nada pelo meio.
 *
 * ── E POR ISSO O `valor` TEM DE SER ESTÁVEL ENTRE DESENHOS ────────────────
 *
 * A comparação é por identidade. Um objecto literal montado na chamada
 * (`{origem: aFundir, temas: themes}`) é novo a cada desenho, e isto passava a
 * chamar `setUltimo` para sempre — um ciclo. Quem chama passa portanto valores
 * que já são estáveis: um item de estado, um array de estado, ou um `useMemo`.
 * São duas chamadas quando são dois valores, e não uma com um objecto à volta.
 */
function useNoEcraAteSair<T>(aberto: boolean, aSair: boolean, valor: T | null): T | null {
  const [ultimo, setUltimo] = useState<T | null>(null);
  if (aberto && valor !== ultimo) setUltimo(valor);
  if (aberto) return valor;
  return aSair ? ultimo : null;
}

export default function Temas() {
  const { toast } = useToast();
  const anular = useAnular();
  // Eliminar um tema deixa-o 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagar = useDepoisDeApagar();
  // Sair da Biblioteca esquece o que o SELETOR de temas tinha guardado.
  //
  // Este ecrã é o único sítio onde a biblioteca muda — carregar, apagar,
  // reordenar, gerar miniaturas. Em vez de pendurar uma invalidação em cada um
  // desses nove sítios (e no décimo que alguém acrescenta daqui a um mês sem
  // saber que isto existe), esquece-se UMA vez, à saída. Não há como falhar:
  // se ela mexeu em alguma coisa, mexeu aqui, e passou por esta linha.
  //
  // A cache tem revalidação própria e portanto isto não é o que a mantém
  // correcta — é o que faz o que ela acabou de carregar aparecer JÁ na
  // proposta seguinte, em vez de daqui a meio minuto.
  useEffect(() => esquecerBiblioteca, []);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /** O tema à espera de resposta à pergunta de o eliminar. */
  const [aEliminar, setAEliminar] = useState<ThemeSummary | null>(null);
  const [search, setSearch] = useState("");
  // Guardada entre sessões: quem trabalha com a biblioteca todos os dias escolhe
  // uma vez e não quer voltar a escolher. Começa em "compacto" porque com seis
  // temas é o que os põe todos no ecrã sem scroll — que é o pedido de origem.
  const [densidade, setDensidade] = useState<Densidade>("compacto");
  const [ordem, setOrdem] = useState<Ordem>("alfabetica");
  /**
   * ── O ÂMBITO DA VISTA ──────────────────────────────────────────────────
   *
   * «Todos · Por usar · Usados este ano · Favoritos · Arquivados», da Parte 1,
   * ponto 12 do `docs/APPLE-TEMAS.md`. Substitui o interruptor «Arquivados»
   * que aqui estava: o arquivo continua a ser uma VISTA e não um filtro que se
   * soma (era essa a regra, e não muda), e passa a ser um dos cinco âmbitos em
   * vez de um botão sozinho ao lado deles. As contas estão em
   * `lib/temas-filtros.ts`.
   *
   * Não se guarda entre sessões, ao contrário da ordem e da densidade: essas
   * são preferências de leitura («como é que eu gosto de ver isto»), e um
   * âmbito é onde se está agora. Reabrir a Biblioteca dentro de «Arquivados»
   * era abri-la vazia.
   */
  const [ambito, setAmbito] = useState<Ambito>("todos");
  /**
   * ── EM QUANTAS PROPOSTAS É QUE CADA TEMA JÁ SAIU ───────────────────────
   *
   * O cartão dizia quantas FOTOS tem e quando foi mexido. Nenhuma das duas
   * responde à pergunta que se faz a olhar para 25 temas: qual é que eu uso
   * mesmo? Um tema com 80 fotos que nunca saiu de casa e um com 12 que foi a
   * metade dos casamentos do ano parecem iguais na grelha, e são o oposto um
   * do outro.
   *
   * Chega DEPOIS dos cartões, num pedido próprio: a contagem lê os documentos
   * das propostas todos, e a rota da lista é a que desenha o primeiro ecrã da
   * Biblioteca — a Fase 1 foi passada a tirar-lhe trabalho de cima. Ver
   * `temas-uso.ts`. Enquanto não chega (ou se nunca chegar) o cartão fica
   * exactamente como estava.
   */
  const [usos, setUsos] = useState<Record<string, number> | null>(null);
  /**
   * ── O TEMA QUE ESTÁ A SER JUNTO A OUTRO ────────────────────────────────
   *
   * Palavras dela: «"Clássico Intemporal" aparece duas vezes com nomes quase
   * iguais — não tenho como os juntar».
   *
   * Vive na LISTA e não dentro de uma pasta, porque é aqui que os duplicados
   * se vêem: dois cartões lado a lado com o mesmo nome mal escrito de duas
   * maneiras. Dentro de uma pasta não há com que comparar.
   */
  const [aFundir, setAFundir] = useState<ThemeSummary | null>(null);
  const [revendo, setRevendo] = useState(false);
  /**
   * ── O MENU ABERTO NO PONTEIRO ──────────────────────────────────────────
   *
   * Um só, e ao nível do ecrã: dois menus de contexto abertos ao mesmo tempo
   * não é um estado que exista. Abre-se com o botão direito num cartão, com o
   * botão direito no vazio da grelha, e com o «⋯» da barra de topo — sempre
   * com uma lista de `AccaoDeItem`, que é a mesma peça de dados que o «⋯» de
   * cada cartão já usa. Ver `MenuDeContexto.tsx`.
   */
  const [menu, setMenu] = useState<PedidoDeMenu | null>(null);
  const fecharMenu = useCallback(() => setMenu(null), []);
  /**
   * ── O ARRASTO DE FOTOGRAFIAS ENTRE TEMAS, VISTO DE CIMA ────────────────
   *
   * Fase 08. O gesto começa DENTRO da pasta (é lá que estão as fotografias) e
   * acaba na coluna da esquerda (é lá que estão os temas) — dois sítios que
   * não se conhecem. O que os liga é este par de estados, e vive aqui porque
   * é aqui que a lista de temas e a pasta se encontram.
   *
   *  · `aArrastar` é o que acende o sinal de aceitação na coluna. Não se lê do
   *    `dataTransfer`: durante o `dragover` o browser deixa ver os TIPOS mas
   *    não os dados, e a coluna precisa de saber que há um lote a andar mesmo
   *    antes de o ponteiro lhe tocar;
   *  · `pedidoDeMover` é a largada. Quem age é a PASTA — é ela que tem a
   *    grelha, a selecção e o «Anular» —, por isso o que atravessa é o pedido
   *    e não o resultado. O `n` distingue dois arrastos seguidos para o mesmo
   *    tema, que de outra forma seriam o mesmo objecto e não disparavam nada.
   */
  const [aArrastar, setAArrastar] = useState(false);
  const pedidosDeMover = useRef(0);
  const [pedidoDeMover, setPedidoDeMover] = useState<{
    destino: ThemeSummary;
    carga: CargaDeFotos;
    n: number;
  } | null>(null);
  const largarNoTema = useCallback((destino: ThemeSummary, carga: CargaDeFotos) => {
    pedidosDeMover.current += 1;
    setPedidoDeMover({ destino, carga, n: pedidosDeMover.current });
  }, []);
  /**
   * ── AS DUAS PORTAS NOVAS TAMBÉM PERGUNTAM ──────────────────────────────
   *
   * Trocar de tema na coluna DESMONTA a pasta (ela tem `key={open.id}`), o que
   * é a mesma coisa que sair dela: um lote a subir fica pelo caminho. O
   * «← Temas» já perguntava; estas duas nasceram sem perguntar, e é o género
   * de perda que só se descobre quando faltam fotos.
   */
  const [aSubirFotos, setASubirFotos] = useState(false);
  const podeTrocarDeTema = useCallback(
    () => !aSubirFotos || window.confirm(AVISO_DE_LOTE_A_MEIO),
    [aSubirFotos],
  );
  // Lidas depois do primeiro desenho, e não durante: o servidor não tem
  // `localStorage`, e ler ali daria um HTML diferente do que o browser desenha.
  useEffect(() => {
    const d = lerDensidade();
    if (d) setDensidade(d);
    const o = lerOrdem();
    if (o) setOrdem(o);
  }, []);

  /** Fixar/desafixar e arquivar/desarquivar. Guarda-se PRIMEIRO no ecrã e
   *  desfaz-se se o servidor recusar: é uma preferência de arrumação, e esperar
   *  por uma ida à rede para ver uma estrela acender não serve ninguém.
   *
   *  E QUANDO SE DESFAZ, A FRASE DIZ QUE SE DESFEZ. Arquivar tira o cartão da
   *  lista à vista; falhar volta a pô-lo lá. Com «Não foi possível guardar.» o
   *  que ela via era um tema que tinha arrumado a reaparecer sozinho — e a
   *  conclusão natural é que o ecrã se enganou, não que a gravação não ficou. */
  const gravarMarca = useCallback(
    async (t: ThemeSummary, campo: "favorito" | "arquivado", novo: boolean): Promise<boolean> => {
      const oQue =
        campo === "arquivado"
          ? `${novo ? "arquivar" : "desarquivar"} o tema "${t.name}"`
          : `${novo ? "fixar" : "desafixar"} o tema "${t.name}"`;
      const desfez =
        campo === "arquivado"
          ? novo
            ? `"${t.name}" voltou à lista.`
            : `"${t.name}" continua arquivado.`
          : novo
            ? `"${t.name}" voltou a ficar sem estrela.`
            : `"${t.name}" continua fixado.`;
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: novo } : x)));
      const reverter = (falha: Falha) => {
        setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: !novo } : x)));
        toast(`${falha.mensagem} ${desfez}`, "error");
      };
      let res: Response;
      try {
        res = await fetch(`/api/temas/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: novo }),
        });
      } catch {
        reverter(porqueRebentou(oQue));
        return false;
      }
      if (!res.ok) {
        reverter(porqueFalhou(oQue, res, await res.json().catch(() => null)));
        return false;
      }
      return true;
    },
    [toast],
  );

  /** O gesto, com «Anular» — que é o mesmo PATCH com o valor de antes. */
  const alternarMarca = useCallback(
    async (t: ThemeSummary, campo: "favorito" | "arquivado") => {
      const novo = !t[campo];
      if (!(await gravarMarca(t, campo, novo))) return;
      const feito =
        campo === "arquivado"
          ? novo
            ? `"${t.name}" arquivado`
            : `"${t.name}" de volta à lista`
          : novo
            ? `"${t.name}" fixado`
            : `"${t.name}" deixou de estar fixado`;
      anular(feito, () => gravarMarca({ ...t, [campo]: novo }, campo, !novo));
    },
    [gravarMarca, anular],
  );

  /**
   * Renomear um tema a partir da LISTA.
   *
   * O renomear que já existia vive dentro da pasta de um tema, e é lá que ele
   * pertence. Isto é a outra porta: a revisão em lote dos nomes por arrumar,
   * que precisa de mudar um nome sem entrar em cada pasta.
   *
   * Ao contrário do `alternarMarca`, aqui NÃO se grava primeiro no ecrã: um
   * nome é o índice por onde ela procura, e mostrar um nome que o servidor
   * recusou é pior do que esperar meio segundo por ele.
   */
  const gravarNome = useCallback(
    async (t: ThemeSummary, nome: string): Promise<boolean> => {
      const oQue = `mudar "${t.name}" para "${nome}"`;
      let res: Response;
      try {
        res = await fetch(`/api/temas/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome }),
        });
      } catch {
        toast(porqueRebentou(oQue).mensagem, "error");
        return false;
      }
      if (!res.ok) {
        // 409 é o nome já existir noutro tema — e aí a frase tem de o dizer,
        // porque «não foi possível» mandava-a tentar outra vez para sempre.
        // Fica aqui à mão em vez de vir do `porqueFalhou`: o 409 genérico dele
        // fala de duas pessoas a mexerem ao mesmo tempo, e não é isso que se
        // passa — o outro nome pode estar lá desde o ano passado.
        toast(
          res.status === 409
            ? `Já há um tema chamado "${nome}".`
            : porqueFalhou(oQue, res, await res.json().catch(() => null)).mensagem,
          "error",
        );
        return false;
      }
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: nome } : x)));
      return true;
    },
    [toast],
  );

  /** O renomear da lista, com «Anular»: volta ao nome de antes. Se entretanto
   *  outro tema ficou com esse nome, o 409 di-lo e não aparece «Anulado.». */
  const renomearDaLista = useCallback(
    async (t: ThemeSummary, nome: string): Promise<boolean> => {
      if (!(await gravarNome(t, nome))) return false;
      anular(`"${t.name}" passou a "${nome}"`, () => gravarNome({ ...t, name: nome }, t.name));
      return true;
    },
    [gravarNome, anular],
  );

  /**
   * ── OS PEDIDOS QUE SÓ A PASTA SABE SERVIR ──────────────────────────────
   *
   * «Adicionar fotografias…», «Renomear…» e «Definir capa…» estão no menu do
   * tema (no cartão e no cabeçalho da pasta), mas quem os sabe fazer é a
   * PASTA: é lá que estão o seletor de ficheiros, o campo do nome e a grelha
   * onde se escolhe a capa. O menu abre a pasta (perguntando, como as outras
   * portas, se houver um lote a subir noutra) e deixa um pedido — um objecto
   * novo a cada vez, que é o que distingue dois pedidos iguais seguidos. A
   * pasta serve-o e avisa (`pedidoServido`), e o pedido sai daqui, para não
   * ser servido outra vez quando a pasta voltar a montar.
   */
  const [pedidoAPasta, setPedidoAPasta] = useState<PedidoAPasta | null>(null);
  const pedirAPasta = useCallback(
    (t: ThemeSummary, accao: PedidoAPasta["accao"]) => {
      if (t.id !== openId && !podeTrocarDeTema()) return;
      setOpenId(t.id);
      setPedidoAPasta({ temaId: t.id, accao });
    },
    [openId, podeTrocarDeTema],
  );
  const pedidoServido = useCallback(
    (servido: PedidoAPasta) => setPedidoAPasta((p) => (p === servido ? null : p)),
    [],
  );

  /**
   * As acções de um tema, como DADOS — a forma é de quem as desenha.
   *
   * A MESMA lista no «⋯» do cartão, no botão direito e no «⋯» do cabeçalho da
   * pasta: nenhum dos três pode ganhar uma acção que os outros não tenham.
   *
   * ── PELA ORDEM DO DOCUMENTO ─────────────────────────────────────────────
   * Parte 3 do `docs/APPLE-TEMAS.md`: «Abrir · Pré-visualizar — separador —
   * Adicionar fotografias… · Renomear… · Definir capa… — separador —
   * Favorito · Arquivar — separador — Eliminar tema… (vermelho)».
   *
   * «Juntar a outro tema…» não está no documento e fica, no grupo de
   * arrumação, antes do destrutivo: é o ÚNICO caminho geral para fundir dois
   * temas (o aviso de nomes parecidos só cobre pares parecidos).
   *
   * ── OITO ITENS EM TRÊS GRUPOS, DECISÃO DELA ──────────────────────────────
   * Com «Juntar…» o menu chegava a nove itens em quatro grupos, acima do que a
   * Apple aconselha (cinco a oito, no máximo três grupos), e no telemóvel,
   * aberto para cima, escondia o «Abrir» debaixo do cabeçalho. Perguntado, ela
   * respondeu «podes» a encurtar: sai «Pré-visualizar» (dentro da pasta a
   * barra de espaço continua a abrir a fotografia em grande) e o «Abrir» junta-
   * se ao grupo do que se faz ao tema. Ficam: Abrir · Adicionar fotografias… ·
   * Renomear… · Definir capa… | Favorito · Arquivar · Juntar a outro tema… |
   * Eliminar tema…
   *
   * Itens que não servem escondem-se em vez de se esbaterem (Parte 9.8):
   * «Definir capa…» numa pasta vazia, e «Abrir» dentro da própria pasta
   * (`naPasta`). Os filetes vão no primeiro item que ficou de cada grupo
   * (`emGrupos`).
   */
  const accoesDoTema = useCallback(
    (t: ThemeSummary, { naPasta = false }: { naPasta?: boolean } = {}): AccaoDeItem[] => {
      const temFotos = t.imageCount !== 0;
      return emGrupos(
        [
          /* ── «ABRIR» É O PRIMEIRO ITEM, E EXISTE MESMO SENDO ÓBVIO ──────
             «Incluir só os comandos mais prováveis» e «tudo o que está no
             menu de contexto existe também na interface principal». [APPLE]
             Num menu aberto com o botão direito EM CIMA do cartão, não haver
             «Abrir» obrigava a fechar o menu para fazer o gesto mais
             provável de todos. Dentro da pasta não faz sentido. */
          ...(naPasta
            ? []
            : [
                {
                  id: "abrir",
                  rotulo: "Abrir",
                  icone: ICONE_ABRIR,
                  onAccao: () => {
                    if (podeTrocarDeTema()) setOpenId(t.id);
                  },
                },
              ]),
          {
            id: "adicionar",
            rotulo: "Adicionar fotografias…",
            icone: ICONE_ADICIONAR,
            onAccao: () => pedirAPasta(t, "adicionar"),
          },
          {
            id: "renomear",
            rotulo: "Renomear…",
            icone: ICONE_RENOMEAR,
            onAccao: () => pedirAPasta(t, "renomear"),
          },
          ...(temFotos
            ? [
                {
                  id: "capa",
                  rotulo: "Definir capa…",
                  icone: ICONE_CAPA,
                  onAccao: () => pedirAPasta(t, "capa"),
                },
              ]
            : []),
        ],
        [
          /* Um item comutável, com rótulo que diz o que FAZ (Parte 9.7). A
             palavra é a do âmbito «Favoritos» da barra de filtros. */
          {
            id: "favorito",
            rotulo: t.favorito ? "Tirar dos favoritos" : "Favorito",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill={t.favorito ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z"
                  strokeLinejoin="round"
                />
              </svg>
            ),
            onAccao: () => alternarMarca(t, "favorito"),
          },
          {
            id: "arquivar",
            rotulo: t.arquivado ? "Repor na lista" : "Arquivar",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                {t.arquivado ? (
                  <path d="M12 19V7m0 0-4 4m4-4 4 4M4 4h16" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M4 8h16v11H4z" strokeLinejoin="round" />
                    <path d="M3 4h18v4H3zM10 12h4" strokeLinecap="round" />
                  </>
                )}
              </svg>
            ),
            onAccao: () => alternarMarca(t, "arquivado"),
          },
          {
            id: "fundir",
            rotulo: "Juntar a outro tema…",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {/* Dois caminhos que se encontram num só — o desenho do que a
                    acção faz, e não uma pasta com uma seta (que é o que já
                    significa arquivar, aqui mesmo por cima). */}
                <path d="M4 4c0 6 4 8 8 8s8 2 8 8" />
                <path d="M20 4c0 6-4 8-8 8" />
                <path d="m17 17 3 3-3 3" />
              </svg>
            ),
            onAccao: () => setAFundir(t),
          },
        ],
        [
          /* ── A DESTRUTIVA FICA NO FIM, A VERMELHO E COM O CUSTO ───────────
             Ponto 20 da auditoria e T3 do `PROPOSTAS-E-TEMAS-APPLE.md`:
             «Eliminar tema» só no menu «…». O `MenuDeAccoes` (e o menu do
             botão direito) põem-na a vermelho, depois de um filete, e a
             pergunta que se segue diz o nome do tema e o que se perde — a
             `perguntaDeEliminar`. */
          {
            id: "eliminar",
            rotulo: "Eliminar tema…",
            destrutiva: true,
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M10 11v6M14 11v6" />
                <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
            ),
            onAccao: () => setAEliminar(t),
          },
        ],
      );
    },
    [alternarMarca, pedirAPasta, podeTrocarDeTema],
  );
  // Filtrar fora da tecla: com poucos temas é imperceptível, e mantém o campo
  // instantâneo quando a lista cresce (é o mesmo padrão do Inventário).
  const deferredSearch = useDeferredValue(search);
  /**
   * A lista não veio — e porquê. Fica no ecrã, com o passo a dar: um toast que
   * desaparece não serve para uma instrução.
   *
   * ── PORQUE É QUE ISTO DEIXOU DE SER SÓ O 503 ──────────────────────────────
   * Era: 503 com corpo → cartão no ecrã; TUDO o resto → um toast que dizia «Não
   * foi possível carregar os temas.» e ia-se embora. Contadas as maneiras de
   * esta leitura falhar, nove: duas caíam no cartão e as outras SETE naquele
   * toast — a chave recusada, o projecto em pausa, a consulta fora de tempo,
   * uma sessão caducada. Nenhuma delas se resolve olhando para o ecrã, e o ecrã
   * era a única coisa que ela tinha.
   *
   * Agora qualquer recusa fica no cartão, com o título e a frase que a rota
   * manda (ver `respostaDeAvaria` em src/app/api/temas/route.ts). Os textos de
   * reserva aqui em baixo são só para o que nem sequer chega em JSON — um 504
   * do intermediário, uma página de erro —, e mesmo esses dizem o estado HTTP,
   * que é o que se cita a pedir ajuda.
   */
  const [blocked, setBlocked] = useState<{ titulo: string; texto: string } | null>(null);

  // Um pedido só, à entrada. Não acompanha o que ela faz na Biblioteca de
  // propósito: o que muda este número é gravar uma PROPOSTA, e isso acontece
  // noutro ecrã.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/temas/uso", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (vivo && data?.usos) setUsos(data.usos as Record<string, number>);
      } catch {
        /* fica sem número, que é como estava antes de isto existir */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (res.ok) {
          setThemes(await res.json());
          setBlocked(null);
        } else {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            titulo?: string;
          } | null;
          setBlocked({
            titulo: data?.titulo || tituloDaRecusa(res.status),
            texto: data?.error || textoDaRecusa(res.status),
          });
        }
      } catch {
        setBlocked({
          titulo: "Sem ligação ao servidor",
          texto:
            "O pedido dos temas não chegou a sair deste computador. Verifica a ligação à " +
            "internet e recarrega a página. Nada se perdeu — os temas estão no servidor.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function create() {
    // O Enter no campo do nome não passa pelo botão (que já está desativado
    // enquanto grava): sem esta guarda, dois Enter seguidos criavam dois temas.
    if (saving) return;
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const oQue = `criar o tema "${name}"`;
    try {
      let res: Response;
      try {
        res = await fetch("/api/temas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, notes: newNotes.trim() }),
        });
      } catch {
        toast(porqueRebentou(oQue).mensagem, "error");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // O 503 da criação é o mesmo impedimento de instalação da leitura, e
        // vai para o mesmo cartão — com o título que a rota mandar. O resto
        // continua num toast: numa ESCRITA que ela acabou de pedir, a queixa
        // pertence ao lado do botão em que carregou.
        if (res.status === 503 && data?.error) {
          setBlocked({ titulo: data.titulo || tituloDaRecusa(res.status), texto: data.error });
        } else toast(porqueFalhou(oQue, res, data).mensagem, "error");
        return;
      }
      setBlocked(null);
      const created: ThemeSummary = data;
      setThemes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
      bibliotecaAlterada();
      setNewName("");
      setNewNotes("");
      setAdding(false);
      setSearch("");
      setOpenId(created.id);
      toast(`Tema "${created.name}" criado. Agora carrega as fotos.`, "success");
    } finally {
      setSaving(false);
    }
  }

  /** Repõe UM tema depois de um DELETE falhado. Repor a lista inteira (o
   *  "snapshot" de antes do pedido) fazia desaparecer os temas criados no
   *  entretanto — e ressuscitava os que tivessem sido eliminados. */
  function restoreTheme(t: ThemeSummary) {
    setThemes((prev) =>
      prev.some((x) => x.id === t.id)
        ? prev
        : [...prev, t].sort((a, b) => a.name.localeCompare(b.name, "pt")),
    );
  }

  async function removeTheme(t: ThemeSummary) {
    setThemes((prev) => prev.filter((x) => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    // O cartão sai da lista já e volta se o servidor recusar — e é isso que a
    // frase tem de dizer. Um tema que ela acabou de eliminar a reaparecer com
    // um aviso que só fala de ligações é indistinguível de um ecrã avariado.
    const oQue = `eliminar o tema "${t.name}"`;
    const reverter = (falha: Falha) => {
      restoreTheme(t);
      toast(`${falha.mensagem} "${t.name}" voltou à lista.`, "error");
    };
    let res: Response;
    try {
      res = await fetch(`/api/temas/${t.id}`, { method: "DELETE" });
    } catch {
      reverter(porqueRebentou(oQue));
      return;
    }
    const corpo = await res.json().catch(() => null);
    if (res.ok) {
      bibliotecaAlterada();
      depoisDeApagar(corpo, `Tema «${t.name}» eliminado.`, () => {
        restoreTheme(t);
        bibliotecaAlterada();
      });
      return;
    }
    reverter(porqueFalhou(oQue, res, corpo));
  }

  /** Mantém o cartão do tema a par do que a pasta diz. A pasta é a fonte de
   *  verdade: a contagem passa a ser a que o servidor devolveu (e `truncated`
   *  com ela), e um `imageCount` que estava a `null` fica finalmente conhecido.
   *  `capa` a `undefined` quer dizer "não se sabe" — o cartão fica como está;
   *  a `null` quer dizer "a pasta está vazia". Os campos da capa mudam todos
   *  juntos — ver `comCapa`. */
  const syncCard = useCallback((id: string, s: FolderState) => {
    setThemes((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const contado = { ...t, imageCount: s.total, truncated: s.truncated };
        return s.capa === undefined ? contado : comCapa(contado, capaDaFoto(s.capa));
      }),
    );
  }, []);

  /**
   * ── DEPOIS DE JUNTAR DOIS TEMAS ────────────────────────────────────────
   *
   * A lista corrige-se sem recarregar: o destino ganha as fotos que chegaram,
   * a origem fica com as que sobraram, e — se ficou vazia — sai da vista, que
   * é o que o servidor já lhe fez.
   *
   * O relatório é um toast por assunto, e não uma frase com tudo lá dentro:
   * «foram X» é a confirmação, «Y já lá estavam» é uma explicação de porque é
   * que o tema não desapareceu, e «sem miniatura» é uma instrução. Três coisas
   * diferentes numa linha só lêem-se como nenhuma.
   */
  const aplicarFusao = useCallback(
    (r: ThemeMergeOutcome) => {
      setAFundir(null);
      setThemes((prev) =>
        prev.map((t) => {
          if (t.id === r.destId && t.imageCount !== null) {
            return { ...t, imageCount: t.imageCount + r.moved };
          }
          if (t.id === r.sourceId) {
            return {
              ...t,
              imageCount: r.leftBehind,
              truncated: false,
              ...(r.archived ? { arquivado: true } : {}),
            };
          }
          return t;
        }),
      );
      bibliotecaAlterada();
      if (r.stopped) {
        toast(
          `Parou a meio — ${plural(r.moved, "foto passou", "fotos passaram")} para "${r.destName}". Podes continuar quando quiseres.`,
          "info",
        );
        return;
      }
      if (r.moved === 0 && r.existing === 0 && r.failed === 0) {
        toast(`"${r.sourceName}" não tinha fotos. Nada mudou.`, "info");
      } else {
        toast(
          r.archived
            ? `"${r.sourceName}" passou para "${r.destName}" e foi arquivado.`
            : `${plural(r.moved, "foto passou", "fotos passaram")} para "${r.destName}".`,
          "success",
        );
      }
      // A razão de o tema não ter desaparecido. Sem isto, ela vê-o na lista com
      // três fotos e conclui que a fusão falhou.
      if (!r.archived && r.leftBehind > 0) {
        toast(
          r.failed > 0
            ? `${plural(r.failed, "foto não saiu", "fotos não saíram")} de "${r.sourceName}". Tenta juntar outra vez.`
            : `${plural(r.leftBehind, "foto já estava", "fotos já estavam")} em "${r.destName}" e ficou em "${r.sourceName}". Podes apagá-lo quando quiseres.`,
          "info",
        );
      }
      if (r.thumbsMissing > 0) {
        toast(
          `${plural(r.thumbsMissing, "foto chegou", "fotos chegaram")} a "${r.destName}" sem miniatura. Abre esse tema e usa "Gerar miniaturas em falta".`,
          "info",
        );
      }
    },
    [toast],
  );

  const open = themes.find((t) => t.id === openId) ?? null;

  /* ── ANTES DO `if (open)` LÁ EM BAIXO, E NÃO DEPOIS ────────────────────
     Aquilo é um `return` condicional (a vista de UM tema), e um gancho depois
     dele só corre em metade dos desenhos — a ordem dos ganchos parte-se no
     fotograma em que se abre ou fecha um tema. Fica aqui, com os outros.

     A folha de fundir temas fica montada os 200 ms da saída, com os dados
     congelados no instante em que fechou. Ver `useNoEcraAteSair`. */
  const aSairDaFusao = useSaidaDeUmSo(aFundir !== null);
  // Duas chamadas e não um objecto com os dois lá dentro: ver a nota do
  // `useNoEcraAteSair` — um literal novo a cada desenho seria um ciclo.
  const origemDaFusao = useNoEcraAteSair(aFundir !== null, aSairDaFusao, aFundir);
  const temasDaFusao = useNoEcraAteSair(aFundir !== null, aSairDaFusao, themes);

  /**
   * ── AS ACÇÕES DA BIBLIOTECA INTEIRA ────────────────────────────────────
   *
   * As que não são sobre UM tema. Hoje é uma — «Rever etiquetas…», que era um
   * link de texto entre os botões da barra —, e as reticências dizem que abre
   * outra vista em vez de fazer já. [APPLE]
   *
   * Vive aqui em cima, ao lado do `accoesDoTema`, para as duas listas de menu
   * deste ecrã se lerem juntas: quem acrescentar o «Exportar biblioteca…» do
   * documento vê logo onde ele pertence.
   */
  const accoesDaBiblioteca: AccaoDeItem[] = useMemo(
    () => [
      {
        id: "rever-etiquetas",
        rotulo: "Rever etiquetas…",
        icone: (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h10M4 12h10M4 17h6" />
            <path d="m16 15 2 2 4-4" />
          </svg>
        ),
        onAccao: () => setRevendo(true),
      },
    ],
    [],
  );

  /**
   * ── OS PARES QUE ELA NÃO TEM DE ENCONTRAR A OLHO ───────────────────────
   *
   * Sobre a lista TODA e não sobre a filtrada: um par onde só uma das metades
   * corresponde à procura continua a ser um par, e escondê-lo por causa do
   * filtro era transformar o aviso numa coisa que aparece e desaparece
   * consoante o que está escrito no campo. Ver `temas-parecidos.ts`.
   */
  const parecidos = useMemo(() => temasParecidos(themes), [themes]);

  /** O que se sabe sobre o uso dos temas. O ano ainda não vem do servidor —
   *  ver a nota do `ambitosNoEcra`. */
  const dadosDeUso: DadosDeUso = useMemo(() => ({ usos, usosEsteAno: null }), [usos]);

  /**
   * ── OS ÂMBITOS QUE SE MOSTRAM, E O QUE FALTA A UM DELES ────────────────
   *
   * Quatro dos cinco respondem-se com o que este ecrã já tem em mãos. O quinto
   * — «Usados este ano» — precisa de saber QUANDO é que um tema saiu, e o
   * `/api/temas/uso` só devolve QUANTAS vezes (ver `lib/temas-uso.ts`: conta
   * propostas, sem data). Enquanto o servidor não mandar a contagem do ano, o
   * âmbito não aparece — a alternativa era oferecê-lo e devolver a lista toda
   * ou nenhuma, e um filtro que mente ensina a não usar os outros quatro.
   * A conta já está escrita e testada em `lib/temas-filtros.ts`; falta-lhe o
   * número.
   */
  const ambitosNoEcra = useMemo(() => ambitosDisponiveis(themes, dadosDeUso), [themes, dadosDeUso]);
  /** O âmbito escolhido pode deixar de existir por baixo dos pés — desarquivar
   *  o último tema arquivado esvazia «Arquivados». Aí volta-se a «Todos», em
   *  vez de ficar um filtro activo que já não está na barra. */
  const ambitoActivo: Ambito = ambitosNoEcra.some((a) => a.valor === ambito) ? ambito : "todos";

  const visible = useMemo(() => {
    const needle = normalizedThemeName(deferredSearch);
    // O arquivo é uma VISTA, não um filtro que se soma: ou se está a ver o que
    // se usa, ou se está a ver o que se pôs de lado. Misturar os dois era
    // devolver ao ecrã exactamente o que arquivar veio tirar de lá.
    const base = filtrarPorAmbito(themes, ambitoActivo, dadosDeUso);
    const filtrados = needle
      ? // Procurar por nome E por nota: a nota ("tons quentes, para espaços de
        // pedra") é muitas vezes como a Catarina se lembra do tema.
        base.filter((t) => normalizedThemeName(`${t.name} ${t.notes ?? ""}`).includes(needle))
      : base;
    return ordenarTemas(filtrados, ordem, usos);
  }, [themes, deferredSearch, ordem, ambitoActivo, dadosDeUso, usos]);

  /**
   * ── O TAMANHO DA BIBLIOTECA É O ESTADO DA VISTA ────────────────────────
   *
   * Era «204 fotos em 18 temas», uma legenda solta por baixo do campo de
   * procura que descrevia sempre a biblioteca inteira. O
   * `docs/APPLE-TEMAS.md` (ponto 4) manda que passe a estado da vista e que
   * MUDE ao filtrar: «28 temas · 567 fotografias» → «4 temas · 61
   * fotografias». É o âmbito visível dito em números — que é a informação que
   * falta a quem acabou de carregar num filtro e quer saber o que sobrou.
   *
   * E continua a dizer quando alguma pasta não se deixou ler, em vez de a
   * somar como zero: um total calado que encolhe é a maneira mais fácil de
   * alguém concluir que faltam fotos e as voltar a carregar.
   */
  const estadoDaVista = useMemo(() => {
    // A ler, a lista ainda está vazia — e «0 temas · 0 fotografias» é uma
    // afirmação, dita antes de haver resposta. Quem a lê pensa que perdeu tudo.
    if (loading) return "A contar…";
    const { fotos, temas, ilegiveis } = contarFotosDaBiblioteca(visible);
    const base = `${plural(temas, "tema", "temas")} · ${plural(fotos, "fotografia", "fotografias")}`;
    return ilegiveis > 0
      ? `${base} · ${plural(ilegiveis, "pasta não se deixou ler", "pastas não se deixaram ler")}`
      : base;
  }, [visible, loading]);

  // A revisão em lote trabalha sobre a biblioteca TODA, não sobre um tema — é
  // um ecrã irmão da lista, não um separador dentro dela.
  if (revendo) return <BibliotecaRevisao onBack={() => setRevendo(false)} />;

  /**
   * ── A PERGUNTA DE ELIMINAR UM TEMA ────────────────────────────────────
   *
   * Escrita uma vez e posta nos DOIS ramos do desenho: eliminar chega-se tanto
   * da lista como de dentro da pasta aberta, e esse ramo devolve outro
   * componente. Sem isto, a pergunta pedida lá dentro não tinha onde aparecer.
   *
   * ── COM OS NÚMEROS, E NÃO COM UMA PROMESSA GERAL ──────────────────────
   * T3 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`: «uma confirmação que diz
   * quantas fotos e propostas são afectadas». Dizia «as propostas já feitas
   * com estas fotos não são afectadas» — verdade, mas sem número nenhum. Passa
   * a dizer quantas fotografias desaparecem e em quantas propostas o tema
   * está, e porque é que essas não mudam. As frases vêm do `fraseDeEliminar`;
   * só a última, a irreversível, vai a vermelho.
   */
  const frasesDeEliminar = aEliminar
    ? fraseDeEliminar(aEliminar, usos ? (usos[aEliminar.id] ?? 0) : null)
    : null;
  const perguntaDeEliminar = (
    <PerguntaDestrutiva
      aberto={!!aEliminar}
      onFechar={() => setAEliminar(null)}
      titulo={`Eliminar o tema «${aEliminar?.name ?? ""}»?`}
      aviso={
        frasesDeEliminar && (
          <>
            <span className="block text-[var(--bo-text)]">{frasesDeEliminar.fotos}</span>
            {frasesDeEliminar.propostas && (
              <span className="mt-1 block text-[var(--bo-tinta-72)]">
                {frasesDeEliminar.propostas}
              </span>
            )}
            <span className="mt-3 block">Fica 30 dias na Reciclagem, de onde pode voltar.</span>
          </>
        )
      }
      rotuloConfirmar="Eliminar o tema"
      onConfirmar={() => {
        const t = aEliminar;
        setAEliminar(null);
        if (t) void removeTheme(t);
      }}
    />
  );

  if (open) {
    return (
      /* ══════════════════════════════════════════════════════════════════
         O SPLIT VIEW — FASE 06
         ══════════════════════════════════════════════════════════════════

         Ponto 16 da auditoria: «o detalhe é uma página nova com "← Temas" —
         navegação de telemóvel aplicada a um ecrã de desktop». A correcção é
         «lista de temas à esquerda, fotografias à direita; trocar de tema não
         recarrega a página». [APPLE, Split views]

         ── E NÃO RECARREGA MESMO ────────────────────────────────────────
         Nunca houve navegação de página aqui — o `openId` é estado, e a URL
         não muda. O que havia era uma TROCA de ecrã: a grelha de cartões
         desaparecia inteira para a pasta aparecer, e voltar a ela era o único
         caminho para o tema do lado. Agora os dois estão ao mesmo tempo no
         ecrã e trocar de tema é carregar numa linha da esquerda.

         ── PORQUE É QUE O CORTE É O `lg` E NÃO OS 1200 px DO DOCUMENTO ──
         Porque esta casa tem três larguras e só três (`ui/adaptativo.ts`, e o
         `Cortes.contrato.test.ts` que as prende): 640, 1024 e 1440. 1200 não
         é nenhuma delas, e acrescentar uma quarta só para este ecrã é o
         começo dos dois sistemas de cortes que aquele contrato existe para
         evitar. `lg` (1024) é, por definição desta casa, «a partir daqui é
         desktop» — e é também onde a navegação do back office deixa de ser
         gaveta, ou seja onde há mesmo largura em fluxo para uma coluna.

         MEDIDO a 1024: sobram 688 px de conteúdo; a coluna leva 256 e o
         intervalo 16, e ficam 416 px para a zona de largar — 382 úteis, duas
         colunas de 185 px. Acima do piso de 111 px, e acima dos 180 px de
         célula que a fase 07 fixa.

         Abaixo de `lg` a coluna não existe (é `hidden` no `ListaDeTemas`) e a
         pasta ocupa a vista toda, exactamente como ocupava — com o «← Temas»
         no lugar. É a regra da Parte 1 do sistema de design: «a vista compacta
         é adiada o máximo possível».

         ── SEM `--cena` ────────────────────────────────────────────────
         A escada desta vista tem quatro blocos (0,1,2,3) e o tecto são
         quatro (`vistas-que-se-compoem.test.ts`). Este ramo nunca teve
         degrau nenhum e continua a não ter: entrar num tema é uma troca de
         conteúdo, não a apresentação de uma vista nova. */
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-4">
        <ListaDeTemas
          /* A coluna mostra o ÂMBITO à vista — é a mesma lista que a grelha de
             cartões mostrava —, mais o tema aberto quando um filtro o deixou
             de fora. Sem essa ressalva, arquivar o tema em que se está a
             trabalhar apagava-o da coluna e ficava uma lista sem linha activa
             ao lado das fotografias dele. */
          temas={visible.some((t) => t.id === open.id) ? visible : [open, ...visible]}
          activoId={open.id}
          aoEscolher={(id) => {
            if (id !== open.id && podeTrocarDeTema()) setOpenId(id);
          }}
          aoVoltar={() => {
            if (podeTrocarDeTema()) setOpenId(null);
          }}
          aoLargarFotos={largarNoTema}
          aArrastar={aArrastar}
        />
        <div className="min-w-0">
          <ThemeFolder
            key={open.id}
            theme={open}
            usos={usos}
            // A pasta precisa da lista toda para poder oferecer "Copiar para…" — e
            // o cartão do destino tem de somar as fotos que lá chegaram, senão a
            // contagem só se corrige no próximo carregamento da página.
            themes={themes}
            onCopiedTo={(destId, added) =>
              setThemes((prev) =>
                prev.map((t) =>
                  t.id === destId && t.imageCount !== null
                    ? { ...t, imageCount: t.imageCount + added }
                    : t,
                ),
              )
            }
            onBack={() => setOpenId(null)}
            onFolderState={(s) => syncCard(open.id, s)}
            onRename={(name) =>
              setThemes((prev) =>
                prev
                  .map((t) => (t.id === open.id ? { ...t, name } : t))
                  .sort((a, b) => a.name.localeCompare(b.name, "pt")),
              )
            }
            onCover={(coverPath, capa) =>
              setThemes((prev) =>
                prev.map((t) => (t.id === open.id ? { ...comCapa(t, capa), coverPath } : t)),
              )
            }
            accoes={accoesDoTema(open, { naPasta: true })}
            aoArrastar={setAArrastar}
            aoSubir={setASubirFotos}
            pedidoDeMover={pedidoDeMover}
            pedidoAPasta={pedidoAPasta}
            aoServirPedido={pedidoServido}
          />
        </div>
        {perguntaDeEliminar}
      </div>
    );
  }

  // O campo de procura só aparece quando há lista que chegue para justificar
  // um controlo a mais — com três temas, procurar é mais trabalho do que ler.
  // A ler, o campo já lá está (desligado): aparecia só depois de a lista
  // chegar, e a contagem ao lado era empurrada para a linha de baixo a 390 px
  // — MEDIDO como um salto da página. Uma biblioteca com quatro temas ou menos
  // perde-o depois; a dela tem dezenas.
  const searchable = loading || themes.length > 4;

  return (
    <div>
      {/* Segurada montada os 200 ms da saída. O `onClose` continua a correr no
          instante do gesto — o `setAFundir(null)` fecha, o `FolhaOuDialogo`
          devolve o foco e larga o trinco do scroll já —, e o que fica é uma
          imagem a apagar-se com os dados que tinha quando fechou. */}
      {origemDaFusao && temasDaFusao && (
        <FundirTemas
          aberto={aFundir !== null}
          sourceTheme={origemDaFusao}
          themes={temasDaFusao}
          onClose={() => setAFundir(null)}
          onDone={aplicarFusao}
        />
      )}
      {blocked && (
        <Card
          padding="sm"
          className="mb-6 border-[var(--bo-aviso)]/30 bg-[var(--bo-aviso-lavagem)]/60"
        >
          {/* O título vem da causa: dizer "Falta um passo de instalação" a quem
              tem é o projecto em pausa manda-a correr o schema por nada. */}
          <p className="bo-eyebrow mb-1.5 text-[var(--bo-aviso)]">{blocked.titulo}</p>
          <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">{blocked.texto}</p>
        </Card>
      )}

      {/* ── A ESCADA DESTA VISTA ────────────────────────────────────────────
          QUATRO blocos, pela ordem de leitura: os controlos (0), os filtros
          (1), o aviso dos nomes por arrumar (2) e a grelha dos temas (3). A
          escada é a da casa (`.bo-cena` no `globals.css`) — 600 ms, degraus de
          20 ms, tecto ao sexto, desligada em `prefers-reduced-motion`.

          ── E O DEGRAU NOVO NÃO SE ACRESCENTA NO FIM ─────────────────────────
          Os filtros nasceram com `--cena: 0`, a partilhar a vez com os
          controlos, e o `vistas-que-se-compoem.test.ts` chumbou — «há blocos a
          partilhar a mesma vez: 0, 0, 1, 2». Não é cosmético: dois blocos a
          entrar no mesmo instante lêem-se como UM bloco, e a escada existe
          justamente para o olho seguir a ordem de leitura.

          Um bloco que entra a meio da página empurra os degraus abaixo dele.
          Contar de cima e renumerar é o preço; pô-lo no fim, longe de onde se
          lê, era pior — a entrada deixava de acompanhar os olhos. */}
      <Toolbar
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena mb-6"
        start={
          /* ── O CAMPO E O ESTADO DA VISTA, NA MESMA LINHA E NA MESMA BASE ──
             Pedido dela, na Fase 3: «"395 fotos em 25 temas" está órfão». Era
             filho da caixa `relative` que ancora a lupa — herdava a largura do
             campo e lia-se como se descrevesse o que lá estava escrito.

             Agora é IRMÃO do campo e ao LADO dele, não por baixo: o
             `docs/APPLE-TEMAS.md` (ponto 4) manda que a contagem seja o estado
             da vista, «ao lado do campo, em role="status" aria-live="polite"»,
             e que mude ao filtrar. Um estado é uma coisa que se lê de relance
             na mesma linha dos controlos; uma legenda pendurada por baixo é
             uma nota de rodapé.

             A DESCRIÇÃO DA SECÇÃO SAIU («Guarda aqui as fotos por tema…»):
             ponto 3 da auditoria — quem entra na secção Temas sabe o que são
             temas, e a descrição estava a ocupar a linha de maior destaque.

             `basis-72 grow-0` no campo: a largura decide-se pela fila onde ele
             está, não pela janela, e a `Toolbar` já é `flex flex-wrap`. A 375 px
             a fila parte-se e o estado desce para baixo do campo sozinho.

             E `w-72`, não `w-full`. MEDIDO num browser a 1440: com `w-full`, o
             Chrome contava o campo pela largura natural do `input` (~245 px)
             ao medir a fila, e depois desenhava-o com os 288 do `basis-72` —
             a fila ficava 43 px mais curta do que o que lá cabia, e o estado
             caía para baixo do campo com toda a largura da janela livre ao
             lado. Com a largura dita, a fila mede 437 e o estado fica ao lado,
             na mesma linha dos 40 px dos controlos da direita.

             ── UMA ALTURA SÓ NA BARRA INTEIRA: 40 px ───────────────────────
             Ponto 5 da auditoria: o campo «alinhado na mesma linha e na mesma
             baseline dos outros controlos». CONTADO pelas classes, com rato
             (não medido num browser): campo 42 px (`py-2.5` + `text-sm` +
             fio), ordenação 34 a 38 (duas cadeias de `py` na mesma classe),
             tamanho dos cartões 34, «⋯» 36, «Novo tema» 32 — cinco
             controlos, quatro ou cinco alturas. Passam todos a `h-10`, que é
             o degrau `md` do `ui/Button` (`h-10 pointer-coarse:h-11`) e o
             tamanho por omissão da casa. Os 32 do `sm` seriam o outro degrau que existe,
             e ficaram de fora por uma razão que ganha ao documento: «alvo
             efetivo ≥ 40 px em desktop» (Parte 9.1 do sistema de design;
             «Alvos ≥ 40 px» na Parte 7 do dos temas). No dedo continuam os 44
             de sempre — o `input` pela regra do `globals.css`, a ordenação
             pelo `pointer-coarse:min-h-11` do `Escolha`, os botões pelo
             `.alvo-toque` e pelo `pointer-coarse:h-11` do `Button`. */
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {searchable && (
              // O campo só aparece quando há lista que chegue para justificar
              // um controlo a mais — com três temas, procurar é mais trabalho
              // do que ler.
              <div className="relative w-72 max-w-full basis-72 grow-0">
                {SearchIcon}
                {/* ── «PROCURAR TEMAS», E NÃO «… E FOTOGRAFIAS» ─────────────
                    A Parte 6 do documento propõe «Procurar temas e
                    fotografias». Esta procura só lê o NOME e as NOTAS do tema
                    (ver o `visible`, mais acima); uma fotografia não tem texto
                    por onde se ache. Prometer fotografias era um campo que
                    mente na primeira vez que se usa — fica a metade
                    verdadeira, no plural, que é o que a lista mostra.

                    ── E O RAIO DOS CONTROLOS, 10 px ────────────────────────
                    Ponto 5: «campo de pesquisa a 10 px, como tudo o resto» —
                    mini a medium são rectângulos arredondados, cápsula só em
                    large. O `.bo-input` desenha o raio com `var(--bo-radius)`
                    (8 px, o do CONTEÚDO) numa regra fora de camadas, que
                    ganharia a qualquer `rounded-*`. Em vez de a vencer com um
                    `!important`, redefine-se a variável que ela lê, só neste
                    elemento, para o token do controlo (`--radius-control`,
                    `tema.css`). A ordenação ao lado recebe o mesmo. */}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar temas"
                  aria-label="Procurar tema por nome ou nota"
                  disabled={loading}
                  className="bo-input h-10 pl-10 pr-3 text-sm text-[var(--bo-text)] placeholder-foreground/30 [--bo-radius:var(--radius-control)]"
                />
              </div>
            )}
            {/* O ESTADO DA VISTA. `aria-live="polite"` e não `assertive`:
                muda a cada tecla escrita na procura, e um leitor de ecrã a
                interromper-se a si próprio a cada letra não deixa ouvir nem o
                campo nem a contagem. */}
            <p
              role="status"
              aria-live="polite"
              // O nome distingue esta região da do `ToastProvider`, que também
              // é um `role="status"` e vive na mesma página: sem ele, quem
              // navega por regiões encontra duas «status» e não sabe qual é
              // qual.
              aria-label="Temas à vista"
              className="bo-text-muted text-xs"
            >
              {estadoDaVista}
            </p>
          </div>
        }
        end={
          /* SEM CAIXA À VOLTA, e é isso que corrige a vista no telemóvel.
             Esta fila estava embrulhada num `div.flex items-center gap-2` —
             uma cópia do que o `Toolbar` já põe à volta do `end`, mas SEM o
             `flex-wrap` dele. Uma fila que não quebra não encolhe: pedia
             591 px num ecrã de 390, esticava o documento para 607, e a barra
             de navegação de baixo (que é `w-full`) nascia com 607 px de
             largura e o topo 413 px abaixo do fundo do ecrã — nesta vista
             ficava-se sem navegação nenhuma. Tirar a caixa devolve a fila ao
             contentor que sabe quebrá-la; medido, o documento volta aos
             390 px. Ver `e2e/geometria-dos-alvos.spec.ts` (D4). */
          /* ══════════════════════════════════════════════════════════
             OS CONTROLOS AGRUPADOS PELO QUE FAZEM
             ══════════════════════════════════════════════════════════

             Pedido dela, na Fase 3: «os controlos estão todos alinhados sem
             agrupamento».

             Estavam: cinco controlos em fila, todos com a mesma folga entre
             si — a ordenação, «Rever etiquetas», «Arquivados», o tamanho dos
             cartões e «Novo tema». Espaçamento igual quer dizer «isto é uma
             lista de cinco coisas sem relação», e não era verdade: três deles
             mudam COMO a lista se vê, um muda O QUE ela contém, e dois FAZEM
             alguma coisa.

             O agrupamento é feito com folga e não com linhas divisórias, de
             propósito: uma linha vertical entre grupos parte-se assim que a
             fila quebra no telemóvel — e ela quebra sempre. A folga quebra
             bem. Dentro de um grupo `gap-1.5`; entre grupos, `gap-x-5`. A
             razão entre as duas é o que se lê.

             (A fila não leva caixa própria: o `Toolbar` já dá uma ao `end`, e
             uma segunda por dentro custou-lhe uma vez a navegação inteira no
             telemóvel — ver a nota acima e o `geometria-dos-alvos.spec.ts`.) */
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* ── VER: como a lista se mostra ─────────────────────────── */}
            {themes.length > 2 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Era um `<label>` a embrulhar o `<select>`, com o nome num
                    `sr-only` lá dentro. Um rótulo implícito nomeia um `<select>`
                    porque ele é nativo; NÃO nomeia um `role="combobox"`, que
                    recebe o nome do autor. Ficava um campo sem nome nenhum para
                    quem ouve o ecrã — e sem ninguém dar por isso. */}
                <div className="flex items-center">
                  <Escolha
                    aria-label="Ordenar os temas"
                    valor={ordem}
                    aoMudar={(v) => {
                      const o = v as Ordem;
                      setOrdem(o);
                      guardarOrdem(o);
                    }}
                    containerClassName="w-auto"
                    /* A altura e o raio da barra — ver a nota «UMA ALTURA SÓ»
                       no campo de procura. `py-0` porque quem manda é o
                       `h-10`, e o preenchimento da pele só tirava espaço ao
                       texto. */
                    className="h-10 py-0 pl-3 text-xs text-[var(--bo-tinta-72)] [--bo-radius:var(--radius-control)]"
                  >
                    {/* «Mais usados» e «Menos usados» só entram quando a
                        contagem de propostas chegou — ver `ORDENS`. Oferecer
                        uma ordem que ainda não sabe ordenar era pedir-lhe que
                        carregasse e não visse mexer nada. */}
                    {ORDENS.filter((o) => usos || !ORDENS_DE_USO.includes(o.valor)).map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </Escolha>
                </div>
                <div
                  role="group"
                  aria-label="Tamanho dos cartões"
                  /* `min-h-10`, e os botões esticam: a moldura de 1 px
                     está DENTRO dos 40, como nos outros controlos da fila.

                     `hidden sm:flex` (9/11): abaixo de 640 px as duas
                     densidades dão a MESMA grelha de duas colunas (ver
                     `COLUNAS`) — o botão não mudava nada no telemóvel, e
                     empurrava o «⋯» e o «Novo tema» para uma terceira linha. */
                  className="hidden min-h-10 sm:flex overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)]"
                >
                  {(
                    [
                      ["compacto", "Compacto"],
                      ["confortavel", "Confortável"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={densidade === valor}
                      onClick={() => {
                        setDensidade(valor);
                        guardarDensidade(valor);
                      }}
                      className={`alvo-toque px-3 text-[10px] uppercase tracking-[0.12em] ${ESTADO} ${PRESSAO} ${
                        densidade === valor
                          ? "bg-[var(--bo-tinta-6)] text-[var(--bo-tinta-72)]"
                          : "text-foreground/40 hover:text-[var(--bo-text-muted)]"
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── FAZER ───────────────────────────────────────────────────
                Era «Rever etiquetas» em `ghost` ao lado de «Novo tema»: um
                link de texto entre botões de barra, que é a última linha das
                proibições da Parte 9 do `docs/APPLE-TEMAS.md` — uma acção de
                manutenção rara com o mesmo peso visual dos controlos de vista.

                Passa para dentro do «⋯», que é onde a Apple põe o que se faz
                de vez em quando («máximo três grupos de controlos numa
                toolbar»). Fica com um item só, e é assim que se quer: é a
                gaveta que espera pelo «Fundir temas…» e pelo «Exportar
                biblioteca…» do documento, e um item numa gaveta é melhor do
                que um item a competir com a acção que ela faz todos os dias.

                ── E PORQUE É QUE NÃO É UM `MenuDeAccoes` ───────────────────
                Porque esse esconde-se em repouso onde há rato
                (`com-rato:opacity-0` + `group-hover`), que é exactamente o que
                o torna certo EM CIMA DE UM CARTÃO e errado numa barra: sem um
                `group` à volta, o «⋯» ficaria invisível e «Rever etiquetas»
                deixava de ser encontrável. O painel é o mesmo — o mesmo
                material, os mesmos itens, a mesma lista de `AccaoDeItem` —,
                aberto no `MenuDeContexto`, que é o menu deste ecrã. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu?.de === "barra"}
                aria-label={`Acções de ${MENU_DA_BIBLIOTECA}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  // Ancorado ao canto inferior esquerdo do botão: o painel
                  // desce dele como desceria de um «⋯» de cartão, e o
                  // `MenuDeContexto` encosta-o para dentro se não couber.
                  setMenu({
                    x: r.left,
                    y: r.bottom + 4,
                    de: "barra",
                    sobre: MENU_DA_BIBLIOTECA,
                    accoes: accoesDaBiblioteca,
                  });
                }}
                className={`alvo-toque flex h-10 w-10 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] ${ESTADO} ${PRESSAO}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              <Button
                variant={adding ? "secondary" : "primary"}
                // `md` e não `sm`: os 40 px da fila — ver «UMA ALTURA SÓ».
                size="md"
                iconLeft={adding ? undefined : PlusIcon}
                onClick={() => setAdding(!adding)}
              >
                {adding ? "Cancelar" : "Novo tema"}
              </Button>
            </div>
          </div>
        }
      />

      {/* ══════════════════════════════════════════════════════════════════
          OS ÂMBITOS — «"por usar" É METADADO SEM FILTRO»
          ══════════════════════════════════════════════════════════════════

          Ponto 12 da auditoria do `docs/APPLE-TEMAS.md`: a informação mais
          accionável da grelha — que temas nunca saíram numa proposta — estava
          escrita em cada cartão e não havia forma de filtrar por ela. «É o
          padrão da app Fotografias e é o que transforma esta página de
          catálogo em ferramenta.»

          ── A FILA PENSADA A 375 ─────────────────────────────────────────
          Cinco âmbitos com contagem não cabem numa linha de 375 px, e uma
          barra que não quebra não encolhe — foi o que já custou a esta vista
          a navegação inteira no telemóvel (ver a nota do `end` da barra).
          Por isso é `flex-wrap`: parte-se em duas ou três linhas e nenhum
          rótulo sai do ecrã. Os chips são os da casa, à letra os mesmos que o
          interruptor «Arquivados» usava antes de ser um deles.

          ── E NÃO ANIMA ──────────────────────────────────────────────────
          «Nunca animes a mudança de filtro» (Parte 5) — é uma interação de
          alta frequência. O conteúdo troca em silêncio: a grelha não leva
          `key` nova nem entrada, só passa a ter outros filhos.

          Só aparece com dois âmbitos ou mais: com um só, seria um controlo a
          explicar uma funcionalidade que ainda não tem o que mostrar. */}
      {ambitosNoEcra.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar os temas"
          style={{ "--cena": 1 } as React.CSSProperties}
          className="bo-cena mb-5 flex flex-wrap items-center gap-1.5"
        >
          {ambitosNoEcra.map((a) => (
            <button
              key={a.valor}
              type="button"
              aria-pressed={ambitoActivo === a.valor}
              onClick={() => setAmbito(a.valor)}
              className={`alvo-toque rounded-lg border px-3 py-2 text-[10px] uppercase tracking-[0.12em] ${ESTADO} ${PRESSAO} ${
                ambitoActivo === a.valor
                  ? "border-foreground/20 bg-[var(--bo-tinta-6)] text-[var(--bo-tinta-72)]"
                  : "border-[var(--bo-hairline-strong)] text-foreground/40 hover:text-[var(--bo-text-muted)]"
              }`}
            >
              {a.rotulo}
              {/* A contagem é do ÂMBITO e não da procura — ver
                  `contarPorAmbito`. `tabular-nums` para os números não
                  dançarem de largura quando sobem de 9 para 10. */}
              <span className="ml-1.5 tabular-nums opacity-70">{a.contagem}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── OS NOMES POR ARRUMAR ──────────────────────────────────────────
          A `SugestaoDeNome` abaixo só aparece enquanto se ESCREVE um nome — e
          um tema baptizado há seis meses nunca mais passa por esse campo. Era
          por isso que o «Seatings Plans» continuava lá com o corrector a saber,
          desde sempre, que devia ser «Seating Plans».

          Aparece só quando há alguma coisa a arrumar; com a biblioteca em ordem
          não se vê nada. */}
      {/* Segundo degrau numa caixa à volta: a `NomesPorArrumar` devolve `null`
          quando não há nada a arrumar, e o `empty:hidden` faz esta caixa
          desaparecer com ela em vez de ficar um degrau a animar o vazio. */}
      <div style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena empty:hidden">
        <NomesPorArrumar themes={themes} onRenomear={renomearDaLista} />
      </div>

      {adding && (
        <Card padding="sm" className="@container mb-6">
          {/* Duas colunas quando o CARTÃO as comporta, não quando a janela as
              comporta. Era `sm:grid-cols-2`, e o cartão não tem a largura da
              janela: tira-lhe o `px` da vista e os 34 px da moldura e do `p-4`
              dele, e a partir de `lg` mais os 256 px da barra lateral. O
              limiar em contentor que reproduz o corte de hoje é 36rem — 576 px
              de cartão dão duas colunas de 280 px, que é o que ele já dava a
              640 px de janela —, com a diferença de continuar a valer se este
              cartão alguma vez for para uma coluna estreita. */}
          <div className="grid grid-cols-1 gap-4 @min-[36rem]:grid-cols-2">
            <div>
              <Field
                label="Nome do tema"
                required
                maxLength={MAX_THEME_NAME}
                value={newName}
                disabled={saving}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Terracotta, Itália, Branco & Verde"
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
              />
              {/* A sugestão de grafia, no momento em que a atenção já está no
                  campo. Depois de gravar é tarde: o nome fica no índice por
                  onde ela procura. */}
              <SugestaoDeNome valor={newName} onAceitar={setNewName} />
            </div>
            <Field
              label="Nota (opcional)"
              maxLength={MAX_THEME_NOTES}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ex.: tons quentes, para espaços de pedra"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={create} loading={saving} disabled={!newName.trim() || saving}>
              Criar tema
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        // Os esqueletos da espera NÃO levam degrau: um esqueleto é a espera, e
        // não a apresentação do que chegou.
        <div className={`grid ${COLUNAS[densidade]}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bo-skeleton aspect-[4/3] rounded-tile" aria-hidden />
          ))}
          <p className="sr-only">A carregar temas…</p>
        </div>
      ) : blocked && themes.length === 0 ? null : themes.length === 0 ? (
        /* A lista vazia POR AVARIA não é uma lista vazia, e é por isso que o
           ramo de cima corta aqui. O cartão do topo já diz que a leitura
           falhou; deixar correr esta cascata punha por baixo dele «Ainda não há
           temas» — ou, com o filtro de arquivados, «Todos os temas estão
           arquivados» —, que é exactamente o susto que se está a corrigir: o
           ecrã a afirmar sobre os dados dela uma coisa que não sabe. */
        <Card padding="none">
          <EmptyState
            icon={FolderIcon}
            title="Ainda não há temas"
            description="Cria um tema por estilo que usas nos casamentos — Itália, Terracotta, Branco & Verde — e carrega lá as fotos de inspiração. Depois é só escolher na proposta."
            // Com o formulário já aberto, este botão seria um segundo "Criar
            // tema" no mesmo ecrã — a apontar para o campo que está mesmo ali.
            action={adding ? undefined : { label: "Criar tema", onClick: () => setAdding(true) }}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="sm">
          {/* ── FILTRO SEM RESULTADOS ≠ BIBLIOTECA VAZIA ─────────────────
              Ponto 14 da auditoria, e são três frases diferentes porque são
              três situações diferentes: não há nada escrito e o âmbito está em
              «Todos» (então está tudo arquivado), há procura escrita (e a
              frase cita o que se procurou), ou o âmbito é que não tem nada.
              As duas últimas têm saída — «Limpar filtros» —, porque uma
              mensagem sem saída obriga a adivinhar qual dos dois controlos é
              que está a esconder os temas. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="bo-text-muted text-sm">
              {search.trim()
                ? `Nenhum tema corresponde a “${search.trim()}”.`
                : ambitoActivo !== "todos"
                  ? `Nenhum tema em “${AMBITOS.find((a) => a.valor === ambitoActivo)?.rotulo}”.`
                  : "Todos os temas estão arquivados. Abre “Arquivados” para os repor."}
            </p>
            {(search.trim() || ambitoActivo !== "todos") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAmbito("todos");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </Card>
      ) : (
        /* Terceiro degrau na GRELHA e não em cada cartão: vinte e cinco temas a
           entrar um a um seria a lentidão que o tecto do sexto degrau existe
           para evitar. A grelha chega inteira. */
        <div
          style={{ "--cena": 3 } as React.CSSProperties}
          /* ── O BOTÃO DIREITO NO VAZIO DA GRELHA ─────────────────────────
             «Em área vazia da grelha, oferece "Novo tema".» (ponto 8 da
             auditoria.) O `defaultPrevented` é o que distingue o vazio de um
             cartão: o cartão trata o seu próprio menu e já chamou
             `preventDefault` antes de o evento subir até aqui. Sem essa
             pergunta, carregar com o botão direito num cartão abria dois
             menus — o dele e este por cima. */
          onContextMenu={(e) => {
            if (e.defaultPrevented) return;
            e.preventDefault();
            setMenu({
              x: e.clientX,
              y: e.clientY,
              sobre: MENU_DA_BIBLIOTECA,
              accoes: [
                {
                  id: "novo-tema",
                  rotulo: "Novo tema",
                  icone: PlusIcon,
                  onAccao: () => setAdding(true),
                },
                ...accoesDaBiblioteca,
              ],
            });
          }}
          className={`bo-cena grid ${COLUNAS[densidade]}`}
        >
          {visible.map((t) => (
            /* As acções são IRMÃS do botão do cartão, não filhas: um botão
               dentro de outro botão é HTML inválido, e o resultado prático é
               que fixar um tema abria-o a seguir. */
            <div
              key={t.id}
              role="group"
              aria-label={t.name}
              /* ── O BOTÃO DIREITO ABRE O MESMO MENU DO «⋯» ────────────
                 Ponto 8 da auditoria: «numa coleção, o botão direito é
                 obrigatório». A lista é literalmente a mesma chamada —
                 `accoesDoTema(t)` —, e é essa igualdade que o ponto 9 exige
                 («abre o MESMO menu do botão direito»). Ver `MenuDeContexto`.

                 No contentor e não no botão do cartão: o «⋯», a nota do tema
                 parecido e a capa são todos deste tema, e carregar com o botão
                 direito em qualquer um deles é a mesma pergunta. */
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, sobre: t.name, accoes: accoesDoTema(t) });
              }}
              className="group relative"
            >
              {/* ══ UM BOTÃO SÓ SOBRE A FOTOGRAFIA ═══════════════════════
                  Ponto 9 da auditoria do `docs/APPLE-TEMAS.md`: «três botões
                  circulares cinzentos aparecem sobre a fotografia no hover…
                  sem rótulo, com ícones ambíguos». A correcção é «UM botão
                  discreto ⋯ no canto superior direito, que abre o mesmo menu
                  do botão direito» — e a Parte 9 proíbe, à letra, «mais de um
                  botão flutuante sobre uma miniatura».

                  Aqui havia dois desenhos: com rato, a lista `accoesDoTema`
                  percorrida em chips soltos; sem rato, um «⋯». Passa a ser o
                  «⋯» nos dois — a mesma lista, um só desenho, e o cartão
                  deixa de ter duas linguagens conforme o ponteiro.

                  MEDIDO a 375×667 com dedo: os chips tapavam 55,6 % da largura
                  de um cartão de 165,5 px (dois alvos de 44) e agora tapam
                  26,6 % (um).

                  ── E A ESTRELA NÃO SE PERDEU ────────────────────────────
                  O chip do favorito ficava SEMPRE visível de propósito: aceso,
                  era ele que dizia que o tema está fixado. Tirar o chip sem
                  mais nada apagava essa informação — por isso ela desce para o
                  rasto de números do cartão, como bandeira, que é onde o
                  desenho do `ThemeCard` da Parte 3 do documento a põe («14
                  fotos · 1 proposta · ⚑»). O que era um botão a dizer duas
                  coisas passa a um botão (no menu) e um sinal (na linha).

                  O «⋯» esconde-se em repouso só onde há rato — é o coração do
                  `MenuDeAccoes` — e volta com o rato sobre o cartão ou com o
                  foco de teclado nele. Onde não há rato está sempre visível. */}
              {/* O `absolute` vai NESTA caixa e não no `MenuDeAccoes`: ele
                  dá-se a si mesmo um `relative` (é o que ancora a gaveta) e,
                  entre dois utilitários de `position` na mesma classe, quem
                  ganha é a ordem do Tailwind e não a ordem em que estão
                  escritos. MEDIDO antes de os separar: o menu esticava-se aos
                  165,5 px do cartão inteiro. */}
              {/* `right-1 top-1` e não `right-2 top-2`: o que se põe no
                  canto é o ALVO de 40 px, e a pastilha de 28 fica 6 px para
                  dentro dele — o círculo que se vê assenta a 10 px das
                  arestas, dentro do arco do canto do cartão. */}
              <div className="absolute right-1 top-1 z-10">
                <MenuDeAccoes
                  sobre={t.name}
                  accoes={accoesDoTema(t)}
                  /* ── 28 px À VISTA, 40 px DE ALVO ───────────────────────
                     «Botão glass, 28px» (Parte 3) e «o `⋯` sobre a imagem tem
                     28 px visuais e 40 px de alvo» (Parte 7). Era o «⋯» de
                     linha, 44 × 44, com o vidro na caixa de fora — um círculo
                     escuro de 44 px por cima da capa, um quarto da largura de
                     um cartão compacto. O tamanho é uma opção do próprio
                     `MenuDeAccoes` (`tamanho="pequeno"`), e não classes por
                     cima das dele. No dedo o `.alvo-toque` leva o alvo aos 44.

                     ── O VIDRO CLARO VIAJA DENTRO DO BOTÃO ────────────────
                     O «⋯» pousa EM CIMA de uma fotografia, e o `MenuDeAccoes`
                     traz tinta de texto normal (`--bo-text-muted`) — que sobre
                     uma capa clara desaparece. A conta já estava feita para os
                     chips que aqui estavam e não se refaz: `.bo-vidro-claro`,
                     véu de 50% mais vidro a 10%, sem filtro, glifo a branco,
                     3,35:1 sobre a pior fotografia (a conta inteira está no
                     `globals.css`). Sem desfoque de propósito — um por cartão
                     eram noventa numa biblioteca de trinta.

                     Vivia na caixa de fora, que tinha de repetir à mão as
                     variantes de esconder do botão (senão ficava um círculo
                     escuro em repouso com o glifo invisível lá dentro). Agora
                     é a `pastilha`, DENTRO do botão: esconde-se e mostra-se
                     com o mesmo `opacity` do glifo, incluindo com o foco de
                     teclado no cartão (o `group-focus-within` do
                     `MenuDeAccoes`), e não há duas listas para manter
                     iguais. */
                  tamanho="pequeno"
                  pastilha="bo-vidro-claro text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                /* ── O RATO POUSA, AS FOTOS COMEÇAM A VIR ─────────────────
                   «Prefetch on hover: passar o rato sobre um tema começa a
                   carregar as suas fotos.» Abrir um tema são duas esperas em
                   fila — a listagem da pasta e só DEPOIS as miniaturas —, e
                   enquanto a primeira não volta a grelha nem tem endereços
                   para pedir. O rato costuma pousar um segundo antes do
                   clique, e esse segundo chega.

                   Só com rato: num telemóvel não há «passar por cima», há
                   tocar — e tocar já abre. Ver `adiantarTema`. */
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") adiantarTema(t.id);
                }}
                onFocus={() => adiantarTema(t.id)}
                /* ── O MENU SEM RATO: Shift+F10 E A TECLA DE MENU ─────────
                   O botão direito tem o seu equivalente de teclado, e é este
                   (o mesmo de qualquer sistema). Abre o MESMO menu, ancorado
                   ao canto de baixo do cartão; ao fechar, o foco volta ao
                   cartão (`MenuDeContexto`). */
                onKeyDown={(e) => {
                  if (!teclaDeMenu(e)) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ x: r.left, y: r.bottom, sobre: t.name, accoes: accoesDoTema(t) });
                }}
                /* ── SOMBRA, E NÃO BORDA ──────────────────────────────────
                   Ponto 11 da auditoria: «cartões delimitados por borda em vez
                   de sombra. Em modo claro a elevação faz-se por sombra.» E a
                   Parte 9 proíbe «borda a marcar elevação». Era um fio de 10 %
                   em repouso que ganhava o acento sob o rato; passa a sombra de
                   repouso que se ergue sob o rato — o único efeito de hover de
                   um cartão (Parte 12.1 do sistema de design), sem `scale`. O
                   `ESTADO` já anima `box-shadow` nos 150 ms do degrau
                   interactivo, com a `--ease-interactive`: é a linha «Hover do
                   cartão» da tabela da Parte 5, sem tempo novo nenhum. Os dois
                   tokens e a razão de existirem estão no `globals.css`. Em
                   escuro a sombra quase não se vê, e é a regra: lá quem separa
                   é a luminosidade (`--bo-surface` sobre `--bo-chao`).

                   O raio é o `--radius-tile`, 12 px: era `rounded-2xl` (os 20
                   do degrau «painel»), o documento pedia 12 e o cartão da casa
                   diz 16. A escolha não era deste ficheiro — foi dela: «sim à
                   sombra, cantos a 12». O token e a razão estão no `tema.css`.

                   `h-full`: a célula da grelha já estica à altura da fila
                   (`align-items: stretch`), mas o cartão dentro dela não a
                   seguia. Com o rasto de números a poder ocupar duas linhas,
                   «todos os cartões da mesma fila têm a mesma altura»
                   (critério 2 da Parte 8) só se cumpre se o cartão encher a
                   célula — medido a 1440, a primeira fila tinha fundos a 508,
                   523 e 525 px.

                   `flex flex-col` (9/11): um `<button>` CENTRA o que tem dentro
                   na vertical. Com o `h-full` a esticar todos à altura do mais
                   alto da fila, os cartões mais baixos punham a fotografia uns
                   9 px abaixo do topo — uma faixa branca por cima da capa em
                   uns cartões e não noutros. Em coluna, o conteúdo fica
                   encostado ao topo e a sobra vai para o fundo. */
                className={`flex h-full w-full flex-col items-stretch justify-start overflow-hidden rounded-tile bg-[var(--bo-surface)] text-left shadow-[var(--bo-sombra-repouso)] hover:shadow-[var(--bo-sombra-erguida)] ${ESTADO} ${PRESSAO}`}
              >
                {/* A moldura é 4:3 SEMPRE, aconteça o que acontecer lá dentro: é
                  ela que mantém a primeira linha alinhada quando as fotos têm
                  proporções diferentes umas das outras. */}
                {/* ══════════════════════════════════════════════════════
                    UMA FOTOGRAFIA, INTEIRA
                    ══════════════════════════════════════════════════════

                    Decisão dela na Fase 2: uma imagem por cartão.

                    Aqui havia a capa e, encostada à direita, uma tira com mais
                    três fotos do tema — «uma capa só diz o que é a foto de
                    capa; três fotos dizem o que é o TEMA». A ideia estava
                    certa; o desenho é que não chegava lá: na grelha compacta a
                    tira tinha 41 px de largura e cada foto ~41 × 33. Pequena de
                    mais para se ler como uma fotografia — o que se via era
                    textura no canto do cartão, e a capa ficava com três quartos
                    do espaço.

                    O conjunto continua dito, noutro sítio e melhor: «9 fotos»
                    no rasto de números, que custa uma linha de texto em vez de
                    um quarto da imagem, e a grelha inteira ao abrir o tema, que
                    é onde se escolhe.

                    A moldura é 4:3 SEMPRE: é ela que mantém a primeira linha
                    alinhada quando as fotos têm proporções diferentes. */}
                {/* ══════════════════════════════════════════════════════
                    NUNCA UM CARTÃO VAZIO
                    ══════════════════════════════════════════════════════

                    T1 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`: «muitos cartões
                    sem capa ao fim de 5 s — a página parece partida».

                    Por baixo da fotografia fica SEMPRE o lugar pintado com a
                    cor dela (`EsqueletoDeCor`, com a `coverCor` que vem no
                    resumo): enquanto a capa viaja, vê-se a cor certa; e se as
                    duas fontes falharem, a imagem sai (`ImagemComPlanoB`) e a
                    cor fica. Sem cor gravada é o esqueleto cinzento.

                    Um tema COM fotos e SEM `coverUrl` — o Storage estourou os
                    8 s da lista, ou a capa não se deixou assinar — já não
                    mostra o ícone de pasta: mostra o lugar, com a cor quando
                    a há e o fundo neutro da moldura quando não (sem o brilho
                    a passar: aí não há nada a caminho, e o brilho diria que
                    há). O ícone fica para o que ele diz, uma pasta vazia
                    (`imageCount` 0).

                    A fotografia leva `relative` para ficar POR CIMA do lugar,
                    que é `absolute`; o `!` vence a `.bo-skeleton`, que está
                    fora de camadas e traz o seu próprio `position` e raio. */}
                <div
                  data-capa-do-tema={t.id}
                  className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bo-tinta-6)]"
                >
                  {t.imageCount === 0 ? (
                    <div
                      data-pasta-vazia
                      className="flex h-full w-full items-center justify-center text-foreground/40"
                    >
                      {FolderIcon}
                    </div>
                  ) : t.coverUrl || t.coverCor ? (
                    <EsqueletoDeCor cor={t.coverCor} className="!absolute inset-0 !rounded-none" />
                  ) : null}
                  {t.coverUrl && t.imageCount !== 0 && (
                    <ImagemComPlanoB
                      src={t.coverUrl}
                      avif={t.coverAvif}
                      planoB={t.coverFallbackUrl}
                      lqip={t.coverLqip}
                      /* ── SEM `scale` NO HOVER ──────────────────────────
                         Era `group-hover:scale-[1.02]` na capa. A Parte 9 do
                         `docs/APPLE-TEMAS.md` proíbe `scale` no hover de
                         cartões de grelha, e a Parte 3 repete-o com a razão
                         («sobrepõe os vizinhos»). Aqui a capa está dentro de
                         uma moldura `overflow-hidden`, portanto não chegava a
                         tapar o vizinho — o que fazia era mexer a fotografia
                         debaixo do ponteiro em cada passagem de rato, numa
                         grelha de 28 cartões que se percorre com o rato.

                         O que sinaliza o hover continua a ser a moldura a
                         ganhar o acento, no botão aqui em baixo. */
                      className="relative h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="px-3 py-2.5">
                  {/* ══════════════════════════════════════════════════════
                      O NOME NÃO SE CORTA
                      ══════════════════════════════════════════════════════

                      Palavras dela: «os títulos longos são cortados».

                      Era `truncate`, ou seja uma linha e reticências. O nome é
                      a ÚNICA coisa por que ela procura um tema — «Clássico
                      Intemporal (Branco/dourado)» virava «Clássico Intempor…»,
                      e dois temas parecidos ficavam indistinguíveis
                      exactamente no sítio onde é preciso distingui-los.

                      Duas linhas, e a altura reservada mesmo quando só se usa
                      uma: sem isso, um cartão de nome curto ficava mais baixo
                      do que o vizinho e a grelha perdia a linha de base. Ao
                      fim de duas linhas ainda pode cortar — mas aí já se leu o
                      que distingue. */}
                  {/* O `title` é a dica que o ponto 10 pede para quando o
                      nome corta ao fim das duas linhas: «título com altura
                      reservada de duas linhas, com tooltip quando trunca».
                      Vai sempre, e não só quando corta — saber SE corta exige
                      medir o nó depois de desenhado, e uma dica que repete o
                      nome que está à vista não incomoda ninguém. */}
                  {/* ── O TIPO DA CASA, E NÃO UM NÚMERO ESCRITO À MÃO ──────
                      Era `text-[14px] leading-snug`. O `ThemeCard` da Parte 3
                      pede «headline/600», e o mapeamento da Parte 6.3 do
                      sistema de design diz o mesmo de qualquer «nome em
                      lista». O `text-headline` traz tamanho, entrelinha e
                      peso de uma vez (15/22, 600). A altura reservada passa a
                      ser DUAS ENTRELINHAS do token — `min-h-11` = 2,75rem =
                      2 × 1,375rem —, e não 2,7em, que com a entrelinha nova
                      já não chegava às duas linhas e voltava a desalinhar a
                      fila. */}
                  <p
                    title={t.name}
                    className="line-clamp-2 min-h-11 text-headline text-[var(--bo-text)]"
                  >
                    {t.name}
                  </p>
                  {/* ══════════════════════════════════════════════════════
                      UMA LINHA DE NÚMEROS, E NÃO TRÊS
                      ══════════════════════════════════════════════════════

                      Palavras dela: «os metadados pesam mais do que a imagem».

                      Pesavam: o cartão chegou a ter o nome, a contagem, a data,
                      o uso, o aviso de poucas fotos e a nota — seis linhas de
                      texto debaixo de uma fotografia, num cartão de 165 px.
                      Nenhuma era falsa; juntas, nenhuma se lia.

                      Agora os números são um só rasto, pela ordem em que
                      respondem à pergunta «o que é este tema?»: quantas fotos
                      tem, quantas vezes saiu, e há quanto tempo não lhe tocam.
                      A data vai no fim por ser a menos decisiva das três.

                      Era `truncate`, e com a data absoluta (a partir de 30
                      dias, «15/08/2026») o rasto deixou de caber num cartão de
                      seis colunas: lia-se «15/08/2…», que é uma data que não
                      diz o ano. O desenho do cartão na Parte 3 do documento
                      parte o rasto em DUAS linhas («14 fotos · / 1 proposta ·
                      ⚑»), e é isso que fica: quebra entre palavras, nunca a
                      meio de um número, e no máximo duas linhas. Os cartões
                      da mesma fila continuam da mesma altura — a grelha estica
                      cada célula à mais alta. */}
                  {/* «caption, --fg-tertiary, tabular-nums» (Parte 3). Os
                      algarismos com a mesma largura são o que deixa «9 fotos»
                      e «14 fotos» alinharem de cartão para cartão, e a cor é
                      o terceiro papel de texto da casa
                      (`--bo-texto-terciario`, 4,7:1 sobre o cartão branco e
                      5,7:1 sobre o escuro, os números da Parte 5.2). */}
                  {/* ── DUAS LINHAS FIXAS (9/11) ──────────────────────────
                      Era um rasto só, que partia onde calhava: «3 fotos · 2
                      propostas · há 6 / dias · ★» num cartão, «10 fotos ·
                      Nunca usado · / 09/10/2026» no vizinho, uma linha no
                      terceiro — e a fila deixava de alinhar. Agora a primeira
                      linha diz o que o tema TEM e quanto SAIU; a segunda,
                      QUANDO lhe tocaram (e a estrela). Cada uma numa linha. */}
                  <p className="mt-0.5 text-caption tabular-nums text-[var(--bo-texto-terciario)]">
                    <span className="block truncate">
                      {photoCountLabel(t.imageCount, t.truncated)}
                      {/* «7 propostas» ou «Nunca usado» — a segunda é a metade
                        mais útil: é o que distingue um tema que a biblioteca
                        TEM de um tema que o estúdio USA. Só entra quando a
                        contagem chegou (vem de outro pedido, depois dos
                        cartões).

                        Era «por usar»; a Parte 6 do documento manda «Nunca
                        usado», e a diferença não é de gosto: em minúsculas e
                        sem verbo, «por usar» lia-se como mais um número da
                        fila. Agora é também o nome de um âmbito da barra —
                        «Por usar» —, e o rasto do cartão e o filtro dizem a
                        mesma coisa com as mesmas palavras. */}
                      {usos
                        ? usos[t.id]
                          ? ` · ${plural(usos[t.id], "proposta", "propostas")}`
                          : " · Nunca usado"
                        : ""}
                    </span>
                    <span className="block min-h-[1lh] truncate">
                      {/* NÃO aparece quando a pasta não pôde ser lida: «Fotos
                        indisponíveis · há 2 meses» mistura um aviso com uma
                        informação de rotina, e é o aviso que tem de se ler.

                        ── A DATA RELATIVA LEVA A ABSOLUTA ATRÁS ──────────
                        Ponto 13 da auditoria: «"há 1 mês", "há 19 dias". Num
                        contexto de trabalho não chega.» O relativo fica (é o
                        que se lê de relance numa grelha de 28) e a data
                        inteira vai no `title`, que é o que responde quando a
                        pergunta passa a ser «isto foi antes ou depois do
                        casamento dos Ferreira?». A partir dos 30 dias a
                        própria linha passa a dizer a data — ver
                        `desdeQuando`. */}
                      {t.imageCount !== null && desdeQuando(t.updatedAt) ? (
                        <span title={dataPorExtenso(t.updatedAt)}>{desdeQuando(t.updatedAt)}</span>
                      ) : null}
                      {/* A BANDEIRA DO FAVORITO (era «Fixado no topo»; a palavra
                        passou a ser a do menu e do filtro), que era o chip aceso por cima da
                        fotografia. Fica no fim da linha, como no desenho do
                        `ThemeCard` (Parte 3), e leva nome escrito: um glifo
                        sozinho não diz nada a quem ouve o ecrã. */}
                      {t.favorito ? (
                        <span className="text-[var(--bo-accent)]">
                          {t.imageCount !== null && desdeQuando(t.updatedAt) ? " · " : ""}
                          <span aria-hidden="true">★</span>
                          <span className="sr-only">Favorito</span>
                        </span>
                      ) : null}
                    </span>
                  </p>
                  {/* ── UMA RESSALVA DE CADA VEZ ────────────────────────
                      Duas notas apagadas empilhadas leem-se como nenhuma. Este
                      cartão tem três candidatas — o par quase igual (que vive
                      por baixo, e é a única accionável), o «poucas fotos» e a
                      nota escrita à mão — e mostra UMA.

                      A ordem é a de quem pede acção: um tema repetido tem
                      remédio a um toque, um tema com poucas fotos é uma nota de
                      curadoria, e a nota é contexto.

                      ── E A LINHA EXISTE MESMO QUANDO NÃO TEM NADA ───────
                      Ponto 10 da auditoria: «cartões com altura desigual… a
                      fila fica desalinhada». O nome já tinha as duas linhas
                      reservadas; esta não tinha nenhuma — e bastava UM tema
                      com nota escrita para o cartão dele ficar 17 px mais alto
                      do que os quatro vizinhos. Uma caixa vazia com a altura
                      de uma linha custa 17 px e resolve a fila inteira, e é o
                      mesmo remédio (altura reservada) que já lá estava no
                      nome. `aria-hidden` quando está vazia: é geometria, e não
                      há nada para anunciar. */}
                  <div className="min-h-[1.125rem]">
                    {parecidos.get(t.id) ? null : temPoucasFotos(t) ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--bo-aviso)]">
                        Ainda com poucas fotos para escolher
                      </p>
                    ) : t.notes ? (
                      <p className="bo-text-muted mt-0.5 truncate text-xs opacity-70">{t.notes}</p>
                    ) : null}
                  </div>
                </div>
              </button>
              {/* ── «ISTO JÁ EXISTE COM OUTRO NOME» ───────────────────────
                  Palavras dela: «"Clássico Intemporal" aparece duas vezes com
                  nomes quase iguais».

                  IRMÃO do cartão e não filho, pela mesma razão que as acções:
                  um botão dentro de outro botão é HTML inválido, e o resultado
                  prático seria carregar aqui abrir o tema. Por baixo e não por
                  cima da capa — é uma nota de arrumação, não um alarme, e não
                  pode tapar a fotografia que faz o tema reconhecível.

                  Cita o outro nome: «este tema está repetido» obrigava a
                  procurar qual. E é um botão porque a saída existe agora — abre
                  o «Juntar a outro tema…» já com este de origem. */}
              {avisoDeTemaParecido(parecidos.get(t.id)) && (
                <button
                  type="button"
                  onClick={() => setAFundir(t)}
                  className={`alvo-toque mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-[var(--bo-aviso)] hover:bg-[var(--bo-aviso)]/[0.07] ${ESTADO} ${PRESSAO}`}
                >
                  <span className="truncate">{avisoDeTemaParecido(parecidos.get(t.id))}</span>
                  <span className="shrink-0 underline decoration-dotted underline-offset-2">
                    Juntar
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* O menu do botão direito, um só para o ecrã inteiro. Fica no fim
          para se desenhar por cima de tudo o resto sem depender de quem tem
          `z-index` — e é `fixed`, portanto não é a grelha que o recorta. */}
      <MenuDeContexto pedido={menu} onFechar={fecharMenu} />
      {perguntaDeEliminar}
    </div>
  );
}

/** O que a pasta sabe e o cartão do tema precisa de saber. */
interface FolderState {
  total: number | null;
  truncated: boolean;
  /** A fotografia da capa, inteira — e não só o endereço: o cartão precisa
   *  dos quatro campos dela (ver `capa-do-cartao.ts`). `undefined` = não se
   *  sabe (deixar o cartão como está); `null` = pasta vazia. */
  capa?: ThemeImage | null;
}

/** Uma foto que não subiu, com o ficheiro guardado para se poder repetir. */
interface Failure {
  file: File;
  message: string;
}

/**
 * Uma foto do arrasto que NÃO foi adicionada por já lá estar.
 *
 * Guarda o `File` em memória (como o `Failure` acima) para o "Adicionar mesmo
 * assim" não obrigar a voltar a escolher nada — e para a miniatura do
 * relatório sair de graça, do ficheiro que já está no computador dela.
 *
 * ISTO NÃO É UM ERRO e não pode aparecer a vermelho: é o comportamento que ela
 * pediu, a acontecer.
 */
interface Skipped {
  file: File;
  reason: SkipReason;
  /** O resumo, para o "Adicionar mesmo assim" não ter de o recalcular. */
  hash?: string;
}

/** O que a fase de verificação decidiu sobre um arrasto. */
interface Screening {
  /** As que devem mesmo subir, pela ordem em que ela as largou. */
  keep: File[];
  skipped: Skipped[];
  /** `ficheiro → resumo`, para viajar no formulário do carregamento. */
  hashOf: Map<File, string>;
  /** A pasta foi mesmo lida e percorrida até ao fim. `false` = não se pode
   *  anunciar poupança nenhuma (ver o painel de repetidas). */
  verified: boolean;
  /** O tema tem fotos sem impressão digital (a biblioteca anterior a isto). */
  legacy: boolean;
}

/**
 * Uma foto que ela largou e que ainda vai a caminho do servidor.
 *
 * Existe para uma coisa só: a foto aparecer na grelha NO MOMENTO em que ela a
 * larga, a partir do ficheiro que já está no computador — em vez de o ecrã
 * ficar com um espaço vazio durante os segundos que a subida demora.
 */
interface Pending {
  /** Chave local da célula (a foto ainda não tem caminho no servidor). */
  id: string;
  name: string;
  /** URL de objeto da foto local. `undefined` = ainda não há (ou o navegador
   *  não sabe fazer URLs de objeto) e a célula fica um retângulo à espera. */
  src?: string;
}

/** A página seguinte, pedida antes de ela a pedir. */
interface Ahead {
  /** O offset com que foi pedida: se a grelha entretanto mudou de tamanho
   *  (subiu ou saiu uma foto), esta página deixou de encaixar e deita-se fora. */
  offset: number;
  images: ThemeImage[];
  total: number | null;
  truncated: boolean;
  full: boolean;
}

/** O andamento da geração de miniaturas em falta. */
interface ThumbJob {
  running: boolean;
  /** Por onde vai a passagem pela pasta (é o que a torna retomável). */
  cursor: number;
  scanned: number;
  generated: number;
  failed: number;
  /** Fotos do tema, segundo o servidor. `null` = ainda não se sabe. */
  total: number | null;
  /** Acabou de percorrer a pasta toda. */
  complete: boolean;
}

/**
 * Quanto tempo se espera antes de ir buscar a página seguinte.
 *
 * A primeira página tem de chegar primeiro — pedir as duas ao mesmo tempo era
 * fazer exatamente o que este trabalho todo veio corrigir. Medido, uma página
 * de miniaturas fica no ecrã em ~350 ms; um segundo e meio é depois disso com
 * folga, e continua a ser muito antes de ela chegar ao fundo da grelha.
 */
const PREFETCH_DELAY_MS = 1500;

/** Quantas fotos do lote entram na grelha já com a imagem local à vista.
 *  Mostrar as 300 de uma vez obrigava o navegador a descodificar 300 fotos de
 *  12 MP para desenhar quadrados de 150 px; as restantes ganham a
 *  pré-visualização quando a sua miniatura é gerada (que é logo a seguir). */
const PREVIEW_EAGER = 12;

/** Teto de lotes de uma passagem de miniaturas (8 fotos por lote): trava um
 *  ciclo infinito se o servidor devolver sempre o mesmo cursor. */
const MAX_THUMB_BATCHES = 2000;

/** Lotes seguidos sem gerar nada (e com falhas) antes de desistir: a esta
 *  altura o problema é o Storage, não as fotos. */
const MAX_BAD_BATCHES = 3;

/** Quantas páginas já mostradas se voltam a pedir no fim da geração de
 *  miniaturas, para a grelha passar a mostrar as novas. */
const MAX_REFRESH_PAGES = 5;

/** Um URL de objeto para a foto local, ou `undefined` onde o navegador não
 *  saiba fazê-los (é o caso do jsdom, nos testes). */
function objectUrl(file: File): string | undefined {
  try {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : undefined;
  } catch {
    return undefined;
  }
}

function revokeUrl(url?: string) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* nada a fazer — o URL já não existe */
  }
}

/**
 * A FILA DOS ORIGINAIS.
 *
 * Uma célula que não tem miniatura puxa o original (~2,6 MB). Deixar o browser
 * pedir os 60 ao mesmo tempo — que é o que ele faz, e o `loading="lazy"` não
 * trava: medido, pediu os 60 na mesma — reparte o canal por todos e faz com
 * que TODOS acabem no fim. Esta fila deixa passar `HEAVY_IMAGE_CONCURRENCY` de
 * cada vez, pela ordem da grelha, que é a ordem por que ela olha.
 *
 * Vive fora do componente porque o canal também é um só: duas grelhas abertas
 * não têm o dobro da linha. É deliberadamente simples — sem estado partilhado
 * a manter, sem React: uma foto pede vez, e larga-a quando acaba (ou quando a
 * célula sai do ecrã).
 */
interface HeavySlot {
  start: () => void;
  started: boolean;
  released: boolean;
}
const heavyWaiting: HeavySlot[] = [];
let heavyLive = 0;

/** Se um download ficar pendurado (nem carrega nem falha), a vez volta ao fim
 *  deste tempo: uma foto encravada não pode fechar a grelha toda. */
const HEAVY_SLOT_TIMEOUT_MS = 30_000;

function pumpHeavy() {
  while (heavyLive < HEAVY_IMAGE_CONCURRENCY && heavyWaiting.length > 0) {
    const slot = heavyWaiting.shift();
    if (!slot || slot.released) continue;
    slot.started = true;
    heavyLive += 1;
    slot.start();
  }
}

/** Pede vez para descarregar um original. Devolve a função de largar a vez —
 *  serve para os dois casos (acabou / desistiu) e é idempotente. */
function queueHeavyImage(start: () => void): () => void {
  const slot: HeavySlot = { start, started: false, released: false };
  heavyWaiting.push(slot);
  pumpHeavy();
  return () => {
    if (slot.released) return;
    slot.released = true;
    if (slot.started) {
      heavyLive = Math.max(0, heavyLive - 1);
      pumpHeavy();
      return;
    }
    const i = heavyWaiting.indexOf(slot);
    if (i >= 0) heavyWaiting.splice(i, 1);
  };
}

/**
 * A miniatura de uma foto na grelha.
 *
 * Mostra, por esta ordem: a foto LOCAL (quando acabou de ser carregada nesta
 * sessão — já está no computador dela, não se vai buscar nada), a miniatura, e
 * só depois o original. As fotos carregadas ANTES de as miniaturas existirem
 * não têm nenhuma, e é o original que aparece — é para essas que existe o
 * botão "Gerar miniaturas em falta".
 *
 * O `onError` é a segunda rede: um URL assinado para um objeto que já lá não
 * está falha no browser, e sem isto ficava uma célula partida numa grelha
 * inteira que funciona.
 */
function Photo({
  image,
  alt,
  priority,
  localSrc,
}: {
  image: ThemeImage;
  alt: string;
  /** Está na primeira dobra: não espera por nada. */
  priority?: boolean;
  /** URL de objeto da foto que está no disco dela (carregada agora). */
  localSrc?: string;
}) {
  /** A imagem BARATA desta célula: a cópia local ou a miniatura (~25 KB). */
  const light = localSrc || image.thumbUrl;
  /** A barata falhou — miniatura apagada do bucket, ou cópia local já
   *  libertada. Fica só o original, e esse entra na fila como qualquer outro. */
  const [lightBroken, setLightBroken] = useState(false);
  /** A fila deu a vez a esta célula. */
  const [turn, setTurn] = useState(false);
  /** A fotografia já chegou — é o que dispara o fade por cima do LQIP. */
  const [pintada, setPintada] = useState(false);
  /** Sem imagem barata, esta célula vai puxar ~2,6 MB: espera pela vez. */
  const heavy = !light || lightBroken;
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!heavy) return;
    let timer = 0;
    const free = queueHeavyImage(() => {
      setTurn(true);
      // Rede de segurança: um pedido que nunca termina não pode ficar com a
      // vez para sempre.
      timer = window.setTimeout(() => release.current?.(), HEAVY_SLOT_TIMEOUT_MS);
    });
    release.current = () => {
      window.clearTimeout(timer);
      free();
    };
    return () => {
      release.current?.();
      release.current = null;
    };
    // `image.url` entra nas dependências para uma foto reassinada voltar a
    // pedir vez em vez de ficar com um URL expirado.
  }, [heavy, image.url]);

  // Uma célula à espera de vez fica SEM `src` (e não com `src=""`, que é um
  // pedido à própria página). É a única forma de a fila valer alguma coisa: um
  // `src` posto é um download começado.
  const src = heavy ? (turn ? image.url : undefined) : light;

  const finished = () => {
    release.current?.();
    release.current = null;
  };

  return (
    /* O LQIP É O FUNDO DA CÉLULA — mesma regra do seletor de temas, e pela
       mesma razão: um `background-image` com um `data:` URI não é um pedido,
       não entra na fila de descarregamentos, e está pintado no instante em que
       este elemento existe.
       Aqui há uma diferença: a célula pode já ter `localSrc` — a miniatura que
       acabou de ser feita no browser, ainda em memória, de uma foto carregada
       há segundos. Essa aparece na hora e não precisa de placeholder nenhum. */
    <div
      className="h-full w-full bg-[var(--bo-tinta-6)] bg-cover bg-center"
      style={image.lqip && !localSrc ? { backgroundImage: `url("${image.lqip}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        // As pesadas são geridas pela fila — pô-las também em `lazy` fazia uma
        // célula fora do ecrã ficar com a vez sem chegar a pedir nada.
        loading={heavy || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => {
          finished();
          setPintada(true);
        }}
        onError={() => {
          finished();
          if (!heavy) setLightBroken(true);
        }}
        className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-elemento ${
          pintada || localSrc || !image.lqip ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * A miniatura de uma foto SALTADA, desenhada do ficheiro que está no
 * computador dela.
 *
 * Custo zero de rede: o `File` já está em memória (é o mesmo que o "Adicionar
 * mesmo assim" vai usar). O URL de objeto é criado uma vez e registado para
 * ser libertado à saída da pasta, como todos os outros deste ecrã.
 */
function SkippedThumb({ file, track }: { file: File; track: (file: File) => string | undefined }) {
  const [src] = useState(() => track(file));
  if (!src) return <div className="bo-skeleton h-full w-full" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" decoding="async" className="h-full w-full object-cover" />;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CRACHÁ DO NÚMERO — o que se vê debaixo do ponteiro num arrasto múltiplo
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Arrasto múltiplo agrupado com BADGE OVAL DO NÚMERO.» [APPLE], Parte 4 do
 * `docs/APPLE-TEMAS.md`.
 *
 * Sem isto, pegar em quarenta fotografias arrasta a imagem de UMA — e o que se
 * vê debaixo do ponteiro é indistinguível de arrastar uma só. O número é a
 * única coisa que diz quantas vão a caminho antes de se largar.
 *
 * ── PORQUE É QUE O NÓ VIVE FORA DO ECRÃ E MORRE A SEGUIR ──────────────────
 *
 * O `setDragImage` tira uma FOTOGRAFIA do elemento no instante da chamada, mas
 * a especificação exige que ele ainda esteja no documento nesse instante —
 * `display: none` ou um nó solto dão um arrasto sem imagem nenhuma. Por isso
 * ele entra no documento, é fotografado, e sai no próximo turno da fila de
 * tarefas, que é o primeiro momento em que já não faz falta.
 *
 * `translate(-100%)` e não `left: -9999px`: em `rtl` o segundo empurra o
 * documento para o lado e o browser mostra uma barra de deslocamento durante
 * um fotograma.
 */
function vestirOArrasto(e: React.DragEvent, quantas: number): void {
  // Uma foto arrasta-se a si própria — a imagem que o browser faz da célula é
  // melhor do que qualquer coisa que se desenhe aqui, e é a da Apple.
  if (quantas <= 1) return;
  const dt = e.dataTransfer;
  if (typeof dt?.setDragImage !== "function" || typeof document === "undefined") return;
  const celula = e.currentTarget as HTMLElement;
  const cracha = document.createElement("div");
  cracha.setAttribute("aria-hidden", "true");
  cracha.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "transform:translate(-100%,-100%)",
    "pointer-events:none",
    "z-index:-1",
    `width:${Math.round(celula.offsetWidth || 120)}px`,
    `height:${Math.round(celula.offsetHeight || 90)}px`,
    "border-radius:8px",
    "background:var(--bo-surface)",
    "border:1px solid var(--bo-accent)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font:600 13px/1 system-ui,sans-serif",
  ].join(";");
  const oval = document.createElement("span");
  oval.textContent = String(quantas);
  // Cápsula, e não rectângulo: é um crachá de contagem, que é o único sítio
  // onde a Parte 4 da tabela de formas do sistema de design pede cápsula num
  // elemento pequeno.
  oval.style.cssText = [
    "min-width:28px",
    "padding:4px 8px",
    "border-radius:999px",
    "background:var(--bo-accent)",
    "color:#fff",
    "text-align:center",
  ].join(";");
  cracha.appendChild(oval);
  document.body.appendChild(cracha);
  try {
    dt.setDragImage(cracha, 12, 12);
  } catch {
    // Um browser que recuse a imagem faz o arrasto na mesma, com a dele.
  }
  window.setTimeout(() => cracha.remove(), 0);
}

/**
 * ── SAIR DA PASTA COM UM LOTE A MEIO ──────────────────────────────────────
 *
 * A pergunta vive aqui, e não dentro do `leave()`, porque desde o split view
 * há TRÊS portas para fora desta pasta e não uma: o «← Temas» (que é o
 * `leave`), o «Todos os temas» da coluna e cada linha dessa coluna — trocar de
 * tema desmonta a pasta tal como sair dela.
 *
 * Duas dessas três estão do lado do `Temas`, que não sabe se há fotos a subir;
 * por isso a pasta di-lo (`aoSubir`) e a pergunta é a mesma frase nos três
 * sítios. Sem isto, arrastar fotos para um tema e carregar na linha do lado
 * abandonava o lote em silêncio.
 */
const AVISO_DE_LOTE_A_MEIO =
  "Ainda há fotos a subir. Se sair agora, as que faltam não são carregadas. Sair mesmo assim?";

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
function ThemeFolder({
  theme,
  themes,
  onBack,
  onFolderState,
  onRename,
  onCover,
  onCopiedTo,
  accoes,
  aoArrastar,
  aoSubir,
  pedidoDeMover,
  pedidoAPasta,
  aoServirPedido,
  usos,
}: {
  theme: ThemeSummary;
  /** Todos os temas — para o "Copiar para…" saber para onde pode levar. */
  themes: ThemeSummary[];
  onBack: () => void;
  onFolderState: (state: FolderState) => void;
  onRename: (name: string) => void;
  /** A capa mudou. Vai com os campos TODOS da fotografia nova — ver
   *  `capa-do-cartao.ts`, e o defeito que ele fecha. */
  onCover: (coverPath: string, capa: CapaDoCartao) => void;
  /** Chegaram `added` fotos ao tema `destId` — o cartão dele tem de somar.
   *  Um número NEGATIVO subtrai, que é o que o «Anular» de um arrasto pede. */
  onCopiedTo: (destId: string, added: number) => void;
  /** As acções do tema, para o «⋯» do cabeçalho — a mesma lista do cartão
   *  (`accoesDoTema`, sem «Abrir»). */
  accoes: readonly AccaoDeItem[];
  /** Começou (ou acabou) um arrasto de fotografias. Quem precisa de saber é a
   *  coluna da esquerda, que é irmã desta pasta e não a conhece. */
  aoArrastar?: (aArrastar: boolean) => void;
  /** Há um lote a subir? Quem precisa de saber é o `Temas`: as outras duas
   *  portas para fora desta pasta são dele. Ver `AVISO_DE_LOTE_A_MEIO`. */
  aoSubir?: (aSubir: boolean) => void;
  /** Um lote largado num tema da coluna. Ver a nota no `Temas`. */
  pedidoDeMover?: { destino: ThemeSummary; carga: CargaDeFotos; n: number } | null;
  /** «Adicionar fotografias…», «Renomear…» ou «Definir capa…», pedidos no
   *  menu do tema. Ver `pedirAPasta` no `Temas`. */
  pedidoAPasta?: PedidoAPasta | null;
  /** O pedido foi servido — o `Temas` esquece-o. */
  aoServirPedido?: (servido: PedidoAPasta) => void;
  /** Quantas propostas usam cada tema — a mesma contagem dos cartões. */
  usos?: Record<string, number> | null;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  // Remover fotos deixa-as 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagarVarios = useDepoisDeApagarVarios();
  /** As fotos JÁ CARREGADAS, mais recentes primeiro. É sempre um PREFIXO da
   *  lista do servidor — ver `nextOffset` abaixo. */
  const [images, setImages] = useState<ThemeImage[]>([]);
  /** Total na pasta segundo o servidor; `null` = ainda não se sabe. */
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(false);
  /**
   * PORQUE é que a pasta não se deixou ler. A pasta ilegível já não era
   * confundida com uma pasta vazia — isso estava feito —, mas a razão era
   * sempre a mesma: «é uma falha temporária, recarrega a página daqui a
   * pouco». Com a sessão caída (o caso comum: este ecrã fica aberto horas)
   * isso é falso e o conselho não leva a lado nenhum — recarregar devolve o
   * mesmo 401. Com um 404 também: a pasta não volta por esperar.
   */
  const [falhaDaPasta, setFalhaDaPasta] = useState<LeituraFalhada | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lotes a decorrer — não um booleano: com dois lotes ao mesmo tempo, o
   *  primeiro a acabar desligava o indicador do outro. */
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<Failure[]>([]);
  /** As fotos deste arrasto que já estavam no tema. Ao lado do `failed` e com
   *  a mesma forma, mas NEUTRA: não é uma avaria, é o que ela pediu. */
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  /** O tema tem fotos anteriores a esta funcionalidade — dito uma vez, sem
   *  drama, porque explica a única repetida que pode escapar. */
  const [legacyPhotos, setLegacyPhotos] = useState(false);
  /** A pasta não pôde ser lida toda na última verificação. As repetidas que se
   *  encontraram são reais, mas pode ter escapado alguma — e prometer o
   *  contrário seria anunciar uma verificação que não aconteceu. */
  const [partialCheck, setPartialCheck] = useState(false);
  /** A fase de impressão digital, antes de qualquer preparação ou upload. */
  const [verifying, setVerifying] = useState<{ done: number; total: number } | null>(null);
  /** O diálogo "Copiar para…" está aberto. */
  const [copyOpen, setCopyOpen] = useState(false);
  /** E em que modo abre: «Mover para…» do menu da fotografia abre em
   *  «mover», a barra da selecção em «copiar». Sem isto a folha abria sempre
   *  em «copiar» e o menu que dizia «Mover» copiava — ver `modoInicial` no
   *  `ThemeCopyDialog`. Só muda no instante de abrir, por isso não salta a
   *  meio da saída da folha. */
  const [copyMode, setCopyMode] = useState<ThemeCopyMode>("copiar");
  /** O que aconteceu à última cópia/mudança — fica no ecrã enquanto houver
   *  fotos por levar (um número em que ela tem de agir não pode desaparecer). */
  const [copyReport, setCopyReport] = useState<ThemeCopyOutcome | null>(null);
  /** As fotos deste lote que ainda não voltaram do servidor, já à vista com a
   *  imagem que está no disco dela — ver `Pending`. */
  const [pending, setPending] = useState<Pending[]>([]);
  /** `caminho → URL de objeto` das fotos carregadas NESTA sessão: a grelha
   *  mostra a cópia local em vez de ir buscar ao Storage o que já cá está. */
  const [localSrc, setLocalSrc] = useState<Map<string, string>>(new Map());
  /** A página seguinte, já pedida e guardada — ver `prefetch`. */
  const [ahead, setAhead] = useState<Ahead | null>(null);
  /** A geração de miniaturas em falta, quando está a decorrer ou acabou. */
  const [thumbJob, setThumbJob] = useState<ThumbJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Índice da foto que está a ser arrastada (null = arrasto parado). */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Onde ela cairia se a largasse agora — é o que desenha o espaço aberto. */
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /**
   * As fotografias à espera de resposta à pergunta de as remover.
   *
   * Um estado só para os dois caminhos — a foto solta e o lote seleccionado —,
   * com o `emBloco` a dizer qual deles age. Dois estados separados seriam duas
   * janelas a poderem abrir ao mesmo tempo.
   */
  const [aRemover, setARemover] = useState<{ alvos: ThemeImage[]; emBloco: boolean } | null>(null);
  /** A ação em bloco que está a decorrer (transferir ou remover), com a
   *  contagem verdadeira. `null` = nada a acontecer. */
  const [emBloco, setEmBloco] = useState<AccaoEmBloco | null>(null);
  const [coverPath, setCoverPath] = useState<string | undefined>(theme.coverPath);
  /** Quantas arrumações da grelha já foram mandadas — ver `persistOrder`. */
  const ordemMandada = useRef(0);
  const [name, setName] = useState(theme.name);
  const [renaming, setRenaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * ── O MODO «ESCOLHER A CAPA» ───────────────────────────────────────────
   *
   * «Definir capa…» no menu do tema abre a pasta neste modo: uma faixa com a
   * instrução e «Cancelar» por cima da grelha, e o clique numa fotografia faz
   * dela a capa (o mesmo `setAsCover` do «Definir como capa» da foto) em vez
   * de a seleccionar. O Esc cancela. É a versão de um gesto só do que já se
   * fazia em três (seleccionar, procurar o botão, carregar).
   */
  const [escolherCapa, setEscolherCapa] = useState(false);
  /** O último pedido do menu do tema já servido — ver `pedidoAPasta`. */
  const pedidoAPastaServido = useRef<PedidoAPasta | null>(null);
  useEffect(() => {
    const p = pedidoAPasta;
    if (!p || p.temaId !== theme.id || p === pedidoAPastaServido.current) return;
    pedidoAPastaServido.current = p;
    aoServirPedido?.(p);
    // O seletor de ficheiros só abre com um gesto recente da pessoa — e o
    // clique no item do menu foi há uns milissegundos, no mesmo gesto.
    if (p.accao === "adicionar") inputRef.current?.click();
    else if (p.accao === "renomear") comecarARenomear();
    else comecarAEscolherCapa();
    // As duas acções são funções do corpo (fecham sobre o estado actual).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoAPasta, theme.id, aoServirPedido]);
  function comecarARenomear() {
    setName(theme.name);
    setRenaming(true);
  }
  function comecarAEscolherCapa() {
    setEscolherCapa(true);
  }
  /** Um PATCH de cada vez: confirmar o nome com o Enter dispara também o onBlur. */
  const renamingBusy = useRef(false);
  /** Passa a falso ao sair da pasta — um lote que só termine depois disso não
   *  pode voltar a escrever no estado deste ecrã. */
  const alive = useRef(true);
  /** Profundidade do arrasto: entrar numa foto dispara `dragleave` no
   *  contentor, e a moldura piscava a cada célula por baixo do ponteiro. */
  const dragDepth = useRef(0);
  /**
   * ── O QUE O ARRASTO ENTRE TEMAS PRECISA DE GUARDAR ────────────────────
   *
   * `aMover` é a espera: enquanto ela dura, a barra da selecção mostra a
   * contagem verdadeira em vez de um botão parado (é o mesmo `EmCurso` que a
   * transferência e a remoção já usam).
   *
   * `anuncio` é a região `role="status"` que a Parte 4 exige — «operações de
   * arrasto anunciadas em role="status"». Não é o toast: o toast é para quem
   * VÊ, e um leitor de ecrã não lê um aviso que aparece no canto e se vai
   * embora ao fim de quatro segundos.
   *
   * `recarga` obriga a pasta a reler a primeira página. Serve o «Anular»: as
   * fotografias voltam do tema de destino com CAMINHOS NOVOS no Storage (uma
   * cópia seguida de um apagar, não um renomear) e com URLs assinados novos.
   * Repô-las de memória com o `reinsertAt` desenhava uma grelha de imagens
   * partidas — o que se repõe é o pedido, não o objecto.
   */
  /**
   * ── O REGRESSO DE UM DROP FALHADO ─────────────────────────────────────
   *
   * «Falha no drop: REGRESSO ANIMADO à origem com `--ease-reposition`.»
   * [APPLE], Parte 4 e Parte 5 (475 ms).
   *
   * Metade disto é do browser e não se lhe toca: a imagem de arrasto a voar de
   * volta ao sítio é comportamento nativo do HTML5 drag-and-drop, e a única
   * forma de a substituir era trocar tudo isto por `pointer events` — o que
   * custaria o largar de FICHEIROS e de PASTAS do computador, que é o gesto
   * de origem desta grelha e o único que o HTML5 sabe fazer.
   *
   * A outra metade é nossa, e é a que faltava: a célula de onde a fotografia
   * saiu está a 40% enquanto o arrasto anda, e voltava a 100% num corte de
   * 150 ms — o degrau de um estado a mudar. Não é um estado: é um objecto que
   * voltou para o lugar, e por isso volta com a curva e a duração de
   * reposicionar. Guarda-se o `path` e não o índice, porque a grelha pode
   * ter-se arrumado pelo meio.
   *
   * `dropEffect === "none"` é o sinal que a norma dá para «isto não foi
   * largado em lado nenhum» — Esc a meio, ou largado fora de um destino.
   */
  const [aRegressar, setARegressar] = useState<string | null>(null);
  const [aMover, setAMover] = useState<{ feito: number; total: number } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [recarga, setRecarga] = useState(0);
  /** Âncora do Shift+clique (índice na grelha à vista). */
  const anchor = useRef<number | null>(null);

  /** Todos os URLs de objeto criados nesta pasta. Sair da pasta liberta-os
   *  todos de uma vez — é a única forma de garantir que nenhum fica pendurado,
   *  seja qual for o caminho por onde o lote acabou. */
  const objectUrls = useRef<Set<string>>(new Set());
  /** Pedido para parar a geração de miniaturas (o botão "Parar"). */
  const stopThumbs = useRef(false);

  useEffect(() => {
    alive.current = true;
    const urls = objectUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) revokeUrl(url);
      urls.clear();
    };
  }, []);

  /** Um URL de objeto para esta foto, já registado para ser libertado à saída. */
  const trackUrl = useCallback((file: File): string | undefined => {
    const url = objectUrl(file);
    if (url) objectUrls.current.add(url);
    return url;
  }, []);

  // `onFolderState` é recriada a cada render do pai; guardá-la numa ref deixa
  // o efeito de notificação depender só do que a pasta sabe.
  const notify = useRef(onFolderState);
  useEffect(() => {
    notify.current = onFolderState;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      // Guardados para o `catch`: é lá que se escreve a frase, e sem estes
      // chegava lá um "falhou" que não diz nem o estado nem o que o servidor
      // explicou.
      let resposta: { status: number } | null = null;
      let corpo: unknown = null;
      try {
        // O rato já pousou neste cartão? Então a listagem pode já estar cá —
        // ver `adiantarTema`. `null` quer dizer «não havia, ou já não vale», e
        // aí paga-se a ida normal, exactamente como antes disto existir.
        //
        // Numa RECARGA não se usa: o que se está a pedir é justamente a
        // verdade nova do servidor (as fotografias que o «Anular» acabou de
        // mandar de volta), e uma página adiantada é, por definição, a de
        // antes.
        const adiantada = recarga === 0 ? await usarAdiantada(theme.id) : null;
        const pagina =
          adiantada ??
          (await (async () => {
            const res = await fetch(
              `/api/temas/${theme.id}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
              { cache: "no-store" },
            );
            if (!res.ok) {
              resposta = res;
              corpo = await res.json().catch(() => null);
              throw new Error(String(res.status));
            }
            return paginaDaResposta(await res.json());
          })());
        if (!active) return;
        const page = pagina.images;
        setImages(page);
        setFalhaDaPasta(null);
        // `total: null` é uma pasta que NÃO pôde ser lida — ver
        // `paginaDaResposta`. Aceitá-la como zero faria a grelha dizer "arrasta
        // aqui as fotos" a um tema que pode ter 3000, e ela a carregá-las outra
        // vez.
        setTotal(pagina.total);
        setTruncated(pagina.truncated);
        setPageFull(page.length >= THEME_PAGE_SIZE);
      } catch (e) {
        // Sem lista não se avisa o pai: o cartão guarda a contagem que veio do
        // servidor (que pode ser "Fotos indisponíveis") em vez de dizer "0".
        if (!active) return;
        // A MESMA falha, dita de duas maneiras. O aviso passageiro flutua por
        // cima de qualquer ecrã e por isso nomeia a coisa; o painel que FICA na
        // grelha já tem o nome no título, e repeti-lo lá era dizer duas vezes o
        // que se está a ver.
        const frase = (oQue: string) =>
          resposta ? porqueNaoLeu(oQue, resposta, corpo) : porqueNaoLeuDoErro(oQue, e);
        setFalhaDaPasta(frase(""));
        toast(frase("as fotos deste tema").mensagem, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [theme.id, toast, recarga]);

  /**
   * O offset da página seguinte é, sempre, quantas fotos já temos.
   *
   * Parece frágil e é o contrário: `images` é mantido como um PREFIXO exato da
   * lista do servidor (mais recentes primeiro). Uma foto nova entra à cabeça
   * das duas listas; uma foto removida sai das duas. Logo, o que o servidor
   * tem a seguir ao que já mostramos está exatamente em `offset =
   * images.length` — mesmo que subam 40 fotos entre uma página e a seguinte,
   * que é o caso em que uma contagem de páginas fixa saltava fotos. O
   * `mergePage` por `path` é a rede por baixo disto.
   */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  /** UM único sítio a avisar o pai (contagem + capa do cartão). Avisar também
   *  dentro do upload e da remoção punha o cartão a par de uma lista já
   *  ultrapassada — a contagem ficava a divergir da grelha. */
  const cover = coverPath ? images.find((i) => i.path === coverPath) : images[0];
  useEffect(() => {
    if (loading || total === null) return;
    notify.current({
      total,
      truncated,
      // Uma capa escolhida que ainda não foi carregada (está numa página
      // adiante) não se sabe resolver: melhor não mexer no cartão do que
      // trocar-lhe a capa pela foto mais recente.
      capa: coverPath && !cover ? undefined : (cover ?? null),
    });
  }, [loading, total, truncated, coverPath, cover]);

  // Enquanto sobem fotos, fechar o separador perde o que falta. O browser
  // mostra o seu próprio aviso — é o único que ele deixa aparecer aqui.
  useEffect(() => {
    if (uploadingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingCount]);

  /**
   * FASE 1 a 3 — quais destas fotos JÁ estão no tema.
   *
   * A ordem é o que faz a diferença de tempo, e é deliberada: o resumo é
   * calculado ANTES de preparar a imagem. MEDIDO em Chromium nesta caixa, numa
   * foto 4032×3024 de 8,1 MB: 42,9 ms para resumir contra 337 ms para
   * preparar. Nesta ordem, cada repetida apanhada poupa a preparação E o
   * upload; ao contrário, poupava só o upload.
   *
   * Num arrasto de 300 com metade repetidas: ~4,3 s de resumos (4 em voo) e
   * ~0,5 s a construir o índice do lado do servidor, contra ~16,9 s de CPU
   * poupados e ~160 MB que deixam de subir (≈67 s a 20 Mbit/s).
   *
   * NUNCA falha o carregamento. Sem `crypto.subtle` (contexto inseguro), com a
   * pasta ilegível ou com a rota em baixo, isto devolve "sobe tudo" e o
   * `upsert: false` do servidor continua a ser o guarda que não falha.
   */
  async function screenBatch(files: File[]): Promise<Screening> {
    const nothingKnown: Screening = {
      keep: files,
      skipped: [],
      hashOf: new Map(),
      verified: false,
      legacy: false,
    };
    setVerifying({ done: 0, total: files.length });
    try {
      // ── 1) Impressão digital do ficheiro que está no disco dela ──────────
      const hashes = new Array<string | null>(files.length).fill(null);
      await pool(
        files.map((file, i) => ({ file, i })),
        FINGERPRINT_CONCURRENCY,
        async ({ file, i }) => {
          hashes[i] = await fingerprintBlob(file);
          if (alive.current) setVerifying((v) => (v ? { ...v, done: v.done + 1 } : v));
        },
        () => !alive.current,
      );
      if (!alive.current) return nothingKnown;
      // Nenhum resumo: este ambiente não sabe fazê-los (sem contexto seguro) e
      // a funcionalidade DESLIGA-SE — não parte, não avisa, não muda nada.
      if (hashes.every((h) => h === null)) return nothingKnown;

      const hashOf = new Map<File, string>();
      files.forEach((f, i) => {
        const h = hashes[i];
        if (h) hashOf.set(f, h);
      });

      // ── 2) Pré-verificação contra a pasta, em pedaços ────────────────────
      // Em pedaços de CHECK_CHUNK e não o lote todo: assim a primeira foto
      // começa a subir ao fim de ~0,3 s em vez de ~2 s num arrasto de 300. Do
      // segundo pedaço em diante o índice do servidor já está em memória.
      const known = new Set<string>();
      let verified = true;
      let legacy = false;
      for (let i = 0; i < files.length && alive.current; i += CHECK_CHUNK) {
        const chunk = [...new Set(hashes.slice(i, i + CHECK_CHUNK).filter((h) => h !== null))];
        if (chunk.length === 0) continue;
        try {
          const res = await fetch(`/api/temas/${theme.id}/repetidas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes: chunk }),
          });
          if (!res.ok) throw new Error("falhou");
          const data = await res.json();
          for (const h of Array.isArray(data?.known) ? data.known : []) {
            if (typeof h === "string") known.add(h);
          }
          // `read: false` = a pasta não pôde ser lida; `complete: false` = a
          // pasta é maior do que o teto. Nos dois casos não se anuncia
          // poupança nenhuma, mesmo que alguma repetida tenha sido apanhada.
          if (data?.read === false || data?.complete === false) verified = false;
          if (data?.legacy) legacy = true;
        } catch {
          // Falhar a VERIFICAR nunca pode travar o carregamento: sobe tudo, e
          // o guarda da escrita apanha o que houver.
          verified = false;
        }
      }
      if (!alive.current) return nothingKnown;

      // ── 3) Repetidas dentro do PRÓPRIO arrasto ───────────────────────────
      // A pré-verificação nunca as apanharia: ainda não estão na pasta. Sem
      // isto, largar a mesma pasta duas vezes de seguida num só gesto entrava
      // a dobrar.
      const seen = new Set<string>();
      const keep: File[] = [];
      const out: Skipped[] = [];
      files.forEach((file, i) => {
        const hash = hashes[i];
        if (hash && known.has(hash)) {
          out.push({ file, reason: "no-tema", hash });
          return;
        }
        if (hash && seen.has(hash)) {
          out.push({ file, reason: "no-lote", hash });
          return;
        }
        if (hash) seen.add(hash);
        keep.push(file);
      });

      return { keep, skipped: out, hashOf, verified, legacy };
    } finally {
      if (alive.current) setVerifying(null);
    }
  }

  /**
   * Carrega um lote de fotos, SALTANDO as que já estão no tema.
   *
   * `force` é o "Adicionar mesmo assim": salta a verificação toda e manda o
   * servidor guardar com um sufixo. É a marcha-atrás de um clique — e a
   * recuperação de todos os modos de falha do índice (memo velho noutra
   * instância do servidor, resumo errado, colisão).
   */
  async function upload(files: File[], force?: { hashOf: Map<File, string> }) {
    if (files.length === 0) return;
    // O contador entra JÁ: a fase de verificação também é trabalho em curso, e
    // fechar o separador a meio dela perde o arrasto todo.
    setUploadingCount((n) => n + 1);
    try {
      const screened: Screening = force
        ? // A FORÇAR, os resumos já são conhecidos e VÃO na mesma: sem eles o
          // servidor cunharia um UUID e a foto forçada deixava de contar como
          // "está no tema" — um buraco permanente no índice, por cada clique
          // em "Adicionar mesmo assim".
          { keep: files, skipped: [], hashOf: force.hashOf, verified: false, legacy: false }
        : await screenBatch(files);
      if (!alive.current) return;
      if (screened.legacy) setLegacyPhotos(true);
      if (!force) setPartialCheck(!screened.verified);
      if (screened.skipped.length > 0) setSkipped((prev) => [...prev, ...screened.skipped]);
      if (screened.keep.length === 0) {
        // SEM ISTO ela vê uma barra a andar e nada a acontecer, e conclui que
        // o site está avariado.
        toast(
          `Estas ${files.length} fotos já estavam todas em "${theme.name}". Não foi adicionada nenhuma.`,
          "info",
        );
        return;
      }
      await sendBatch(screened.keep, screened.hashOf, Boolean(force), screened.skipped.length);
    } finally {
      if (alive.current) setUploadingCount((n) => Math.max(0, n - 1));
    }
  }

  /**
   * Envia o lote com até `UPLOAD_CONCURRENCY` em voo.
   *
   * Um ficheiro por pedido: o limite de corpo do alojamento (~4,5 MB) rebenta
   * com um lote inteiro de fotos de telemóvel. Cada pedido leva o original
   * preparado, a sua miniatura (`thumbs`, na mesma ordem) e o `hashes` — como
   * vai um só ficheiro de cada vez, "a mesma ordem" é trivialmente respeitada.
   *
   * Nada aqui deita fora o lote: cada falha é apanhada, guardada COM o
   * ficheiro (para se poder repetir sem voltar a escolher nada) e o lote
   * continua.
   */
  async function sendBatch(
    files: File[],
    hashOf: Map<File, string>,
    force: boolean,
    /** Quantas já foram saltadas antes de chegar aqui — entra na mensagem. */
    preSkipped: number,
  ) {
    // Os totais somam-se: dois lotes a decorrer mostram um só "47 de 312".
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + files.length }));
    let added = 0;
    const errors: Failure[] = [];
    /** As que o SERVIDOR recusou por já lá estarem — a corrida apanhada pelo
     *  `upsert: false`, e a foto antiga apanhada pelo eTag. Contam-se aqui, e
     *  não na previsão, para o relatório dizer o que ACONTECEU. */
    const serverSkipped: Skipped[] = [];

    // AS FOTOS ENTRAM NA GRELHA AGORA, do ficheiro que está no computador —
    // não daqui a três segundos, quando o servidor responder. As primeiras
    // levam já o URL de objeto; as outras recebem-no quando lhes chegar a vez
    // de serem preparadas (aí já é a MINIATURA, que é barata de desenhar).
    const batch = files.map((file, i) => ({
      file,
      item: {
        id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        src: i < PREVIEW_EAGER ? trackUrl(file) : undefined,
      } as Pending,
    }));
    setPending((prev) => [...batch.map((b) => b.item), ...prev]);

    /** Tira a célula provisória da grelha. `keepUrl` fica com o URL de objeto
     *  (passou a ser a imagem da foto verdadeira); senão é revogado aqui. */
    const dropPending = (item: Pending, keepUrl: boolean) => {
      setPending((prev) => prev.filter((p) => p.id !== item.id));
      if (!keepUrl) revokeUrl(item.src);
    };

    try {
      await pool(
        batch,
        UPLOAD_CONCURRENCY,
        async ({ file: f, item }) => {
          try {
            // Preset "cover" e não "board": uma foto da biblioteca tem DOIS
            // destinos possíveis — uma célula de mood board ou uma imagem de
            // CAPA, impressa em grande. Guardá-la com 1600 px degradava-a para
            // sempre (o original nunca mais existe). A miniatura sai da MESMA
            // descodificação, para um lote de 300 fotos não custar o dobro.
            const { file, thumb, micro, mid, lqip, cor } = await prepareImageWithThumb(f, "cover");
            // A miniatura acabada de fazer é a melhor pré-visualização que há:
            // 400 px, ~25 KB, e já está em memória. As células que ainda não
            // tinham imagem ganham-na aqui; as que já tinham ficam com a que
            // têm (trocar era piscar por nada).
            if (!item.src) {
              const preview = trackUrl(thumb ?? file);
              if (preview) {
                item.src = preview;
                if (alive.current) {
                  setPending((prev) =>
                    prev.map((p) => (p.id === item.id ? { ...p, src: preview } : p)),
                  );
                }
              }
            }
            const form = new FormData();
            form.append("files", file);
            if (thumb) form.append("thumbs", thumb);
            // A de 1200 px — a que a PÁGINA DO CASAL mostra. Sai da mesma
            // descodificação que fez a miniatura, portanto não custa tempo
            // nenhum. Sem ela, esta fotografia só a ganha quando ALGUÉM OLHAR
            // para ela numa proposta — com o servidor a fabricá-la enquanto o
            // casal espera.
            if (mid) form.append("medias", mid);
            // A micro de 96 px, para as tiras do cartão de tema. Vai no mesmo
            // pedido — já está feita, do mesmo canvas.
            if (micro) form.append("micros", micro);
            // O LQIP viaja no MESMO pedido que a foto — é trabalho do
            // carregamento, e o carregamento já está a falar com o servidor.
            // Emparelhado pela ORDEM, como o `thumbs` e o `hashes`.
            if (lqip) form.append("lqips", lqip);
            // A cor dominante, pela mesma boleia e pela mesma razão: é aqui
            // que a fotografia existe em bruto e sem origem cruzada (ver
            // `corDe` em `image-worker.ts`). Emparelhada pela ORDEM.
            if (cor) form.append("cores", cor);
            // O resumo do ficheiro ORIGINAL (não do preparado): é ele que vira
            // o nome no Storage e torna a garantia de "não repetir" atómica.
            const hash = hashOf.get(f);
            if (hash) form.append("hashes", hash);
            if (force) form.append("force", "1");
            const res = await fetch(`/api/temas/${theme.id}/imagens`, {
              method: "POST",
              body: form,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `Falha ao carregar "${f.name}".`);
            // O servidor recusou-a por já lá estar. NÃO é um erro: sai da
            // grelha em silêncio e entra no painel neutro das repetidas.
            const dup: ThemeDuplicate | undefined = data?.duplicates?.[0];
            if (dup) {
              dropPending(item, false);
              serverSkipped.push({ file: f, reason: "no-tema", ...(hash ? { hash } : {}) });
              return;
            }
            const im: ThemeImage | undefined = data?.images?.[0];
            if (!im?.path) throw new Error(`Falha ao carregar "${f.name}".`);
            if (!alive.current) return;
            // A célula provisória dá lugar à foto verdadeira SEM piscar: o URL
            // de objeto passa a ser a imagem desta foto na grelha, por isso não
            // se vai buscar ao Storage uma miniatura que já cá está.
            if (item.src) setLocalSrc((prev) => new Map(prev).set(im.path, item.src as string));
            dropPending(item, Boolean(item.src));
            // Cada foto entra na grelha assim que chega. Juntar o lote todo e no
            // fim fazer `[...lote, ...images]` lia um `images` velho: dois lotes
            // em paralelo perdiam fotos e uma foto removida entretanto voltava.
            setImages((prev) => (prev.some((x) => x.path === im.path) ? prev : [im, ...prev]));
            setTotal((t) => (t === null ? null : t + 1));
            bibliotecaAlterada();
            added += 1;
          } catch (e) {
            // A foto não subiu: a célula provisória sai (a caixa vermelha do
            // "tentar novamente" é que passa a contar a história) e o URL de
            // objeto é libertado.
            dropPending(item, false);
            errors.push({
              file: f,
              message: e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`,
            });
          } finally {
            if (alive.current) setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        },
        () => !alive.current,
      );
      if (!alive.current) return;
      // O RELATÓRIO É CONSTRUÍDO DO QUE ACONTECEU, não do que a verificação
      // previu: assim uma corrida apanhada pelo 409, uma repetida antiga
      // apanhada pelo eTag e uma repetida prevista contam todas da mesma
      // maneira, e o número que ela lê é sempre verdadeiro.
      if (serverSkipped.length > 0) setSkipped((prev) => [...prev, ...serverSkipped]);
      const jaLaEstavam = preSkipped + serverSkipped.length;
      const cauda =
        jaLaEstavam > 0
          ? ` ${jaLaEstavam} já ${jaLaEstavam === 1 ? "estava" : "estavam"} no tema.`
          : "";
      if (errors.length > 0) {
        setFailed((prev) => [...prev, ...errors]);
        toast(
          errors.length === files.length
            ? `Nenhuma foto subiu. ${errors[0].message}`
            : `${added} de ${files.length} carregadas — ${plural(errors.length, "falhou", "falharam")}.`,
          "error",
        );
      } else if (added === 0 && jaLaEstavam > 0) {
        toast(`Nada a adicionar —${cauda}`, "info");
      } else {
        toast(
          `${plural(added, "foto adicionada", "fotos adicionadas")} a "${theme.name}".${cauda}`,
          "success",
        );
      }
    } finally {
      if (alive.current) {
        // Só o último lote apaga o contador: `done === total` só acontece
        // quando já não falta nenhum ficheiro de nenhum dos lotes.
        setProgress((p) => (p && p.done >= p.total ? null : p));
      }
    }
  }

  /**
   * Volta a pedir as páginas que estão à vista, para a grelha passar a mostrar
   * as miniaturas acabadas de gerar em vez dos originais.
   *
   * Substitui cada foto pela mesma foto (a chave é o `path`), por isso não
   * mexe na ordem, na seleção, nem no que subiu entretanto. Só as primeiras
   * `MAX_REFRESH_PAGES`: quem tiver aberto mais do que 300 fotos vê o resto
   * aliviado no próximo carregamento da página — e voltar a assinar 4000 URLs
   * para isso seria trocar um problema por outro.
   */
  async function refreshVisibleThumbs(count: number) {
    const pages = Math.min(Math.ceil(count / THEME_PAGE_SIZE), MAX_REFRESH_PAGES);
    const fresh = new Map<string, ThemeImage>();
    for (let p = 0; p < pages; p++) {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?offset=${p * THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const im of (Array.isArray(data?.images) ? data.images : []) as ThemeImage[]) {
          if (im?.path) fresh.set(im.path, im);
        }
      } catch {
        return;
      }
    }
    if (!alive.current || fresh.size === 0) return;
    setImages((prev) => prev.map((im) => fresh.get(im.path) ?? im));
    // A cópia local deixa de ser precisa para as que passaram a ter miniatura:
    // a partir daqui a grelha mostra a miniatura do servidor, como qualquer
    // outra foto. (Os URLs de objeto são libertados à saída da pasta.)
  }

  /**
   * GERAR AS MINIATURAS QUE FALTAM.
   *
   * Um pedido por lote, com o cursor que o servidor devolve. Parece
   * complicado e é o que torna isto usável: cada pedido é curto (o ecrã nunca
   * congela), fechar o separador não perde nada (recomeça-se do princípio e o
   * que já está feito é saltado), e o que falha é contado à vista em vez de
   * desaparecer.
   */
  async function runThumbJob() {
    if (thumbJob?.running) return;
    stopThumbs.current = false;
    let cursor = 0;
    let scanned = 0;
    let generated = 0;
    let failedCount = 0;
    let badBatches = 0;
    let complete = false;
    setThumbJob({
      running: true,
      cursor,
      scanned,
      generated,
      failed: failedCount,
      total,
      complete: false,
    });
    try {
      for (let batch = 0; batch < MAX_THUMB_BATCHES; batch++) {
        if (!alive.current || stopThumbs.current) break;
        let data: {
          scanned?: number;
          generated?: number;
          failed?: number;
          nextCursor?: number | null;
          total?: number | null;
        } | null = null;
        try {
          const res = await fetch(`/api/temas/${theme.id}/miniaturas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cursor }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            toast(
              body?.error ||
                "Não foi possível gerar as miniaturas agora. O que já foi feito fica guardado.",
              "error",
            );
            break;
          }
          data = body;
        } catch {
          toast("Erro de ligação ao gerar as miniaturas. Podes continuar mais tarde.", "error");
          break;
        }
        scanned += data?.scanned ?? 0;
        generated += data?.generated ?? 0;
        failedCount += data?.failed ?? 0;
        // Lotes seguidos em que NADA se gerou e tudo falhou = o problema não é
        // a foto, é o Storage. Continuar seria percorrer 4000 fotos a falhar
        // em silêncio, com a barra a andar como se estivesse a fazer algo.
        badBatches = (data?.generated ?? 0) === 0 && (data?.failed ?? 0) > 0 ? badBatches + 1 : 0;
        if (badBatches >= MAX_BAD_BATCHES) {
          toast(
            "As miniaturas não estão a ser criadas. Deixa isto por agora e tenta mais tarde — as fotos não foram tocadas.",
            "error",
          );
          break;
        }
        const next = data?.nextCursor;
        cursor = typeof next === "number" ? next : cursor;
        if (!alive.current) return;
        setThumbJob({
          running: true,
          cursor,
          scanned,
          generated,
          failed: failedCount,
          total: typeof data?.total === "number" ? data.total : total,
          complete: false,
        });
        if (next === null || next === undefined) {
          complete = true;
          break;
        }
      }
    } finally {
      if (alive.current) {
        setThumbJob((j) =>
          j ? { ...j, running: false, scanned, generated, failed: failedCount, complete } : j,
        );
      }
    }
    if (!alive.current) return;
    if (generated > 0) {
      toast(
        `${plural(generated, "miniatura criada", "miniaturas criadas")}. O tema passa a abrir muito mais depressa.`,
        "success",
      );
      await refreshVisibleThumbs(images.length);
    } else if (complete) {
      toast("Já não faltavam miniaturas neste tema.", "info");
    }
  }

  /** Repete as que falharam. Os ficheiros ficaram guardados — não é preciso
   *  voltar a abrir a pasta no computador nem lembrar-se de quais foram. */
  function retryFailed() {
    const again = failed.map((f) => f.file);
    if (again.length === 0) return;
    setFailed([]);
    upload(again);
  }

  /**
   * "ADICIONAR MESMO ASSIM" — a marcha-atrás de um clique.
   *
   * Sobe as saltadas com `force`, e o servidor guarda-as com `<resumo>-<4 hex>`.
   * O sufixo é a razão pela qual o analisador de nomes o descarta: uma cópia
   * forçada CONTINUA a contar como "esta foto está no tema" para o arrasto
   * seguinte, em vez de abrir um buraco permanente no índice.
   *
   * É por LOTE, no relatório — nunca uma pergunta por foto. E é a recuperação
   * de todos os modos de falha do índice, que é por isso que o relatório tem de
   * ser accionável e não decorativo.
   */
  function addSkippedAnyway() {
    if (skipped.length === 0) return;
    // Os resumos já foram calculados na verificação — não se voltam a ler os
    // ficheiros, e vão com as fotos para o nome forçado os preservar.
    const hashOf = new Map<File, string>();
    for (const s of skipped) if (s.hash) hashOf.set(s.file, s.hash);
    const again = skipped.map((s) => s.file);
    setSkipped([]);
    upload(again, { hashOf });
  }

  function pick(list: FileList | File[] | null) {
    if (!list) return;
    const all = Array.from(list);
    const files = all.filter(isImageFile);
    const skipped = all.length - files.length;
    if (files.length === 0) {
      if (skipped > 0) toast("Nenhum dos ficheiros é uma imagem.", "error");
      return;
    }
    if (skipped > 0) {
      toast(
        `${plural(skipped, "ficheiro ignorado", "ficheiros ignorados")} — não são imagens.`,
        "info",
      );
    }
    upload(files);
  }

  /** O drop já com as `entries` lidas de forma síncrona pelo handler. */
  async function handleDrop(entries: FileSystemEntry[], files: File[]) {
    // Sem pastas pelo meio, `dataTransfer.files` já traz tudo — e traz mais
    // depressa do que percorrer a árvore entrada a entrada.
    if (entries.length === 0 || !entries.some((e) => e.isDirectory)) {
      pick(files);
      return;
    }
    toast("A ler a pasta…", "info");
    const { files: found, capped } = await expandDropEntries(entries);
    if (!alive.current) return;
    if (capped) {
      toast(
        `Foram lidas as primeiras ${MAX_DROP_FILES} fotos da pasta. Carrega as restantes num segundo arrasto.`,
        "info",
      );
    }
    pick(found);
  }

  /** Junta ao ecrã uma página que já veio do servidor (pedida agora ou de
   *  antemão). Um só sítio a mexer nestes quatro estados. */
  const absorb = useCallback(
    (page: ThemeImage[], pageTotal: number | null, pageTruncated: boolean, full: boolean) => {
      setImages((prev) => mergePage(prev, page));
      if (pageTotal !== null) setTotal(pageTotal);
      setTruncated(pageTruncated);
      setPageFull(full);
    },
    [],
  );

  async function loadMore() {
    if (loadingMore) return;
    // A página seguinte já cá está: entra sem esperar por nada. É este o
    // caminho normal — o pedido foi feito 1,5 s depois de a pasta abrir.
    if (ahead && ahead.offset === images.length) {
      const next = ahead;
      setAhead(null);
      absorb(next.images, next.total, next.truncated, next.full);
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/temas/${theme.id}/imagens?offset=${nextOffset}&limit=${THEME_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("falhou");
      const data = await res.json();
      if (!alive.current) return;
      const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      absorb(
        page,
        typeof data?.total === "number" ? data.total : null,
        Boolean(data?.truncated),
        page.length >= THEME_PAGE_SIZE,
      );
    } catch {
      toast("Não foi possível carregar mais fotos.", "error");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }

  /**
   * A PÁGINA SEGUINTE, ANTES DE ELA A PEDIR.
   *
   * Só depois de a primeira estar no ecrã (`PREFETCH_DELAY_MS`), e só UMA: o
   * objetivo é que o "Mostrar mais" seja instantâneo, não descarregar o tema
   * todo às escondidas — um tema tem 4000 fotos e assinar URLs custa ao
   * servidor. A página guardada trava-se a um `offset`: se entretanto entrar
   * ou sair uma foto, deixa de encaixar e é deitada fora (o efeito volta a
   * correr e pede a certa).
   */
  // Uma página guardada só serve no sítio para onde foi pedida: se entretanto
  // entrou (ou saiu) uma foto, ela deixa de encaixar e volta a pedir-se a
  // certa. Isto lê-se, não se apaga — deitar fora o estado dentro do efeito
  // seria uma renderização a mais para dizer o que já se sabe daqui.
  const aheadFits = ahead !== null && ahead.offset === images.length;
  useEffect(() => {
    if (loading || loadingMore || !hasMore || aheadFits) return;
    let cancelled = false;
    const offset = images.length;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(
            `/api/temas/${theme.id}/imagens?offset=${offset}&limit=${THEME_PAGE_SIZE}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !alive.current) return;
          const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
          if (page.length === 0) return;
          setAhead({
            offset,
            images: page,
            total: typeof data?.total === "number" ? data.total : null,
            truncated: Boolean(data?.truncated),
            full: page.length >= THEME_PAGE_SIZE,
          });
        } catch {
          // Falhar a adivinhar não é um erro que se mostre: o botão "Mostrar
          // mais" continua a fazer o pedido à mão, com a sua própria mensagem.
        }
      })();
    }, PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [theme.id, loading, loadingMore, hasMore, aheadFits, images.length]);

  /**
   * ── OS TRÊS GESTOS DE SELECÇÃO ─────────────────────────────────────────
   *
   * «Suportar seleção; ⌘A; Shift+clique para intervalo; ⌘+clique para
   * adicionar.» [APPLE, Collections + Focus and selection] — ponto 7 da
   * auditoria do `docs/APPLE-TEMAS.md`.
   *
   * ── E PORQUE É QUE O CLIQUE SIMPLES NÃO SUBSTITUI A SELECÇÃO ───────────
   *
   * Num Finder, clicar numa foto desmarca as outras e o ⌘ é que acrescenta.
   * Aqui a célula é um `role="checkbox"` com `aria-checked` — e num checkbox o
   * clique ALTERNA, é o que o nome promete a quem ouve o ecrã e é o único
   * gesto que existe num telemóvel, onde não há ⌘ nenhum. Trocar isso partia
   * a semântica e obrigava a escolher quarenta fotos com uma tecla que metade
   * dos dispositivos não tem.
   *
   * O que o ⌘ faz aqui, então, é uma coisa que o clique não fazia: GANHA ao
   * Shift. Com os dois carregados, o Finder acrescenta um item ao intervalo em
   * vez de o refazer — e é exactamente isso que se ganha em poder escolher a
   * quadragésima primeira foto sem perder o intervalo de quarenta que estava
   * feito.
   */
  function toggleAt(index: number, mods: { shift: boolean; somar: boolean }) {
    // A âncora é lida AGORA e só depois movida: o React corre o `setSelected`
    // preguiçosamente, já na renderização, e lá dentro `anchor.current` já
    // valeria `index` — o Shift+clique passava a ser um clique normal.
    const from = anchor.current;
    anchor.current = index;
    const extend = mods.shift && !mods.somar;
    setSelected((prev) => {
      const next = new Set(prev);
      if (extend && from !== null && from !== index) {
        // Shift+clique estende a partir da última foto tocada, e o sentido
        // (marcar ou desmarcar) é o que a foto clicada vai passar a ser — é o
        // que qualquer gestor de ficheiros faz.
        const target = images[index];
        const turnOn = target ? !prev.has(target.path) : true;
        for (let i = Math.min(from, index); i <= Math.max(from, index); i++) {
          const p = images[i]?.path;
          if (!p) continue;
          if (turnOn) next.add(p);
          else next.delete(p);
        }
      } else {
        const p = images[index]?.path;
        if (p) {
          if (next.has(p)) next.delete(p);
          else next.add(p);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    anchor.current = null;
  }

  /**
   * `Shift` + setas: a selecção estende-se de `de` até `para`, como no Finder.
   * Voltar para trás por cima do que já estava escolhido encolhe — tira a foto
   * de onde se sai, e a de destino fica.
   */
  function estenderPeloTeclado(de: number, para: number) {
    anchor.current = para;
    setSelected((prev) => {
      const caminho: string[] = [];
      for (let k = Math.min(de, para); k <= Math.max(de, para); k++) {
        const p = images[k]?.path;
        if (p) caminho.push(p);
      }
      const destino = images[para]?.path;
      const next = new Set(prev);
      if (caminho.every((p) => prev.has(p))) {
        for (const p of caminho) if (p !== destino) next.delete(p);
      } else {
        for (const p of caminho) next.add(p);
      }
      return next;
    });
  }

  /** Remove um conjunto de fotos. Uma só confirmação para o conjunto todo, e
   *  as que o servidor recusar voltam ao sítio onde estavam. */
  async function removeImages(targets: ThemeImage[], aoProgredir?: (feitas: number) => void) {
    if (targets.length === 0) return;
    const positions = new Map(images.map((im, i) => [im.path, i]));
    const gone = new Set(targets.map((t) => t.path));
    setImages((prev) => prev.filter((i) => !gone.has(i.path)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of gone) next.delete(p);
      return next;
    });
    anchor.current = null;
    setTotal((t) => (t === null ? null : Math.max(0, t - targets.length)));
    bibliotecaAlterada();

    const errors: ThemeImage[] = [];
    // As que saíram, e o que o servidor disse de cada uma: é daí que vem a
    // entrada da Reciclagem para o «Anular».
    const saidas: { im: ThemeImage; corpo: unknown }[] = [];
    /**
     * A primeira recusa que trouxe RESPOSTA — é ela que classifica a frase.
     *
     * As remoções vão em paralelo (ver `pool`) e não há uma resposta só para
     * ler. Fica-se pela primeira: numa remoção em bloco o motivo é sempre o
     * mesmo para todas (a sessão caiu, o servidor está em baixo), e é a
     * diferença entre mandar voltar a entrar e mandar esperar. `null` quer
     * dizer que nenhuma chegou a responder — a rede em baixo.
     */
    let primeiraRecusa: Response | null = null;
    // As remoções correm com concorrência: a contagem é de quantas JÁ
    // RESPONDERAM, e conta tanto as que foram como as que falharam — a barra
    // retrata a espera, não o sucesso (o que falhou tem o seu próprio aviso).
    let respondidas = 0;
    await pool(targets, DELETE_CONCURRENCY, async (im) => {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?path=${encodeURIComponent(im.path)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          primeiraRecusa ??= res;
          throw new Error("falhou");
        }
        saidas.push({ im, corpo: await res.json().catch(() => null) });
      } catch {
        errors.push(im);
      } finally {
        respondidas += 1;
        aoProgredir?.(respondidas);
      }
    });
    if (!alive.current) return;
    if (errors.length > 0) {
      // Repor SÓ as fotos cuja remoção falhou, no sítio onde estavam. Repor a
      // lista inteira deitava fora as que um lote a decorrer tivesse
      // entretanto acrescentado.
      setImages((prev) => reinsertAt(prev, errors, positions));
      setTotal((t) => (t === null ? null : t + errors.length));
      // E a frase diz que elas VOLTARAM. A remoção é optimista: as fotos saem
      // da grelha no instante do clique e reaparecem no lugar delas quando o
      // servidor recusa. Com «Não foi possível remover 3 fotos» ela via três
      // fotos ressuscitar sem perceber que era o aviso a acontecer.
      const uma = errors.length === 1;
      const oQue = `remover ${plural(errors.length, "foto", "fotos")} de "${theme.name}"`;
      const falha = primeiraRecusa ? porqueFalhou(oQue, primeiraRecusa) : porqueRebentou(oQue);
      toast(
        `${falha.mensagem} ${uma ? "Voltou" : "Voltaram"} ao sítio onde ${
          uma ? "estava" : "estavam"
        }.`,
        "error",
      );
    } else {
      // TAMBÉM QUANDO É UMA SÓ. O `targets.length > 1` que aqui estava não era
      // uma decisão — era o resto de uma frase escrita a pensar no bloco, e
      // deixava o gesto mais comum de todos mudo.
      //
      // O buraco na grelha não serve de resposta: a remoção é OTIMISTA, a
      // célula sai no instante do clique e o servidor só responde depois. Quem
      // prova a diferença é o ramo de cima — quando ele recusa, a foto volta ao
      // sítio onde estava. Sem esta frase, ver a foto sair não distingue «foi
      // removida» de «ainda vai a caminho».
      //
      // E com «Anular» (R3b): as fotos ficam 30 dias na Reciclagem, e as que
      // voltarem regressam ao sítio onde estavam na grelha.
      depoisDeApagarVarios(
        saidas.map((x) => x.corpo),
        `${plural(targets.length, "foto removida", "fotos removidas")}.`,
        (repostos) => {
          if (!alive.current) return;
          const voltaram = repostos.map((i) => saidas[i].im);
          setImages((prev) => reinsertAt(prev, voltaram, positions));
          setTotal((t) => (t === null ? null : t + voltaram.length));
          bibliotecaAlterada();
        },
      );
    }
  }

  /**
   * O que fazer com a grelha depois de levar fotos para outro tema.
   *
   * SEM REMOÇÃO OTIMISTA, ao contrário do `removeImages`: aqui já houve barra
   * de progresso a explicar a espera, por isso a grelha só perde as fotos que o
   * servidor CONFIRMOU — e assim não é preciso código de reversão nenhum (o
   * `reinsertAt` não entra nisto).
   *
   * As que falharam e as que já lá estavam ficam SELECIONADAS: é o padrão que o
   * `ThemePicker` já usa ("o que falhou volta a ser a seleção"), e evita que
   * repetir a operação obrigue a escolher tudo de novo.
   */
  function applyCopyOutcome(r: ThemeCopyOutcome) {
    setCopyOpen(false);
    if (r.copied.length > 0) onCopiedTo(r.destId, r.copied.length);
    if (r.mode === "mover" && r.copied.length > 0) {
      const gone = new Set(r.copied);
      setImages((prev) => prev.filter((im) => !gone.has(im.path)));
      setTotal((t) => (t === null ? null : Math.max(0, t - r.copied.length)));
      // A capa que saiu deixa de o ser: o servidor já a limpou na origem.
      setCoverPath((c) => (c && gone.has(c) ? undefined : c));
      anchor.current = null;
    }
    // O que continua aqui: o que falhou, o que já lá estava, e — quando ela
    // carregou em "Parar" — o que nem chegou a ser tentado. As três coisas têm
    // o mesmo remédio (voltar a mandar), por isso ficam todas selecionadas.
    const stuck = new Set([...r.failed, ...r.existing, ...r.untouched]);
    setSelected((prev) => new Set([...prev].filter((p) => stuck.has(p))));

    // O cartão vermelho fica no ecrã enquanto houver fotos por levar; um
    // número em que ela precisa de agir não pode desaparecer como um aviso.
    setCopyReport(r.failed.length > 0 || r.stopped ? r : null);
    if (r.failed.length > 0 || r.stopped) return;

    const verbo = r.mode === "copiar" ? "copiadas" : "movidas";
    const cauda = r.existing.length > 0 ? ` — ${r.existing.length} já lá estavam.` : ".";
    toast(
      r.copied.length === 0
        ? `Estas fotos já estavam todas em "${r.destName}".`
        : `${plural(r.copied.length, `foto ${verbo.slice(0, -1)}`, `fotos ${verbo}`)} para "${r.destName}"${cauda}`,
      "success",
    );
    // Sem miniatura, o tema de destino passa a puxar ORIGINAIS (medido: 164 MB
    // por página de 60, contra 1,78 MB). Se acontecer em massa ela tem de saber
    // porquê — senão vê o tema a arrastar-se e não faz ideia da razão.
    if (r.thumbsMissing > 0) {
      toast(
        `${plural(r.thumbsMissing, "foto chegou", "fotos chegaram")} a "${r.destName}" sem miniatura. Abre esse tema e usa "Gerar miniaturas em falta".`,
        "info",
      );
    }
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LARGAR UM LOTE NUM TEMA DA COLUNA — FASE 08
   * ══════════════════════════════════════════════════════════════════════
   *
   * «Arrastar para um tema da lista lateral… dentro do mesmo tema reordena;
   * para outro tema MOVE… sempre com Anular.» (Parte 4 do
   * `docs/APPLE-TEMAS.md`.)
   *
   * ── PORQUE É QUE ISTO NÃO É UM SEGUNDO «COPIAR PARA…» ─────────────────
   *
   * Porque é o MESMO. O pedido que sai daqui é o que o `ThemeCopyDialog` já
   * fazia — `POST /api/temas/{origem}/imagens/copiar` com `modo: "mover"`, em
   * pedaços de `THEME_COPY_CHUNK` —, e o que chega de volta entra no
   * `applyCopyOutcome`, que já sabe tirar da grelha só o que o servidor
   * confirmou, corrigir a capa que saiu e deixar seleccionado o que ficou
   * para trás. O arrasto é uma segunda PORTA para a operação, não uma segunda
   * operação: é exactamente a alternativa obrigatória da Parte 4, lida ao
   * contrário («Mover para… faz o mesmo sem arrastar»).
   *
   * O que é próprio do arrasto, e só dele, são as três coisas que este método
   * acrescenta: a contagem enquanto espera, o anúncio em `role="status"`, e o
   * «Anular» dentro do aviso.
   */
  async function moverParaTema(destino: ThemeSummary, paths: string[]) {
    if (paths.length === 0 || destino.id === theme.id) return;
    setAMover({ feito: 0, total: paths.length });
    const copied: { from: string; to: string }[] = [];
    const existing: string[] = [];
    const failed: string[] = [];
    let thumbsMissing = 0;
    for (let i = 0; i < paths.length; i += THEME_COPY_CHUNK) {
      const chunk = paths.slice(i, i + THEME_COPY_CHUNK);
      try {
        const res = await fetch(`/api/temas/${theme.id}/imagens/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk, destino: destino.id, modo: "mover" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(res.status));
        for (const c of Array.isArray(data?.copied) ? data.copied : []) {
          if (typeof c?.from === "string" && typeof c?.to === "string") copied.push(c);
        }
        existing.push(...(Array.isArray(data?.existing) ? data.existing : []));
        failed.push(...(Array.isArray(data?.failed) ? data.failed : []));
        thumbsMissing += typeof data?.thumbsMissing === "number" ? data.thumbsMissing : 0;
      } catch {
        // O pedaço que falha inteiro conta como falha das suas fotos: elas
        // continuam aqui, e o `applyCopyOutcome` deixa-as seleccionadas para
        // se poder repetir sem as escolher de novo.
        failed.push(...chunk);
      }
      if (!alive.current) return;
      setAMover({ feito: Math.min(i + THEME_COPY_CHUNK, paths.length), total: paths.length });
    }
    if (!alive.current) return;
    setAMover(null);
    applyCopyOutcome({
      mode: "mover",
      destId: destino.id,
      destName: destino.name,
      copied: copied.map((c) => c.from),
      existing,
      failed,
      untouched: [],
      thumbsMissing,
      stopped: false,
    });
    if (copied.length === 0) {
      setAnuncio(fraseDeMovimentoFalhado(paths.length, destino.name));
      return;
    }
    setAnuncio(fraseDoMovimento(copied.length, destino.name));
    /* ── E NENHUMA ACÇÃO A UM GESTO SEM ANULAR ──────────────────────────
       Parte 9, e o critério 6 do documento. Um arrasto é o gesto mais fácil
       de fazer sem querer que este ecrã tem — o ponteiro passa por cima da
       coluna a caminho de outra coisa — e mover quarenta fotografias para o
       tema errado sem saída era a versão em ponto grande do `×` a um clique
       que o ponto 19 mandou tirar. */
    //
    // O «Anular» é o da casa (10 s, `ui/anular.ts`). O `anularMovimento` diz o
    // resultado à sua maneira — quantas voltaram, e onde ficaram as outras —,
    // por isso devolve `false` e não aparece um «Anulado.» por cima.
    anular(fraseDoMovimento(copied.length, destino.name), async () => {
      await anularMovimento(destino, copied);
      return false;
    });
  }

  /**
   * Desfaz um arrasto: as fotografias voltam do destino para aqui.
   *
   * O caminho é o mesmo ao contrário — um `mover` a partir do tema de destino,
   * com os caminhos NOVOS (o `to` que o servidor devolveu). E a seguir a pasta
   * relê a primeira página em vez de repor de memória: ver a nota do `recarga`
   * — o que volta tem caminhos e URLs assinados novos, e o objecto que estava
   * na grelha já não descreve nenhum ficheiro.
   */
  async function anularMovimento(destino: ThemeSummary, movidas: { from: string; to: string }[]) {
    const paths = movidas.map((m) => m.to);
    setAMover({ feito: 0, total: paths.length });
    let devolvidas = 0;
    for (let i = 0; i < paths.length; i += THEME_COPY_CHUNK) {
      const chunk = paths.slice(i, i + THEME_COPY_CHUNK);
      try {
        const res = await fetch(`/api/temas/${destino.id}/imagens/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk, destino: theme.id, modo: "mover" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(res.status));
        devolvidas += Array.isArray(data?.copied) ? data.copied.length : 0;
      } catch {
        // Fica dito no fim, com o número certo: anular metade é uma coisa que
        // ela tem de ver, não uma que se cale.
      }
      if (!alive.current) return;
      setAMover({ feito: Math.min(i + THEME_COPY_CHUNK, paths.length), total: paths.length });
    }
    if (!alive.current) return;
    setAMover(null);
    // O cartão do destino perde o que devolveu (o `onCopiedTo` soma, e um
    // número negativo subtrai — ver a prop). O desta pasta corrige-se sozinho
    // quando a recarga trouxer o total novo.
    if (devolvidas > 0) onCopiedTo(destino.id, -devolvidas);
    bibliotecaAlterada();
    setRecarga((n) => n + 1);
    setAnuncio(fraseDoRegresso(devolvidas, theme.name));
    toast(
      devolvidas === paths.length
        ? fraseDoRegresso(devolvidas, theme.name)
        : `${fraseDoRegresso(devolvidas, theme.name)} As restantes ficaram em «${destino.name}».`,
      devolvidas === paths.length ? "success" : "error",
    );
  }

  /**
   * Fixa a ordem que está à vista.
   *
   * Guarda-se o que ESTÁ carregado (cortado no teto do servidor): essas fotos
   * passam a ser o prefixo arrumado do tema e tudo o resto continua a vir por
   * data, atrás delas. É o que faz "pôr as boas à frente" custar meia dúzia de
   * caminhos em vez de uma cópia do catálogo.
   */
  async function persistOrder(
    next: ThemeImage[],
    previous: ThemeImage[],
    destino: number,
    comAnular = true,
  ): Promise<boolean> {
    const oQue = `guardar a nova ordem das fotos de "${theme.name}"`;
    // SÓ A ÚLTIMA ARRUMAÇÃO FALA. Cada Alt+seta é um PATCH seu, e cinco toques
    // seguidos a empurrar a mesma foto davam cinco avisos iguais empilhados —
    // ruído que ensina a não ler os avisos. O número diz qual é a arrumação
    // mais recente; as que ficaram para trás guardam-se na mesma, caladas.
    const minha = ++ordemMandada.current;
    /** A ordem volta ao que estava — e a frase diz que voltou. Mostrar uma
     *  arrumação que o servidor não guardou seria mentir-lhe até ao próximo
     *  recarregamento; deixá-la voltar sem aviso é pior ainda, porque ela vê a
     *  foto que arrastou saltar de novo para o sítio antigo. */
    const reverter = (mensagem: string) => {
      if (!alive.current) return;
      setImages(previous);
      toast(`${mensagem} A grelha voltou à ordem anterior.`, "error");
    };
    let res: Response;
    try {
      res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoOrder: next.slice(0, MAX_PHOTO_ORDER).map((im) => im.path) }),
      });
    } catch {
      reverter(porqueRebentou(oQue).mensagem);
      return false;
    }
    if (res.ok) {
      // O QUE NÃO SE VÊ É O SERVIDOR. A foto salta para o lugar novo no
      // instante do arrasto — o que ficava por dizer era se a arrumação lá
      // ficou, e a única pista era a grelha saltar para trás quando falhava.
      // Um ecrã que só fala quando corre mal é um ecrã em que o silêncio não
      // quer dizer nada.
      //
      // E diz a POSIÇÃO: numa grelha de sessenta fotos iguais, «ordem
      // guardada» não deixa reconhecer o gesto que foi mesmo guardado.
      //
      // E com «Anular»: a grelha volta à ordem de antes, gravada pelo mesmo
      // PATCH. (O próprio «Anular» não traz outro — diz «Anulado.».)
      if (comAnular && alive.current && minha === ordemMandada.current) {
        anular(`Ordem guardada — a foto ficou na posição ${destino + 1} de ${next.length}.`, () => {
          if (!alive.current) return false;
          setImages(previous);
          return persistOrder(previous, next, destino, false);
        });
      }
      return true;
    }
    const data = await res.json().catch(() => null);
    // A queixa da instalação por acabar (`db/schema.sql`) passa inteira: é uma
    // instrução para quem monta isto, e nenhuma frase nossa a substitui.
    const doServidor = typeof data?.error === "string" ? data.error : "";
    reverter(
      /db\/schema\.sql|base de dados/i.test(doServidor)
        ? doServidor
        : porqueFalhou(oQue, res, data).mensagem,
    );
    return false;
  }

  /** Move uma foto para outra posição da grelha (arrasto, setas ou "para o início"). */
  function moveTo(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      const next = moveItem(prev, from, to);
      if (next === prev) return prev;
      void persistOrder(next, prev, to);
      return next;
    });
  }

  /** Perguntar por uma foto solta. Quem age é o `removeImages`. */
  function pedirParaRemoverUma(im: ThemeImage) {
    setARemover({ alvos: [im], emBloco: false });
  }

  /**
   * Perguntar pelo lote seleccionado.
   *
   * Sem selecção não há pergunta nenhuma: perguntar «remover 0 fotografias?»
   * seria pedir uma decisão sobre nada.
   */
  function pedirParaRemoverAsSeleccionadas() {
    const targets = images.filter((i) => selected.has(i.path));
    if (targets.length === 0) return;
    setARemover({ alvos: targets, emBloco: true });
  }

  async function removeSelected(targets: ThemeImage[]) {
    if (targets.length === 0) return;
    setBulkBusy(true);
    // A remoção é otimista: a grelha e a seleção esvaziam-se já, e a barra de
    // ações desaparece com elas. O cartão fica no lugar dela, no mesmo sítio
    // colado ao topo — senão as fotos sumiam e mais nada dizia que ainda havia
    // pedidos a caminho do servidor.
    setEmBloco({ tipo: "remover", feito: 0, total: targets.length });
    try {
      await removeImages(targets, (feitas) => {
        if (!alive.current) return;
        setEmBloco((p) => (p && p.tipo === "remover" ? { ...p, feito: feitas } : p));
      });
    } finally {
      if (alive.current) {
        setBulkBusy(false);
        setEmBloco(null);
      }
    }
  }

  /** Escolhe a foto que representa o tema na lista. */
  async function setAsCover(im: ThemeImage, comAnular = true): Promise<boolean> {
    const capaAntes = coverPath;
    // Aqui não há nada a reverter: a capa só muda no ecrã depois de o servidor
    // confirmar. O que faltava era a frase saber distinguir a sessão expirada
    // do servidor em baixo — e nomear o tema, que é o que ela tem seis vezes
    // aberto em separadores diferentes.
    const oQue = `definir a capa de "${theme.name}"`;
    let res: Response;
    try {
      res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPath: im.path }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, data).mensagem, "error");
      return false;
    }
    setCoverPath(im.path);
    onCover(im.path, capaDaFoto(im));
    clearSelection();
    // Com «Anular» quando a capa de antes está à mão (carregada na grelha):
    // volta a ser ela, pelo mesmo PATCH. Sem ela carregada não há os campos
    // que o cartão da lista precisa (`capa-do-cartao.ts`), e não se oferece.
    const fotoAntes = capaAntes ? images.find((i) => i.path === capaAntes) : undefined;
    if (comAnular && fotoAntes && fotoAntes.path !== im.path) {
      anular(`A capa de "${theme.name}" mudou.`, () => setAsCover(fotoAntes, false));
    }
    return true;
    // AQUI NÃO SE DIZ NADA, e é de propósito. A capa só muda depois de o
    // servidor confirmar, e o que ele confirmou aparece na própria foto que ela
    // escolheu — a etiqueta «Capa» no canto da célula, mais a barra da seleção
    // a desaparecer. Um aviso a dizer o que já está à frente dos olhos é ruído,
    // e é a mesma decisão que a estrela dos temas já tinha: o `alternarMarca`
    // avisa ao arquivar (o cartão sai da lista) e cala-se ao fixar (a estrela
    // acende-se à vista).
  }

  async function rename() {
    // O Enter fecha o campo e o onBlur dispara logo a seguir: sem esta guarda
    // saíam dois PATCH iguais para o servidor.
    if (renamingBusy.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === theme.name) {
      setName(theme.name);
      setRenaming(false);
      return;
    }
    renamingBusy.current = true;
    // O nome antigo fica guardado aqui: depois do `onRename` a lista lá fora já
    // mudou, e a frase precisa dos DOIS nomes para dizer o que mudou.
    const antigo = theme.name;
    const oQue = `mudar "${antigo}" para "${trimmed}"`;
    /** O campo volta ao nome antigo — e a frase diz que voltou, senão ela lê o
     *  nome antigo no cabeçalho e julga que escreveu no sítio errado. */
    const reverter = (falha: Falha) => {
      setName(theme.name);
      toast(`${falha.mensagem} O nome voltou a "${theme.name}".`, "error");
    };
    try {
      let res: Response;
      try {
        res = await fetch(`/api/temas/${theme.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {
        reverter(porqueRebentou(oQue));
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        reverter(porqueFalhou(oQue, res, data));
        return;
      }
      onRename(trimmed);
      // COM OS DOIS NOMES, como o renomear que se faz a partir da lista
      // (`renomearDaLista`) já dizia. «Tema renomeado.» obrigava a ir conferir
      // ao cabeçalho se o que lá ficou era mesmo o que ela escreveu — e com
      // seis pastas abertas em separadores diferentes, nem dizia qual.
      //
      // Com «Anular»: o nome de antes, pelo mesmo PATCH. Um 409 (outro tema
      // ficou entretanto com esse nome) diz-se e não aparece «Anulado.».
      anular(`"${antigo}" passou a "${trimmed}"`, async () => {
        const volta = `voltar a chamar "${antigo}" a "${trimmed}"`;
        let r: Response;
        try {
          r = await fetch(`/api/temas/${theme.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: antigo }),
          });
        } catch {
          toast(porqueRebentou(volta).mensagem, "error");
          return false;
        }
        if (!r.ok) {
          toast(
            r.status === 409
              ? `Já há um tema chamado "${antigo}".`
              : porqueFalhou(volta, r, await r.json().catch(() => null)).mensagem,
            "error",
          );
          return false;
        }
        onRename(antigo);
        if (alive.current) setName(antigo);
        return true;
      });
    } finally {
      renamingBusy.current = false;
      setRenaming(false);
    }
  }

  // O `aoSubir` é um `setState` do pai, portanto estável entre desenhos.
  useEffect(() => {
    aoSubir?.(uploadingCount > 0);
    return () => aoSubir?.(false);
  }, [uploadingCount, aoSubir]);

  /** Sair com um lote a meio abandona o que falta — é preciso dizê-lo. */
  function leave() {
    if (uploadingCount > 0 && !window.confirm(AVISO_DE_LOTE_A_MEIO)) return;
    onBack();
  }

  // Uma leitura bem sucedida põe SEMPRE um número em `total` (nem que seja o
  // tamanho da página que veio), por isso `null` aqui só pode querer dizer uma
  // coisa: a pasta não pôde ser lida. Escrever "0 fotos" nesse caso leria-se
  // como "as minhas fotos desapareceram".
  const unreadable = !loading && total === null;
  const countLine = unreadable
    ? photoCountLabel(null)
    : images.length < (total ?? 0)
      ? `${images.length} de ${photoCountLabel(total, truncated)}`
      : photoCountLabel(total ?? 0, truncated);
  const selectedCount = selected.size;
  /** Há para onde levar fotos? Sem outro tema, "Copiar para…" seria um botão
   *  que só sabe abrir um diálogo vazio. */
  const otherThemes = useMemo(() => themes.filter((t) => t.id !== theme.id), [themes, theme.id]);
  // Ver uma foto em grande. `null` = fechado. Guarda-se também o elemento que
  // estava focado, para o foco voltar ao mosaico de onde se abriu.
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  /** O menu do botão direito desta pasta — um só, como na lista de temas. */
  const [menuDaFoto, setMenuDaFoto] = useState<PedidoDeMenu | null>(null);
  const fecharMenuDaFoto = useCallback(() => setMenuDaFoto(null), []);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  /**
   * ── DE ONDE É QUE A LUPA CRESCE ────────────────────────────────────────
   *
   * «Entrada com `--ease-quick` a partir da POSIÇÃO DA MINIATURA (FLIP), não
   * do centro do ecrã.» (Parte 3 do `docs/APPLE-TEMAS.md`.) Para isso é
   * preciso o rectângulo da célula no instante do gesto — e depois disso a
   * célula pode estar tapada, ou fora do ecrã, ou já não existir.
   *
   * As células registam-se aqui pelo índice. Um `Map` e não um array: as
   * células desmontam-se por baixo (o `content-visibility` da
   * `.celula-saltavel` não desmonta, mas a remoção de uma foto sim) e um
   * array com buracos é um array que engana quem o percorre.
   */
  const celulas = useRef(new Map<number, HTMLElement>());

  /* ════════════════════════════════════════════════════════════════════════
     A GRELHA PELO TECLADO — fase 11 (`docs/APPLE-TEMAS.md`, Parte 7)
     ════════════════════════════════════════════════════════════════════════

     O desenho do Calendário (`diaPelaTecla`): a grelha é UM sítio no fio do
     Tab, e lá dentro as setas andam. Sessenta fotos eram sessenta paragens do
     Tab — mais sessenta «⋯» — antes de se chegar ao que vem depois.

     As colunas MEDEM-SE: o `GRELHA_DE_FOTOS` é `auto-fill`, e o número muda
     com a largura da caixa (2 no telemóvel, 4 a 6 no computador). O browser
     já fez a conta — o `grid-template-columns` calculado traz uma largura por
     coluna —, e é essa conta que se lê. Sem `ResizeObserver` (jsdom) fica o 2
     da base, que é o que a classe diz antes de qualquer `@container`. */
  const grelha = useRef<HTMLDivElement | null>(null);
  const [colunas, setColunas] = useState(2);
  const [fotoComFoco, setFotoComFoco] = useState(0);
  const semFotos = images.length === 0;
  useEffect(() => {
    const el = grelha.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      // `none` é o que o jsdom (e uma caixa sem `display: grid`) responde: não
      // é uma coluna, é a ausência de grelha — fica o que estava.
      const v = getComputedStyle(el).gridTemplateColumns;
      if (!v || v === "none") return;
      const n = v.split(" ").filter(Boolean).length;
      if (n > 0) setColunas(n);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // A grelha só existe depois de carregar e com fotos: é quando ela aparece
    // (e não a cada foto) que há uma caixa nova a medir.
  }, [loading, semFotos]);
  const [origemDaLupa, setOrigemDaLupa] = useState<DOMRect | null>(null);
  const openZoom = useCallback((i: number) => {
    zoomOpener.current = document.activeElement as HTMLElement | null;
    const celula = celulas.current.get(i);
    setOrigemDaLupa(celula?.getBoundingClientRect() ?? null);
    setZoomAt(i);
  }, []);
  const closeZoom = useCallback(() => {
    setZoomAt(null);
    // O foco volta de onde veio; sem isto ficava no <body> e o teclado perdia-se.
    zoomOpener.current?.focus?.();
  }, []);

  /** Transfere uma foto (a do visualizador ou a de um mosaico). */
  // Uma foto é um original de vários MB: passa pelo `useDescarga`, que conta
  // os bytes à medida que chegam (o visualizador mostra-os no botão).
  const umaFoto = useDescarga();
  const downloadImage = useCallback(
    async (im: ThemeImage, i: number) => {
      try {
        const { blob } = await umaFoto.obter(im.url);
        // O nome é o NOSSO (tema + número), não o do armazenamento.
        guardarBlob(blob, downloadName(im, theme.name, i));
      } catch {
        toast("Não foi possível transferir a foto.", "error");
      }
    },
    [theme.name, toast, umaFoto],
  );

  /** Transfere as fotos selecionadas, uma de cada vez (ver photo-download.ts). */
  const downloadSelected = useCallback(async () => {
    const chosen = images.map((im, i) => ({ im, i })).filter(({ im }) => selected.has(im.path));
    if (chosen.length === 0) return;
    setDownloading(true);
    // O `downloadMany` já contava — e o `() => {}` que estava aqui deitava a
    // conta fora. Quarenta fotos são um a dois minutos: sem isto, o que ela vê
    // é um botão parado.
    setEmBloco({ tipo: "transferir", feito: 0, total: chosen.length });
    const res = await downloadMany(
      chosen.map(({ im, i }) => ({ url: im.url, filename: downloadName(im, theme.name, i) })),
      (p) => {
        if (alive.current) setEmBloco({ tipo: "transferir", feito: p.done, total: p.total });
      },
    );
    if (alive.current) setEmBloco(null);
    setDownloading(false);
    if (res.failed > 0) {
      toast(
        res.failed === res.total
          ? "Não foi possível transferir as fotos."
          : `${res.total - res.failed} de ${res.total} transferidas.`,
        "error",
      );
    } else {
      toast(plural(res.done, "foto transferida", "fotos transferidas"), "success");
    }
  }, [images, selected, theme.name, toast]);
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  /**
   * Há fotos a ser mostradas a partir do ORIGINAL — é o que acontece a tudo o
   * que foi carregado antes de as miniaturas existirem. Não é uma suposição: é
   * lido das fotos que estão à vista (as que subiram agora contam-se como
   * feitas, porque a miniatura foi com elas).
   */
  const missingThumbs = images.some((im) => !im.thumbUrl && !localSrc.has(im.path));
  const thumbPct =
    thumbJob && thumbJob.total && thumbJob.total > 0
      ? Math.min(100, Math.round((thumbJob.cursor / thumbJob.total) * 100))
      : 0;

  /* ── AS DUAS CAIXAS DESTA VISTA FICAM MONTADAS A SAIR ────────────────────
     A folha de copiar fotos e o visualizador. Os dois fechavam a seco porque
     era este componente que os desmontava; agora o fecho continua a acontecer
     no instante do gesto e o que se segura, 200 ms, é só a imagem.

     Os dados vão CONGELADOS (ver `useNoEcraAteSair`), e aqui isso não é zelo:
     o `applyCopyOutcome` fecha a folha e, na mesma volta, tira da grelha as
     fotos que foram movidas. Sem congelar, a folha passava os 200 ms da saída
     a dizer «0 fotos selecionadas» — a última coisa que se lia dela era uma
     contagem errada. */
  /* Memorizada porque tem de ser ESTÁVEL entre desenhos — ver a nota do
     `useNoEcraAteSair`. E pela ordem da GRELHA, não pela ordem por que ela
     clicou: é assim que a lista do relatório se lê como a grelha se vê. */
  const seleccionadas = useMemo(
    () => images.filter((im) => selected.has(im.path)).map((im) => im.path),
    [images, selected],
  );
  const aSairDaCopia = useSaidaDeUmSo(copyOpen);
  const copiaNoEcra = useNoEcraAteSair(copyOpen, aSairDaCopia, seleccionadas);

  /**
   * ── ⌘A SELECIONA TUDO, ESC LIMPA ───────────────────────────────────────
   *
   * Os dois atalhos que faltavam à selecção desta pasta (ponto 15 da auditoria
   * e a `SelectionBar` da Parte 3 do `docs/APPLE-TEMAS.md`: «Esc limpa a
   * seleção»). Com 312 fotos numa pasta, escolher todas era 312 cliques.
   *
   * ── O QUE ESTE OUVINTE NÃO PODE ROUBAR ────────────────────────────────
   *
   *  · o ⌘A DENTRO DE UM CAMPO — renomear o tema é um `<input>`, e lá o ⌘A
   *    selecciona o texto. Roubá-lo seria tirar um atalho para dar outro;
   *  · o Esc de quem tem uma janela aberta por cima — a pergunta de remover, o
   *    «Copiar para…», a lupa e o próprio menu de contexto fecham-se com Esc, e
   *    quem carrega está a fechar ESSA e não a desfazer a selecção que fez
   *    antes de a abrir. Por isso os quatro travam aqui;
   *  · o ⌘A com a pasta vazia — sem fotos não há nada a seleccionar, e
   *    `preventDefault` sem fazer nada seria só um atalho estragado.
   *
   * `Escape` sem selecção não faz nada e NÃO trava o evento: o teclado do
   * back office tem outros donos por cima deste ecrã.
   */
  useEffect(() => {
    const janelaAberta = copyOpen || aRemover !== null || zoomAt !== null || renaming;
    const noTeclado = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        !!alvo &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      // No modo «escolher a capa» o Esc cancela o modo — e só isso: a
      // selecção que houvesse fica como estava.
      if (e.key === "Escape" && escolherCapa && !janelaAberta) {
        setEscolherCapa(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        if (aEscrever || janelaAberta || escolherCapa || images.length === 0) return;
        e.preventDefault();
        setSelected(new Set(images.map((im) => im.path)));
        // A âncora fica na última: um Shift+clique a seguir a um ⌘A encurta a
        // selecção a partir do fim, que é o que um gestor de ficheiros faz.
        anchor.current = images.length - 1;
        return;
      }
      if (e.key === "Escape" && !janelaAberta) {
        // Actualizador funcional: assim o ouvinte não precisa de conhecer a
        // selecção actual e não se volta a registar a cada foto escolhida.
        setSelected((prev) => (prev.size > 0 ? new Set() : prev));
        anchor.current = null;
      }
    };
    document.addEventListener("keydown", noTeclado);
    return () => document.removeEventListener("keydown", noTeclado);
  }, [images, copyOpen, aRemover, zoomAt, renaming, escolherCapa]);

  /**
   * ── A LARGADA CHEGA DA COLUNA DA ESQUERDA ──────────────────────────────
   *
   * O `dragstart` é aqui, o `drop` é lá, e o `pedidoDeMover` é o que os liga
   * (ver a nota no `Temas`). O efeito dispara pelo CONTADOR e não pelo
   * objecto: dois arrastos seguidos para o mesmo tema com as mesmas fotos são
   * dois pedidos, e um `useEffect` que comparasse o destino não via o segundo.
   *
   * O `spring loading` pode ter aberto OUTRO tema antes da largada, e nesse
   * caso esta pasta já não é a origem do lote — por isso o pedido só é servido
   * quando a carga saiu mesmo daqui.
   */
  const pedidoServido = useRef(0);
  useEffect(() => {
    if (!pedidoDeMover || pedidoDeMover.n === pedidoServido.current) return;
    pedidoServido.current = pedidoDeMover.n;
    if (pedidoDeMover.carga.origem !== theme.id) return;
    void moverParaTema(pedidoDeMover.destino, pedidoDeMover.carga.paths);
    // `moverParaTema` fecha sobre o estado actual da grelha de propósito — é
    // uma função do corpo, como o `moveTo` e o `setAsCover`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeMover, theme.id]);

  /**
   * ── O MENU DE UMA FOTOGRAFIA ───────────────────────────────────────────
   *
   * «Menu de contexto no tema e NA FOTOGRAFIA» (ponto 8 da auditoria). As
   * quatro acções são as que já estão desenhadas em cima da célula — é a regra
   * da Apple que o documento cita: «tudo o que está no menu de contexto existe
   * também na interface principal». Aqui ganham nome escrito, que é o que os
   * três círculos sem rótulo do ponto 18 nunca tiveram.
   *
   * Os botões da célula FICAM (ao contrário dos chips do cartão de tema, que
   * saíram): cada um é o único caminho de DEDO para o que faz — o arrasto de
   * reordenar é HTML5 e não pega no telemóvel — e um menu de contexto sem
   * botão direito não existe. A razão está escrita por extenso na célula.
   */
  const accoesDaFoto = useCallback(
    (im: ThemeImage, i: number): AccaoDeItem[] =>
      emGrupos(
        /* ── PELA ORDEM DO DOCUMENTO ──────────────────────────────────────
           Parte 3 do `docs/APPLE-TEMAS.md`: «Pré-visualizar · Abrir tamanho
           real — separador — Mover para… · Duplicar para… · Definir como
           capa — separador — Remover do tema». O «Remover do tema…» guarda
           as reticências porque continua a perguntar antes de remover.

           «Pôr no início» voltou ao menu a 14/10, quando o ↑ da célula
           saiu com os outros dois círculos: é o caminho de dedo para isso
           (com teclado também há o Alt+Home). */
        [
          { id: "ver", rotulo: "Pré-visualizar", onAccao: () => openZoom(i) },
          {
            id: "original",
            rotulo: "Abrir tamanho real",
            // O original, num separador novo — o que o browser faz com ele é
            // dele (ver, guardar, imprimir). `noopener`: a página aberta não
            // fica com a mão nesta.
            onAccao: () => void window.open(im.url, "_blank", "noopener"),
          },
        ],
        [
          /* ── A ALTERNATIVA POR MENU É OBRIGATÓRIA ─────────────────────
             «Alternativa por menu obrigatória — "Mover para…" faz o mesmo sem
             arrastar.» [APPLE], Parte 4. Abre a folha que já existe
             (`ThemeCopyDialog`) no modo certo, e leva a foto do menu se ela
             não estiver na selecção. «Duplicar para…» é a mesma folha em
             «Copiar». Só com outros temas para onde levar. */
          ...(otherThemes.length > 0
            ? [
                {
                  id: "mover",
                  rotulo: "Mover para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("mover");
                    setCopyOpen(true);
                  },
                },
                {
                  id: "duplicar",
                  rotulo: "Duplicar para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("copiar");
                    setCopyOpen(true);
                  },
                },
              ]
            : []),
          ...(im.path === coverPath
            ? []
            : [{ id: "capa", rotulo: "Definir como capa", onAccao: () => void setAsCover(im) }]),
          /* Era o ↑ da célula, que saiu com os outros dois círculos (14/10):
             passa a ser uma linha do menu, para continuar a haver um caminho
             de dedo — o arrasto de reordenar é HTML5 e não pega no
             telemóvel. Na primeira foto não aparece: já está no início. */
          ...(i > 0
            ? [{ id: "inicio", rotulo: "Pôr no início", onAccao: () => moveTo(i, 0) }]
            : []),
        ],
        [
          {
            id: "remover",
            rotulo: "Remover do tema…",
            destrutiva: true,
            onAccao: () => pedirParaRemoverUma(im),
          },
        ],
      ),
    // `setAsCover` e `pedirParaRemoverUma` são funções do corpo do componente
    // e mudam a cada desenho de propósito (fecham sobre o estado actual da
    // grelha). O que importa fixar é a foto e a capa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverPath, openZoom, otherThemes.length],
  );

  /* AS FOTOS QUE ELA ACABOU DE LARGAR, já à vista, ainda a caminho do
     servidor. Não são selecionáveis nem removíveis (ainda não existem lá), e o
     leitor de ecrã segue a barra de progresso — não 300 células a
     anunciarem-se. Ocupam as primeiras casas da grelha, e é por isso que a
     conta das linhas (e das setas) começa nelas. */
  const pendentes = pending.map((p) => (
    <div
      key={p.id}
      aria-hidden
      title={`${p.name} — a carregar`}
      className="relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
    >
      {p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.src}
          alt=""
          decoding="async"
          className="h-full w-full object-cover opacity-60"
        />
      ) : (
        <div className="bo-skeleton h-full w-full" />
      )}
      <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white">
        A carregar
      </span>
    </div>
  ));

  /** Uma célula da grelha: a foto `i` de `images`. */
  /** A foto que está no fio do Tab — uma só; as outras chegam-se pelas setas. */
  const focoNaGrelha = Math.max(0, Math.min(fotoComFoco, images.length - 1));
  const focarFoto = (k: number) => {
    setFotoComFoco(k);
    celulas.current.get(k)?.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
  };

  const celulaDaFoto = (im: ThemeImage, i: number) => {
    const isSelected = selected.has(im.path);
    const isCover = im.path === coverPath;
    return (
      <div
        key={im.path}
        role="gridcell"
        aria-selected={isSelected}
        aria-rowindex={Math.floor((pending.length + i) / colunas) + 1}
        aria-colindex={((pending.length + i) % colunas) + 1}
        ref={(no) => {
          if (no) celulas.current.set(i, no);
          else celulas.current.delete(i);
        }}
        draggable
        onDragStart={(e) => {
          setDragFrom(i);
          e.dataTransfer.effectAllowed = "move";
          // Alguns navegadores só iniciam o arrasto com dados lá
          // dentro; o valor não é usado por ninguém.
          e.dataTransfer.setData("text/plain", String(i));
          /* ── E O MESMO GESTO SERVE OS DOIS DESTINOS ─────────
               «Dentro do mesmo tema REORDENA; para outro tema
               MOVE.» [APPLE] É um arrasto só, com duas cargas: o
               índice em `text/plain`, que é o que as células
               vizinhas lêem para reordenar, e o lote de caminhos no
               tipo próprio, que é o que a coluna da esquerda lê
               para mover. Quem decide é o destino onde ele acaba.

               E o lote é a SELECÇÃO quando se pega numa foto que
               está nela — ver `fotosQueViajam`. */
          const lote = fotosQueViajam(
            im.path,
            selected,
            images.map((x) => x.path),
          );
          escreverCarga(e.dataTransfer, { origem: theme.id, paths: lote });
          vestirOArrasto(e, lote.length);
          aoArrastar?.(true);
        }}
        onDragEnd={(e) => {
          // Ver a nota do `aRegressar`: `none` é a norma a dizer
          // que isto não foi largado em destino nenhum.
          const falhou = e.dataTransfer?.dropEffect === "none";
          setDragFrom(null);
          setDragOver(null);
          aoArrastar?.(false);
          setARegressar(falhou ? im.path : null);
        }}
        // O regresso acaba quando acaba — sem temporizador a
        // repetir o número que já está no token. Deixá-lo aceso
        // punha esta célula (e só ela) a responder ao rato em
        // 475 ms para sempre.
        onTransitionEnd={() => setARegressar((p) => (p === im.path ? null : p))}
        onDragOver={(e) => {
          if (dragFrom === null) return;
          // Sem isto o browser recusa a largada.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOver !== i) setDragOver(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null) moveTo(dragFrom, i);
          setDragFrom(null);
          setDragOver(null);
        }}
        // `celula-saltavel`: fora do ecrã, o browser não desenha
        // nem descodifica esta célula. A altura não depende disso
        // (é `aspect-[4/3]` numa coluna de largura fixa), por
        // isso a barra de deslocamento não mexe. Ver globals.css.
        /* O botão direito abre as mesmas quatro acções que os
             botões da célula — ver `accoesDaFoto`. O menu é `fixed`,
             portanto o `overflow-hidden` desta célula (que a recorta
             aos cantos redondos) não o corta. */
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuDaFoto({
            x: e.clientX,
            y: e.clientY,
            sobre: `foto ${i + 1} de ${images.length}`,
            accoes: accoesDaFoto(im, i),
          });
        }}
        className={`celula-saltavel group relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] ${ESTADO} ${
          isSelected
            ? "border-sage-600 ring-2 ring-sage-600/40"
            : "border-[var(--bo-hairline-strong)]"
        } ${dragFrom === i ? "opacity-40" : ""} ${
          dragOver === i && dragFrom !== null && dragFrom !== i ? "ring-2 ring-sage-600" : ""
        } ${
          // Os tokens do documento, lidos do `:root` — nem o
          // número nem a curva se escrevem aqui.
          aRegressar === im.path
            ? "motion-safe:[transition-duration:var(--transition-duration-reposition)] motion-safe:[transition-timing-function:var(--ease-reposition)]"
            : ""
        }`}
      >
        {/* A célula já tem `aspect-[4/3]`, por isso adiar a foto
              não salta nada. E o que se mostra é a MINIATURA: com o
              original, uma página de 60 fotos puxava ~150 MB. As da
              primeira dobra não esperam pela vez de ninguém. */}
        <Photo image={im} alt="" priority={i < ABOVE_FOLD} localSrc={localSrc.get(im.path)} />
        {/* A célula inteira é o alvo da seleção — um alvo pequeno
              numa grelha de 60 fotos seria um exercício de pontaria. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onFocus={() => setFotoComFoco(i)}
          aria-label={
            escolherCapa
              ? `Usar a foto ${i + 1} de ${images.length} como capa`
              : `Selecionar foto ${i + 1} de ${images.length}`
          }
          onClick={(e) => {
            // No modo «escolher a capa», o clique escolhe-a.
            if (escolherCapa) {
              setEscolherCapa(false);
              void setAsCover(im);
              return;
            }
            // `ctrlKey` ao lado do `metaKey` porque o back office
            // também se abre em Windows e em Linux, onde o gesto
            // de somar à selecção é o Ctrl.
            toggleAt(i, { shift: e.shiftKey, somar: e.metaKey || e.ctrlKey });
          }}
          // ── `ESPAÇO` PRÉ-VISUALIZA ──────────────────────────
          // «É o gesto que qualquer utilizador de Mac tenta
          // primeiro» (ponto 23), e o critério 5 do documento.
          // Anunciado, para não ser um segredo: um atalho que só
          // quem leu o documento conhece não existe.
          aria-keyshortcuts="Space"
          onKeyDown={(e) => {
            /* ── O `ESPAÇO` É DO QUICK LOOK, O `ENTER` ALTERNA ──────
                 Fase 11 (`docs/APPLE-TEMAS.md`, Parte 7): a célula é
                 um `role="gridcell"` com `aria-selected`, e numa
                 grelha o `Espaço` não é de ninguém — fica para o
                 Quick Look, como o documento manda duas vezes. Marcar
                 e desmarcar é o `Enter`, que num `<button>` dispara o
                 `click`. A caixa de seleção cá dentro continua (é o
                 alvo do dedo e do rato, a célula inteira), e o
                 `aria-checked` dela diz o mesmo que o `aria-selected`
                 da célula. */
            if (e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              openZoom(i);
              return;
            }
            // Shift+F10 e a tecla de menu: o botão direito do
            // teclado, ancorado ao canto de baixo da célula.
            if (teclaDeMenu(e)) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuDaFoto({
                x: r.left,
                y: r.bottom,
                sobre: `foto ${i + 1} de ${images.length}`,
                accoes: accoesDaFoto(im, i),
              });
              return;
            }
            // SEM o Alt, as setas andam entre as fotos (`fotoPelaTecla`),
            // e o `Shift` leva a selecção com elas. As fotos a carregar
            // ocupam as primeiras casas: entram na conta das linhas, mas
            // o foco não pára nelas.
            if (!e.altKey) {
              const P = pending.length;
              const v = fotoPelaTecla(
                P + i,
                e.key,
                colunas,
                P + images.length,
                e.metaKey || e.ctrlKey,
              );
              if (v === null) return;
              e.preventDefault();
              const para = Math.max(P, v) - P;
              if (para === i) return;
              if (e.shiftKey && e.key.startsWith("Arrow")) estenderPeloTeclado(i, para);
              focarFoto(para);
              return;
            }
            // Alt + setas move a foto.
            const to =
              e.key === "ArrowLeft" || e.key === "ArrowUp"
                ? i - 1
                : e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? i + 1
                  : e.key === "Home"
                    ? 0
                    : null;
            if (to === null) return;
            e.preventDefault();
            const destino = Math.max(0, Math.min(images.length - 1, to));
            // O foco vai com a foto (a célula é a mesma, pela `key`), e o
            // fio do Tab também.
            setFotoComFoco(destino);
            moveTo(i, destino);
          }}
          className={`absolute inset-0 h-full w-full ${ESTADO} ${PRESSAO}`}
        >
          {/* O círculo da selecção, à maneira da app Fotografias:
                um anel branco fino sobre um véu escuro leve (sem
                sombra: esta casa não põe sombras em conteúdo — ver
                `sombras-do-back-office.test.ts`), e cheio com o
                visto quando está escolhida (14/10, «tipo apple»). */}
          <span
            aria-hidden
            className={`absolute left-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-white ${ESTADO} ${
              isSelected
                ? "bg-sage-600 text-white opacity-100"
                : "bg-black/25 text-transparent opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </button>
        {isCover && (
          <span className="bo-vidro-claro pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
            Capa
          </span>
        )}
        {/* ── UM SÓ «⋯», EM VIDRO CLARO ───────────────────────────
              Eram três círculos escuros (↑, ⤢, ×) por cima de cada
              fotografia. O documento dela manda um só, e ela
              escolheu-o (14/10, «tipo apple»): «um botão discreto ⋯
              no canto superior direito, em vidro claro, que abre o
              mesmo menu do botão direito» (APPLE-TEMAS, ponto 9 e
              critério 3). As acções passam a ter nome escrito.

              O desenho é o do «⋯» do cartão de tema — 28 px à vista,
              `.bo-vidro-claro`, glifo branco, sem desfoque (um por
              foto eram centenas) — e o alvo cresce para os 44 no
              dedo sem o disco crescer (`.alvo-invisivel`). O painel
              é o `MenuDeContexto`, que é `fixed`: o do
              `MenuDeAccoes` é `absolute` e esta célula é
              `overflow-hidden`, portanto sairia cortado.

              Continua tudo a um caminho de dedo: Pré-visualizar,
              Pôr no início, Remover… estão no menu. Com rato, só
              aparece por cima da foto ou com o foco lá dentro. */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuDaFoto?.de === im.path}
          aria-label={`Acções da foto ${i + 1} de ${images.length}`}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenuDaFoto({
              x: r.left,
              y: r.bottom + 4,
              de: im.path,
              sobre: `foto ${i + 1} de ${images.length}`,
              accoes: accoesDaFoto(im, i),
            });
          }}
          className={`bo-vidro-claro alvo-invisivel absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100 com-rato:focus-visible:opacity-100 ${
            menuDaFoto?.de === im.path ? "com-rato:opacity-100" : ""
          } ${ESTADO} ${PRESSAO}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </div>
    );
  };

  const aSairDaLupa = useSaidaDeUmSo(zoomAt !== null);
  const indiceDaLupa = useNoEcraAteSair(zoomAt !== null, aSairDaLupa, zoomAt);

  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════
          O CABEÇALHO DO TEMA (9/11)
          ══════════════════════════════════════════════════════════════

          Ela: «melhora mesmo imenso essa parte dos temas. quero mesmo algo
          incrível». O tema abria com o nome em `text-xl` e «3 fotos» em letra
          de 12 px ao lado — o cabeçalho de uma pasta, não de uma colecção.

          Agora é o título da vista, no degrau `title1` da casa, e por baixo
          UMA linha que responde ao que se pergunta antes de escolher fotos:
          quantas tem, quantas vezes já saiu numa proposta, e quando lhe
          tocaram. A nota do tema, quando a há, vem logo a seguir — é a frase
          que ela escreveu para se lembrar do que o tema é. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* ── «← TEMAS» DESAPARECE NO SPLIT VIEW ──────────────────────
              Parte 6 do `docs/APPLE-TEMAS.md`, à letra: «← Temas →
              (desaparece — split view)». A partir de `lg` o caminho de volta
              é o «Todos os temas» da coluna da esquerda, e ter os dois seria
              duas saídas com nomes diferentes para o mesmo sítio.

              Abaixo de `lg` a coluna não existe, e este botão é o único
              caminho — por isso não sai, esconde-se onde há substituto. */}
            <Button variant="ghost" size="sm" onClick={leave} className="lg:hidden">
              ← Temas
            </Button>
            {renaming ? (
              <div>
                <input
                  autoFocus
                  value={name}
                  maxLength={MAX_THEME_NAME}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={rename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename();
                    if (e.key === "Escape") {
                      setName(theme.name);
                      setRenaming(false);
                    }
                  }}
                  aria-label="Nome do tema"
                  className="bo-input px-3 py-1.5 text-sm text-[var(--bo-text)]"
                />
                <SugestaoDeNome valor={name} onAceitar={setName} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className={`alvo-toque text-left font-display text-title2 text-[var(--bo-text)] hover:text-sage-600 sm:text-title1 ${ESTADO} ${PRESSAO}`}
                title="Renomear tema"
              >
                {theme.name}
              </button>
            )}
          </div>
          <p
            className="mt-1 text-footnote tabular-nums text-[var(--bo-text-muted)]"
            aria-live="polite"
          >
            {loading ? "A ler a pasta…" : countLine}
            {usos && !loading
              ? usos[theme.id]
                ? ` · usado em ${plural(usos[theme.id], "proposta", "propostas")}`
                : " · nunca usado numa proposta"
              : ""}
            {!loading && desdeQuando(theme.updatedAt) ? (
              <span title={dataPorExtenso(theme.updatedAt)}>
                {` · alterado ${/^\d/.test(desdeQuando(theme.updatedAt) ?? "") ? "a " : ""}${desdeQuando(theme.updatedAt)}`}
              </span>
            ) : null}
            {theme.favorito ? (
              <span className="text-[var(--bo-accent)]">
                {" · "}
                <span aria-hidden="true">★ </span>Favorito
              </span>
            ) : null}
          </p>
          {theme.notes?.trim() ? (
            <p className="mt-2 max-w-prose text-callout text-[var(--bo-tinta-72)]">{theme.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            iconLeft={PlusIcon}
            loading={uploadingCount > 0}
            onClick={() => inputRef.current?.click()}
          >
            Adicionar fotos
          </Button>
          {/* ── «ELIMINAR TEMA» SAIU DAQUI ───────────────────────────────
              T3 do `docs/PROPOSTAS-E-TEMAS-APPLE.md` e ponto 20 da auditoria
              do `APPLE-TEMAS.md`: era um botão de texto encostado a
              «Adicionar fotos» — uma acção destrutiva com o peso de um link,
              ao lado da acção principal. Passa para o «⋯» das acções do
              tema, a vermelho e no fim, com a confirmação que diz o custo.
              O «⋯» está sempre à vista: aqui não há linha nenhuma a cujo
              hover ele pudesse responder. */}
          <MenuDeAccoes accoes={accoes} sobre={theme.name} sempreVisivel />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {/* A VERIFICAR — a fase que acontece ANTES de preparar seja o que for.
          Curta (medido: ~16 ms por foto, quatro em voo) mas não pode ser
          silenciosa: sem isto, um arrasto de 300 fotos ficava um segundo e
          meio aparentemente parado antes de a primeira entrar na grelha. */}
      {verifying && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-[var(--bo-text)]">
            A verificar {plural(verifying.total, "foto", "fotos")} — {verifying.done} de{" "}
            {verifying.total}…
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            A ver quais já estão neste tema, para não as carregar outra vez.
          </p>
        </Card>
      )}

      {progress && (
        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--bo-text)]">
              A carregar <strong className="font-medium">{progress.done}</strong> de{" "}
              {plural(progress.total, "foto", "fotos")}…
            </p>
            <span className="bo-text-muted text-xs">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso do carregamento"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
          >
            {/* Era `duration-elemento`, que PEDE 250 ms e não gera regra
                nenhuma: o espaço de nomes que o Tailwind v4 lê para os
                utilitários `duration-*` é `--transition-duration-*`, e a casa
                declarou `--duration-*` (ponto 3 de `ui/movimento.ts`). A barra
                corria, na prática, nos 150 ms de omissão. O `PROGRESSO` escreve
                os mesmos 250 ms num utilitário que compila mesmo. */}
            <div
              className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
          <p className="bo-text-muted mt-2 text-xs">
            Podes ir fazer outra coisa — enquanto este separador ficar aberto, as fotos continuam a
            subir e vão aparecendo aqui.
          </p>
        </Card>
      )}

      {/* MINIATURAS EM FALTA — só aparece quando há mesmo fotos a ser
          mostradas a partir do original, e desaparece quando deixa de haver. */}
      {(missingThumbs || thumbJob) && !unreadable && (
        <Card padding="sm" className="mb-4">
          {thumbJob?.running ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-[var(--bo-text)]">
                  A gerar miniaturas —{" "}
                  <strong className="font-medium">
                    {plural(thumbJob.generated, "criada", "criadas")}
                  </strong>{" "}
                  em {thumbJob.scanned} fotos vistas
                  {thumbJob.total ? ` de ${thumbJob.total}` : ""}…
                </p>
                <span className="bo-text-muted text-xs">{thumbPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Progresso da geração de miniaturas"
                aria-valuemin={0}
                aria-valuemax={thumbJob.total ?? undefined}
                aria-valuenow={thumbJob.cursor}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
              >
                <div
                  className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
                  style={{ transform: `scaleX(${thumbPct / 100})` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    stopThumbs.current = true;
                  }}
                >
                  Parar
                </Button>
                <span className="bo-text-muted text-xs">
                  Podes continuar a trabalhar — e parar a meio não perde nada: da próxima vez
                  continua de onde ficou.
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--bo-text)]">
                {missingThumbs
                  ? "Há fotos antigas sem miniatura — a grelha está a mostrar as fotos em tamanho real (uns 2,6 MB cada), e é por isso que este tema demora a abrir."
                  : "As miniaturas deste tema estão feitas."}
              </p>
              {thumbJob && (
                <p className="bo-text-muted mt-1 text-xs">
                  {plural(thumbJob.generated, "miniatura criada", "miniaturas criadas")} ·{" "}
                  {thumbJob.scanned} fotos vistas
                  {thumbJob.failed > 0
                    ? ` · ${plural(thumbJob.failed, "foto sem miniatura", "fotos sem miniatura")}`
                    : ""}
                  {thumbJob.complete ? " · concluído" : " · parado a meio"}
                </p>
              )}
              {missingThumbs && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => void runThumbJob()}>
                    {thumbJob ? "Continuar a gerar miniaturas" : "Gerar miniaturas em falta"}
                  </Button>
                  <span className="bo-text-muted text-xs">
                    As fotos originais não são alteradas.
                  </span>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {failed.length > 0 && (
        <Card
          padding="sm"
          className="mb-4 border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/40"
        >
          <p className="text-sm text-[var(--bo-text)]">
            {plural(failed.length, "foto não subiu", "fotos não subiram")}. Os ficheiros ficaram
            guardados — não é preciso voltar a escolhê-los.
          </p>
          <p className="bo-text-muted mt-1 text-xs">{failed[0].message}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={retryFailed}>
              Tentar novamente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFailed([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* JÁ ESTAVAM NO TEMA — a caixa tem a forma da do "tentar novamente", mas
          NEUTRA: isto não é uma avaria, é o que ela pediu a acontecer. Um só
          botão, e por LOTE: nunca uma pergunta foto a foto. */}
      {skipped.length > 0 && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-[var(--bo-text)]">
            {plural(skipped.length, "foto não foi adicionada", "fotos não foram adicionadas")} —{" "}
            {skipped.some((s) => s.reason === "no-tema") &&
            skipped.some((s) => s.reason === "no-lote")
              ? "já estavam neste tema ou vinham repetidas no mesmo arrasto"
              : skipped[0].reason === "no-lote"
                ? "vinham repetidas dentro do mesmo arrasto"
                : `já ${skipped.length === 1 ? "estava" : "estavam"} em “${theme.name}”`}
            .
          </p>
          {legacyPhotos && (
            <p className="bo-text-muted mt-1 text-xs">
              As fotos carregadas antes desta funcionalidade nem sempre podem ser reconhecidas.
            </p>
          )}
          {partialCheck && (
            <p className="bo-text-muted mt-1 text-xs">
              Não foi possível ver a pasta toda desta vez — pode ter escapado alguma repetida.
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2">
            {skipped.slice(0, SKIPPED_PREVIEWS).map((s, i) => (
              <li
                key={`${s.file.name}-${i}`}
                title={`${s.file.name} — ${
                  s.reason === "no-lote" ? "repetida neste arrasto" : "já estava no tema"
                }`}
                className="h-14 w-14 overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
              >
                <SkippedThumb file={s.file} track={trackUrl} />
              </li>
            ))}
          </ul>
          {skipped.length > SKIPPED_PREVIEWS && (
            <p className="bo-text-muted mt-2 text-xs">
              …e mais {skipped.length - SKIPPED_PREVIEWS}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={addSkippedAnyway}>
              Adicionar mesmo assim
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSkipped([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* O QUE NÃO FOI LEVADO para outro tema. Vermelho e persistente: é um
          número em que ela tem de agir, e as fotos continuam aqui. */}
      {copyReport && (
        <Card
          padding="sm"
          className="mb-4 border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/40"
        >
          <p className="text-sm text-[var(--bo-text)]">
            {copyReport.failed.length > 0
              ? `${copyReport.failed.length} de ${
                  copyReport.copied.length + copyReport.existing.length + copyReport.failed.length
                } ${
                  copyReport.failed.length === 1
                    ? copyReport.mode === "copiar"
                      ? "não foi copiada"
                      : "não foi movida"
                    : copyReport.mode === "copiar"
                      ? "não foram copiadas"
                      : "não foram movidas"
                } para “${copyReport.destName}”.`
              : `Parou a meio — ${plural(copyReport.copied.length, "foto foi", "fotos foram")} para “${copyReport.destName}”.`}
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            {copyReport.failed.length > 0
              ? "Continuam neste tema e ficaram selecionadas — podes tentar outra vez sem as escolher de novo."
              : "As que faltavam continuam neste tema e ficaram selecionadas — podes retomar sem as escolher de novo."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  // Repetir é repetir O MESMO: um lote de «mover» parado a
                  // meio não pode ser retomado como cópia.
                  setCopyMode(copyReport.mode);
                  setCopyOpen(true);
                }}
              >
                Tentar novamente
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setCopyReport(null)}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* A BARRA DA SELEÇÃO E A ESPERA DO QUE ELA MANDOU FAZER, no mesmo
          bloco colado ao topo.

          São dois cartões e não um: a remoção esvazia a seleção logo (é
          otimista), a barra de ações desaparece nesse instante e o cartão da
          espera tem de FICAR — os pedidos ainda vão a caminho. A "Transferir"
          faz o contrário: a seleção mantém-se e os dois vêem-se juntos.

          O `sticky` está no invólucro para que a espera acompanhe o scroll tal
          como a barra acompanhava; a 390 px cada um ocupa a largura toda e
          empilham. */}
      {/* ── O QUE O ARRASTO DIZ A QUEM OUVE O ECRÃ ──────────────────────────
          «Operações de arrasto anunciadas em `role="status"`» (Parte 7), e a
          Parte 4 dá a frase: «3 fotografias movidas para Bouquets
          Campestres.» O toast não serve para isto — flutua no canto, some ao
          fim de quatro segundos e o «Anular» que ele carrega é para quem VÊ.

          `aria-label` porque esta página tem outras duas regiões `status` (o
          `ToastProvider` e o estado da vista da lista); sem nome, quem navega
          por regiões encontra três iguais. Vazia em repouso — uma região viva
          com texto lá dentro é lida outra vez a cada re-desenho. */}
      <p role="status" aria-live="polite" aria-label="Movimento de fotografias" className="sr-only">
        {anuncio}
      </p>

      {(selectedCount > 0 || emBloco || aMover) && (
        <div className="sticky top-2 z-20 mb-4 flex flex-col gap-2">
          {selectedCount > 0 && (
            /* ── A PRIMEIRA SUPERFÍCIE DE VIDRO A SÉRIO DA CASA ──────────
               «Aplica-o a uma superfície só — e olha para ela num ecrã com
               fotografias por trás. É onde o efeito se prova.»
               (`docs/LIQUID-GLASS.md`, Parte 7, ponto 3.)

               É esta. A Parte 6 manda o vidro para «a barra de filtros» dos
               Temas e deixa os cartões opacos, e esta é a barra que flutua
               neste ecrã: fica colada ao topo enquanto a grelha de fotografias
               lhe passa por baixo. O documento dela pedia a barra do portal do
               cliente, e essa não existe — o portal é um documento que rola,
               sem sub-navegação nem barra de preço. Trocá-la por esta mantém a
               condição que interessa (fotografias a mexer por trás) e não
               inventa um ecrã para provar um material.

               O que estava aqui era `backdrop-blur` com o fundo a 95%: o
               «frosted glass» que a Parte 1 diagnostica, e opaco ao ponto de o
               desfoque não se ver.

               ── E PORQUE É QUE O FUNDO É 78% E NÃO MENOS ──────────────────
               Porque a Parte 5 diz que o texto sobre vidro precisa de fundo
               próprio, e este texto não tem nenhum. MEDIDO, no pior caso de
               cada tema — foto preta por baixo em claro, foto branca em
               escuro:

                   fundo   texto 82%        dica 72%
                   70%     6,73 / 4,55      4,88 / 3,95   ← a dica reprova
                   78%     7,97 / 5,86      6,03 / 4,95   ✓
                   86%     9,27 / 7,56      —             (vidro por ver)

               Os 78% são o ponto onde o vidro se vê E o pior caso continua
               acima de 4,5:1. A dica sobe de 64% para 72% de tinta pela mesma
               conta: a 64% reprovava a qualquer opacidade que deixasse ver o
               material. Continua a ler-se como secundária — 72 contra 82. */
            <Glass
              superficie="barra"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-sage-600/25 bg-[var(--bo-surface)]/78 px-4 py-3"
            >
              <p className="text-sm text-[var(--bo-text)]">
                {plural(selectedCount, "foto selecionada", "fotos selecionadas")}
              </p>
              <span className="hidden text-xs text-[var(--bo-tinta-72)] sm:inline">
                Shift + clique seleciona tudo o que está pelo meio.
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {selectedCount === 1 && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      const one = images.find((i) => selected.has(i.path));
                      if (one) setAsCover(one);
                    }}
                  >
                    Definir como capa
                  </Button>
                )}
                {/* ⚠️ "Transferir", aqui ao lado, já significa DESCARREGAR. Esta
                ação chama-se "Copiar para…" — a palavra transferir está
                proibida para ela, senão passam a existir dois significados no
                mesmo sítio. Só aparece havendo outro tema para onde levar. */}
                {otherThemes.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCopyMode("copiar");
                      setCopyOpen(true);
                    }}
                  >
                    Copiar para…
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={downloading}
                  onClick={downloadSelected}
                >
                  Transferir
                </Button>
                <Button size="sm" variant="secondary" onClick={clearSelection}>
                  Limpar seleção
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={bulkBusy}
                  onClick={pedirParaRemoverAsSeleccionadas}
                >
                  Remover
                </Button>
              </div>
            </Glass>
          )}
          {aMover && (
            /* A espera do arrasto, no mesmo sítio e com o mesmo desenho da
               transferência e da remoção. Um lote de quarenta fotografias
               demora, e a única coisa que se via era a grelha parada. */
            <div className="rounded-xl bg-[var(--bo-surface)]/95 backdrop-blur">
              <EmCurso
                titulo="A mover as fotos…"
                feito={aMover.feito}
                total={aMover.total}
                nota="Podes continuar a usar o ecrã. Se te enganaste, o aviso no fim traz «Anular»."
              />
            </div>
          )}
          {emBloco && (
            /* Fundo opaco por baixo: o cartão da espera é translúcido de
               propósito (é um tom sobre o papel), e colado ao topo passava a
               ter as fotos a rolar por trás. */
            <div className="rounded-xl bg-[var(--bo-surface)]/95 backdrop-blur">
              <EmCurso
                titulo={
                  emBloco.tipo === "transferir" ? "A transferir as fotos…" : "A remover as fotos…"
                }
                feito={emBloco.feito}
                total={emBloco.total}
                nota={
                  emBloco.tipo === "transferir"
                    ? "Uma de cada vez — é assim que o navegador as deixa passar todas. Podes continuar a usar o ecrã."
                    : "As propostas já feitas com estas fotos não são afetadas."
                }
              />
            </div>
          )}
        </div>
      )}

      {copiaNoEcra && (
        <ThemeCopyDialog
          aberto={copyOpen}
          modoInicial={copyMode}
          sourceTheme={theme}
          themes={themes}
          // Congelada no instante do fecho, para a contagem não mudar a meio
          // da saída — o `applyCopyOutcome` tira da grelha, na mesma volta, as
          // fotos que foram movidas.
          paths={copiaNoEcra}
          onClose={() => setCopyOpen(false)}
          onDone={applyCopyOutcome}
        />
      )}

      <MenuDeContexto pedido={menuDaFoto} onFechar={fecharMenuDaFoto} />

      {indiceDaLupa !== null && images[indiceDaLupa] && (
        <PhotoLightbox
          aberto={zoomAt !== null}
          images={images}
          index={indiceDaLupa}
          onIndexChange={setZoomAt}
          onClose={closeZoom}
          onDownload={downloadImage}
          downloading={downloading || umaFoto.aCorrer}
          transferencia={umaFoto.mostrar ? umaFoto.barra : null}
          // De onde a lupa cresce. `null` quando a célula já não está no ecrã
          // — aí abre como abria, do centro.
          origem={origemDaLupa}
        />
      )}

      {/* A faixa do modo «escolher a capa». Opaca, como a grelha por baixo
          dela — vidro só no que flutua (`docs/LIQUID-GLASS.md`, Parte 5), e
          esta vista já tem a sua camada na barra da selecção. */}
      {escolherCapa && (
        <div
          data-escolher-capa
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--bo-raio-conteudo)] bg-[var(--bo-accent-lavagem)] px-3 py-2"
        >
          <p role="status" className="text-sm text-[var(--bo-text)]">
            Escolhe a fotografia da capa.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setEscolherCapa(false)}>
            Cancelar
          </Button>
        </div>
      )}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDrag(false);
          // As `entries` têm de sair do DataTransfer AGORA: ele é esvaziado
          // assim que este handler retorna, e o resto do trabalho é `async`.
          const entries = readDropEntries(e.dataTransfer);
          const files = Array.from(e.dataTransfer?.files ?? []);
          void handleDrop(entries, files);
        }}
        // A marca por onde os testes encontram esta caixa. Era a classe
        // `border-dashed`, e deixou de servir no dia em que o tracejado passou
        // a existir só durante um arrasto (fase 07) — um selector que depende
        // de um estado transitório é um selector que encontra a zona de largar
        // metade das vezes.
        data-zona-de-largar=""
        // `@container`: é ESTA caixa que o `GRELHA_DE_FOTOS` mede. A largura
        // dela não acompanha a da janela a partir de `lg`, onde a navegação
        // passa a ocupar 256 px em fluxo — a conta toda está no comentário do
        // `GRELHA_DE_FOTOS`.
        /* ══════════════════════════════════════════════════════════════════
           O TRACEJADO SÓ EXISTE DURANTE UM ARRASTO — FASE 07
           ══════════════════════════════════════════════════════════════════

           Ponto 17 da auditoria, e o critério 8: «a área tracejada está sempre
           visível… um tracejado permanente é ruído que ensina a ignorar o
           sinal. A grelha é só a grelha.» [APPLE, Drag and drop: mostrar sinal
           de aceitação SÓ sobre um destino válido, durante o arrasto.]

           Três estados, e a moldura tem sempre 1 px para a geometria não
           saltar (é ela que o `zonaDeLargar` do teste conta):

             · a arrastar ficheiros por cima → tracejado no acento, e o realce
               do contentor. É o sinal de aceitação, e só aqui;
             · com fotografias na grelha → moldura TRANSPARENTE. A grelha é só
               a grelha;
             · sem fotografias nenhumas → um fio da casa, contínuo. Não é uma
               zona de largar a anunciar-se: é a moldura da frase que ocupa o
               lugar das fotografias, e sem ela o texto fica solto no meio da
               página. Contínuo e não tracejado, que é a diferença entre uma
               moldura e um convite.

           A `bo-cena` não entra aqui: ver a nota do split view.

           ── A GRELHA ALINHA COM O RESTO DA PÁGINA (9/11) ──────────────────
           A moldura tem `p-4` para o realce do arrasto ter onde respirar, e
           com isso as fotografias ficavam 17 px para dentro do título e da
           margem — no telemóvel começavam aos 34 px quando tudo o resto
           começa aos 16. `-mx-4 -mt-4` devolve esses 16 px: as fotografias
           alinham com o título, e o realce do arrasto estende-se 16 px para
           fora delas, como na app Fotografias. */
        className={`@container -mx-4 -mt-4 rounded-2xl border p-4 ${ESTADO} ${
          drag
            ? "border-dashed border-sage-600/60 bg-sage-600/[0.06]"
            : images.length === 0 && pending.length === 0
              ? "border-[var(--bo-hairline-strong)]"
              : "border-transparent"
        }`}
      >
        {loading ? (
          <div className={GRELHA_DE_FOTOS}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="bo-skeleton aspect-[4/3] min-h-[104px] rounded-lg"
                aria-hidden
              />
            ))}
          </div>
        ) : unreadable ? (
          // Falha de leitura NÃO é "tema sem fotos": dizer-lhe para arrastar
          // fotos aqui seria convidá-la a duplicar o que já lá está.
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--bo-tinta-72)]">
              Não foi possível ler a pasta deste tema agora.
            </p>
            <p className="bo-text-muted mt-1 text-xs">
              {/* A razão, quando se sabe qual foi. O texto de reserva é para a
                  pasta que o SERVIDOR disse não ter conseguido ler (um 200 com
                  `ok: false`): aí ele já respondeu, e o que se sabe é mesmo só
                  que a falha é do lado de lá e passageira. */}
              {falhaDaPasta?.mensagem ??
                "É uma falha temporária — as fotos não desapareceram. Recarrega a página daqui a pouco."}
            </p>
          </div>
        ) : images.length === 0 && pending.length === 0 ? (
          <div className="py-12 text-center">
            <p className="bo-text-muted text-sm">
              Arrasta para aqui as fotos deste tema — ou uma pasta inteira —, ou usa “Adicionar
              fotos”.
            </p>
            <p className="bo-text-muted mt-1 text-xs">JPG, PNG ou WEBP · também HEIC do iPhone</p>
          </div>
        ) : (
          <>
            {/* ── UMA SÓ `role="row"`, E A LINHA DITA EM CADA CÉLULA ──────
                Agrupar as células em linhas a sério (um `<div role="row">`
                por linha) era o óbvio, e foi o primeiro a ser feito. Partia
                uma coisa: o número de colunas MEDE-SE, e muda — ao abrir (2
                da classe → 5 medidas), ao alargar a janela, a cada foto que
                sai e empurra as outras uma casa para trás. Uma célula que
                muda de pai é, para o React, uma célula NOVA: desmontava-se, a
                miniatura voltava a fazer o fade e o original perdia a vez na
                fila dos descarregamentos (o teste «a foto que está no ecrã
                não espera pelas que não estão» apanhou-o).

                Fica uma linha só, que não muda nunca, e a posição de cada
                foto vai no `aria-rowindex` / `aria-colindex` dela — é o que
                deixa o leitor de ecrã dizer «linha 3, coluna 2» sem a árvore
                mexer. A geometria é a do `GRELHA_DE_FOTOS`: a linha é
                `display: contents`, não ocupa caixa nenhuma. */}
            <div
              ref={grelha}
              role="grid"
              aria-multiselectable="true"
              aria-label={`Fotografias de ${theme.name}`}
              aria-rowcount={Math.ceil((pending.length + images.length) / colunas)}
              aria-colcount={colunas}
              className={`select-none ${GRELHA_DE_FOTOS}`}
            >
              <div role="row" className="contents">
                {pendentes}
                {images.map((im, i) => celulaDaFoto(im, i))}
              </div>
            </div>

            {hasMore ? (
              <div className="mt-4 flex flex-col items-center gap-1">
                <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
                  {remaining && remaining > 0
                    ? `Mostrar mais (faltam ${remaining}${truncated ? "+" : ""})`
                    : "Mostrar mais"}
                </Button>
                <p className="bo-text-muted text-xs">
                  As mais recentes aparecem primeiro. A grelha mostra {THEME_PAGE_SIZE} de cada vez
                  para o tema abrir depressa.
                </p>
              </div>
            ) : (
              images.length > THEME_PAGE_SIZE && (
                <p className="bo-text-muted mt-4 text-center text-xs">
                  Fim do tema — {plural(images.length, "foto", "fotos")}.
                </p>
              )
            )}
          </>
        )}
      </div>

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          Uma janela para os dois caminhos — a foto solta e o lote. Folha
          inferior no telemóvel, ao pé do polegar; o verbo no botão. */}
      <PerguntaDestrutiva
        aberto={!!aRemover}
        onFechar={() => setARemover(null)}
        titulo={
          !aRemover
            ? ""
            : aRemover.alvos.length === 1
              ? "Remover esta fotografia do tema?"
              : `Remover ${plural(aRemover.alvos.length, "fotografia", "fotografias")} de «${theme.name}»?`
        }
        aviso="As propostas já feitas com estas fotos não são afectadas. Ficam 30 dias na Reciclagem, de onde podem voltar."
        rotuloConfirmar={
          aRemover && aRemover.alvos.length > 1 ? "Remover as fotografias" : "Remover a fotografia"
        }
        // Fecha primeiro e só depois age: a grelha é optimista, e no lote a
        // barra de progresso toma o lugar da selecção — uma caixa por cima
        // taparia precisamente o que diz que ainda há pedidos a caminho.
        onConfirmar={() => {
          const pedido = aRemover;
          setARemover(null);
          if (!pedido) return;
          if (pedido.emBloco) void removeSelected(pedido.alvos);
          else void removeImages(pedido.alvos);
        }}
      />
    </div>
  );
}
