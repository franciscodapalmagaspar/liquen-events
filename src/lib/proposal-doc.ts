/**
 * Rich, multi-page proposal DOCUMENT model — mirrors the studio's real
 * landscape "PO Decoração" proposal (cover → apresentação → serviços →
 * mood boards → orçamento → condições → observações → contracapa).
 *
 * The FIXED boilerplate (terms, payment staging, cancellation, reservation
 * conditions) ships as defaults below so every proposal carries the studio's
 * standard wording; the back office overrides only what changes per event.
 */

import type { Disposicao } from "./pdf-editorial/mosaico";
import { SINAL_POR_OMISSAO } from "./money";
import type { Escolha } from "./proposta-escolhas";
import type { LayoutDeMoodboard } from "./proposal-geometria";

import { round2 } from "@/lib/money";

/** A single reference image in a mood board (base64-encoded JPEG or PNG bytes,
 *  with or without a `data:` prefix — the renderer sniffs the format). */
export type ImageData = string;

/** As fotografias que ela escolheu para uma página do PDF (`fotosDasPaginas`). */
export interface FotosDeUmaPagina {
  fotos: ImageData[];
  /** O enquadramento à mão de cada uma, em fracções (`null` = automático). */
  focos?: ({ x: number; y: number } | null)[];
}

/** Taxa de IVA por omissão (23% — taxa normal em Portugal continental). */
export const DEFAULT_VAT_RATE = 0.23;

/**
 * Validade de uma proposta, em dias, quando não se sabe a data do evento.
 *
 * Eram 30, e a proposta que a Líquen fazia à mão dizia 60. A 14/10 ela pediu
 * 90 e logo a seguir corrigiu-se: «não faz sentido dizer que a validade da
 * proposta é 90 dias e eles mandam uma proposta para o evento que é para a
 * semana». A validade passou a depender do evento — ver
 * {@link diasDeValidadePeloEvento} — e os 60 ficam como o máximo e o valor sem
 * data. Continua a poder ser mudada por proposta (`validUntilDays`, ou uma
 * data fixa em `validUntil`).
 */
export const DEFAULT_VALID_DAYS = 60;

/**
 * Com quantos dias de antecedência o casal tem de fechar o número de pessoas.
 *
 * Eram 15 no texto gerado e 25 na proposta feita à mão. Decisão dela: 25 — é o
 * que lhe dá margem para encomendar flores e material com o número certo. Vive
 * numa constante e não solto no meio da frase para não haver dois números
 * diferentes no mesmo documento no dia em que alguém mudar um deles.
 */
export const DIAS_PARA_CONFIRMAR_CONVIDADOS = 25;

/** Como interpretar o `totalAmount`: já COM IVA ("incluido") ou o IVA acresce
 *  ao valor indicado ("acrescer", i.e. "+ IVA"). */
export type VatMode = "incluido" | "acrescer";

/**
 * Fotos que a página de mood board do PDF chega a DESENHAR.
 *
 * É uma decisão de composição (uma foto grande à esquerda + grelha à direita),
 * não um limite técnico. Vive aqui, no modelo, e não no gerador, porque quem
 * precisa deste número são os DOIS lados: o gerador (`proposal-doc-pdf`, que é
 * `server-only`) para desenhar, e o estúdio, no browser, para avisar ao pôr a
 * sétima foto num mood board. Um número, um sítio.
 */
/**
 * Quantas fotos cabem num mood board.
 *
 * Eram 6, e vinham do único arranjo que existia (uma grande e uma grelha de
 * cinco). A proposta feita à mão chega às DEZ numa página, em duas filas — e é
 * isso que os layouts novos fazem. Ver `caixasDoMoodboard`.
 */
export const MOOD_BOARD_MAX_IMAGES = 10;

/**
 * Teto do tamanho de um documento GUARDADO (JSON, em bytes).
 *
 * Um `ProposalDoc` é texto e CAMINHOS de fotos, nunca bytes de imagem. Medido
 * com as formas reais: 4,3 KB só com o texto fixo do estúdio, ~13 KB numa
 * proposta cheia com um mood board, 18,5 KB no tecto de 80 fotos por documento
 * (o `MAX_IMAGES_PER_DOC` de proposal-doc-render.ts).
 * 512 KB é ~28× a maior proposta possível — folgado para o maior casamento e,
 * ainda assim, uma trava contra um cliente avariado a empurrar meio megabyte
 * para dentro da coluna `proposals.doc` (e, dali, para dentro da cópia de
 * segurança, que viaja inteira no corpo de um pedido).
 *
 * É de propósito o MESMO número que o rascunho do estúdio já usava
 * (`MAX_DRAFT_BYTES`, na rota /proposta-rascunho): o que se grava ao enviar é o
 * que se estava a rascunhar, e dois tetos diferentes deixariam passar um
 * rascunho que depois não se conseguia enviar.
 */
export const MAX_PROPOSAL_DOC_BYTES = 512 * 1024;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CAMPOS IRMÃOS EM INGLÊS — `…En`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela, entre traduzir-lhe a prosa automaticamente e escrever ela as
 * duas versões: escreve ela as duas. A razão é a que ela deu — a prosa vai num
 * documento de vinte mil euros, e uma tradução automática chega ao cliente sem
 * ninguém a ter lido.
 *
 * ── PORQUE É QUE É UM CAMPO AO LADO E NÃO UM MAPA À PARTE ─────────────────
 *
 * A alternativa óbvia era um `Record<chaveDoCampo, string>` no documento. A
 * chave desse mapa é POSICIONAL (`itemRotulo:0:3`), e este editor arrasta
 * grupos, apaga linhas, reordena mood boards e tem um botão «Alinhar pelos
 * Serviços» que permuta arrays inteiros. Depois de qualquer um desses gestos as
 * traduções ficavam coladas ao campo errado, em silêncio, num documento a
 * caminho de um cliente.
 *
 * Colado ao campo, o inglês viaja onde o português viaja — e viaja também para
 * dentro dos MODELOS PARCIAIS, que guardam um `ServiceGroup` ou um `MoodBoard`
 * isolado, fora do documento (`proposal-templates.ts`). Com um mapa lateral,
 * guardar um grupo como modelo perdia a tradução e ninguém dava por isso.
 *
 * ── AUSENTE É O QUE SEMPRE FOI ────────────────────────────────────────────
 *
 * Todos opcionais, e nenhum é semeado por {@link withProposalDefaults}: uma
 * proposta de 2025 lida da coluna `proposals.doc` continua a satisfazer o tipo,
 * e um documento sem estes campos desenha exactamente o que sempre desenhou —
 * ver `proposal-doc-bilingue.ts`, onde a regra vive.
 *
 * ── O QUE NÃO TEM SEGUNDA VERSÃO ──────────────────────────────────────────
 *
 * O dinheiro (fica à portuguesa nas duas línguas, decisão escrita em
 * `proposal-doc-textos.ts`), os nomes próprios, e os campos que o NOSSO código
 * escreve — `eventDate`, `eventType`, `ceremony`, `guests`, `ref` —, que já
 * saem traduzidos por reconhecimento. Dar-lhes uma segunda caixa era ter dois
 * mecanismos a escrever o mesmo campo, e no dia em que discordassem ninguém
 * sabia qual mandava.
 */

export interface MoodBoard {
  /** Elegant serif title, e.g. "Decoração Cerimónia". */
  title: string;
  /** O {@link MoodBoard.title} escrito por ela em inglês. Ver o bloco «OS
   *  CAMPOS IRMÃOS EM INGLÊS». */
  titleEn?: string;
  /**
   * Subtítulo opcional, por baixo do título.
   *
   * A proposta feita à mão tem «Complementos dos Noivos» com «Ramo de Noiva (a
   * definir com a Noiva)» por baixo: o primeiro diz o capítulo, o segundo diz o
   * que aquelas fotos são e o que ainda está por decidir. Sem ele, ou se perde
   * a segunda frase ou se enfia tudo num título com parênteses.
   */
  subtitulo?: string;
  /** O {@link MoodBoard.subtitulo} em inglês. */
  subtituloEn?: string;
  /** Uploaded reference photos, laid out as an automatic collage. */
  images: ImageData[];
  /** Optional handwritten-style annotation under the collage. */
  annotation?: string;
  /** A {@link MoodBoard.annotation} em inglês. */
  annotationEn?: string;
  /**
   * Como as fotos se dispõem na página.
   *
   * Ausente = o layout que o número de fotos sugere ({@link layoutSugerido}).
   * Guardar a escolha é o que faz uma proposta reaberta meses depois voltar a
   * sair como saiu — uma sugestão que mudasse com o código reescrevia páginas
   * de documentos já enviados.
   */
  layout?: LayoutDeMoodboard;
  /**
   * A DISPOSIÇÃO DAS FOTOGRAFIAS NO PDF NOVO, escolhida por ela (15/10).
   *
   * Ausente = a automática, pelo número de fotografias. É um campo novo, e não
   * o `layout` de cima, porque as propostas feitas antes do PDF novo têm o
   * `layout` gravado: se passasse a contar, o PDF delas mudava sozinho. Os
   * valores e o que cada um desenha estão em `pdf-editorial/mosaico.ts`.
   */
  disposicao?: Disposicao;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * AS CAIXAS TOMAM A FORMA DAS FOTOGRAFIAS
   * ════════════════════════════════════════════════════════════════════════
   *
   * `"forma-da-foto"` = nenhuma fotografia desta página é recortada: cada uma
   * recebe uma caixa com a forma que tem. Medido no arranjo em destaque antes
   * disto: uma foto ao alto perdia 68% da área, uma panorâmica 63%, e no mosaico
   * a média das formas mais comuns andava nos 40%. Uma foto de um portão coberto
   * de flores chegava à proposta com dois terços do portão de fora — e a página
   * existe para mostrar o portão.
   *
   * ── PORQUE É QUE ISTO É UM CAMPO E NÃO É O COMPORTAMENTO E PRONTO ───────
   *
   * O PDF de uma proposta NÃO é um ficheiro guardado: é redesenhado a partir
   * deste documento de cada vez que o casal abre o link (a cache é de memória e
   * morre com o processo). Mudar a geometria calada mudava a página de uma
   * proposta que já foi enviada, discutida ao telefone e talvez impressa. Por
   * isso a escolha nova nasce num campo que os documentos antigos não têm:
   * ausente, sai exactamente o que sempre saiu.
   *
   * Nos arranjos «filas» e «fila única» não muda nada — esses já davam a cada
   * foto a forma dela, e é medido: 0% de perda antes e depois.
   */
  enquadramento?: "forma-da-foto";
  /**
   * IDENTIDADE ESTÁVEL da página, para o editor.
   *
   * Não é impressa: o PDF só lê o título, as fotos e os textos. Existe porque
   * há estado do EDITOR que tem de sobreviver a arrastar um board para outro
   * sítio — hoje, saber quais estão colapsados. Com a identidade a ser a
   * posição, arrumar a lista trocava as dobras todas de sítio.
   *
   * Preenchida a partir da posição quando falta, como a dos serviços — ver
   * {@link withMoodBoardIds}.
   */
  id?: string;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * ESTA PÁGINA ESTÁ FECHADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «Marcar um board como concluído: fica bloqueado a
   * alterações acidentais, visualmente distinto, e desbloqueia-se com um
   * clique explícito.»
   *
   * Numa página com oito boards e quarenta fotos, o que já está decidido está
   * a metros do que ainda se está a decidir — e o gesto errado (uma tecla numa
   * caixa de texto, um arrasto que larga no sítio errado) custa trabalho que
   * ninguém volta a ver que se perdeu.
   *
   * Bloqueado, os campos ficam só de leitura e as fotos não se arrastam nem se
   * removem. Desbloquear é um clique — não é uma pergunta a que se responde sem
   * ler.
   */
  bloqueado?: boolean;
  /**
   * A FOTO QUE MANDA NA PÁGINA — índice dentro de `images`.
   *
   * Duas das cinco disposições dão a uma caixa muito mais área do que às
   * outras: o «destaque», por definição, e o «mosaico», cuja primeira célula é
   * a maior. Nessas, quem estivesse na primeira posição ficava grande — e essa
   * posição era, até aqui, a ordem por que as fotos foram carregadas.
   *
   * É uma MARCA e não uma reordenação: a ordem das fotos é dela e tem sentido
   * próprio nas outras disposições. A permutação faz-se ao desenhar, com a
   * mesma função dos dois lados (ver `proposal-moodboard.ts`).
   *
   * Ausente = a primeira, como sempre foi.
   */
  principal?: number;
}

export interface ServiceItem {
  /** IDENTIDADE ESTÁVEL da linha, para o editor (chave de React, arrasto,
   *  foco). Não é impressa: o PDF só lê `label`/`desc`. Ver {@link withServiceIds}. */
  id?: string;
  /** Bold label, e.g. "Reunião inicial" or "Decoração Cerimónia". */
  label: string;
  /** O {@link ServiceItem.label} em inglês. */
  labelEn?: string;
  /** Optional description shown after the label (Organização template). */
  desc?: string;
  /** A {@link ServiceItem.desc} em inglês. */
  descEn?: string;
}

export interface ServiceGroup {
  /** Identidade estável do grupo — ver {@link ServiceItem.id}. */
  id?: string;
  /** Ordinal marker, e.g. "a)". */
  letter?: string;
  /** Group title, e.g. "Decoração Floral de Casamento". */
  title: string;
  /** O {@link ServiceGroup.title} em inglês. */
  titleEn?: string;
  /** Sub-items (bullets); each is a label with an optional description. */
  items: ServiceItem[];
}

/**
 * Id de recurso para um grupo/item que ainda não tem nenhum — DERIVADO DA
 * POSIÇÃO, nunca sorteado.
 *
 * O editor usa o mesmo par de funções para desenhar as chaves de React antes de
 * o preenchimento chegar ao documento, por isso a linha nunca troca de
 * identidade a meio (que é exatamente o que fazia o cursor saltar).
 */
export function fallbackServiceGroupId(index: number): string {
  return `g${index}`;
}
export function fallbackServiceItemId(groupId: string, index: number): string {
  return `${groupId}~i${index}`;
}

/**
 * Devolve os grupos com `id` em todos os grupos e itens, preenchendo os que
 * faltam a partir da POSIÇÃO.
 *
 * Determinístico de propósito: isto corre a cada chamada de
 * {@link withProposalDefaults} — do lado do servidor, a cada pré-visualização e
 * a cada envio — e um id sorteado faria o MESMO documento serializar diferente
 * de cada vez (rascunho a "mudar" sozinho, gravações e comparações inúteis).
 *
 * Ids já existentes são respeitados; um id repetido (rascunho estragado) é
 * desempatado com um sufixo, também ele determinístico. Quando não há nada a
 * preencher devolve o MESMO array, para o editor poder comparar por identidade.
 */
export function withServiceIds(groups: readonly ServiceGroup[]): ServiceGroup[] {
  const used = new Set<string>();
  /** O `base`, ou `base_2`, `base_3`… até sair um id livre. */
  const free = (base: string): string => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
  let changed = false;
  const next = groups.map((g, gi) => {
    const groupId = free(g.id || fallbackServiceGroupId(gi));
    let itemsChanged = false;
    const items = (g.items ?? []).map((it, ii) => {
      const itemId = free(it.id || fallbackServiceItemId(groupId, ii));
      if (itemId === it.id) return it;
      itemsChanged = true;
      return { ...it, id: itemId };
    });
    if (groupId === g.id && !itemsChanged) return g;
    changed = true;
    return { ...g, id: groupId, items };
  });
  return changed ? next : (groups as ServiceGroup[]);
}

/**
 * Entre `antes` e `depois` só mudaram os ids? Então ninguém escreveu nada.
 *
 * O editor de serviços chama {@link withServiceIds} ao montar (os grupos que
 * vêm do pedido, ou de um rascunho antigo, não têm ids). Isso passava pelo
 * mesmo caminho de uma tecla, e o estúdio contava-o como «ela escreveu nos
 * Serviços» — com o resultado de, ao abrir noutro computador, pôr de lado os
 * Serviços que o servidor trazia e gravar por cima o vazio. Quem decide se a
 * pessoa escreveu tem de saber distinguir as duas coisas, e é esta a pergunta.
 */
export function soMudaramOsIds(
  antes: readonly ServiceGroup[] | undefined,
  depois: readonly ServiceGroup[] | undefined,
): boolean {
  const semIds = (gs: readonly ServiceGroup[] | undefined) =>
    JSON.stringify(
      (gs ?? []).map(({ id: _g, items, ...g }) => ({
        ...g,
        items: (items ?? []).map(({ id: _i, ...it }) => it),
      })),
    );
  return semIds(antes) === semIds(depois);
}

/** Id de uma página de inspiração que ainda não tem nenhum — DERIVADO DA
 *  POSIÇÃO, como o dos serviços e pelas mesmas razões (ver
 *  {@link withServiceIds}: um id sorteado faria o mesmo documento serializar
 *  diferente a cada chamada). */
export function fallbackMoodBoardId(index: number): string {
  return `mb${index}`;
}

/**
 * Devolve as páginas de inspiração com `id` em todas, preenchendo as que
 * faltam a partir da posição. Ids repetidos são desempatados com um sufixo,
 * também determinístico.
 *
 * Devolve o MESMO array quando não há nada a preencher, para o editor poder
 * comparar por identidade e não voltar a desenhar.
 */
export function withMoodBoardIds(boards: readonly MoodBoard[]): MoodBoard[] {
  const usados = new Set<string>();
  const livre = (base: string): string => {
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}_${n}`;
    usados.add(id);
    return id;
  };
  let mudou = false;
  const proximos = boards.map((b, i) => {
    const id = livre(b.id || fallbackMoodBoardId(i));
    if (id === b.id) return b;
    mudou = true;
    return { ...b, id };
  });
  return mudou ? proximos : (boards as MoodBoard[]);
}

/** A timeline phase in the "Cronograma de Organização" (Organização template). */
export interface CronogramaPhase {
  /** e.g. "6-12 meses antes do casamento". */
  title: string;
  items: string[];
}

/** A priced budget row for the per-item estimate model (Organização template). */
export interface BudgetRow {
  item: string;
  /** Kept as free text ("[Valor]", "1.500,00 €") to match the studio's format. */
  price: string;
}

/**
 * Linha ADICIONAL de orçamento no template Decoração — apresentada por baixo do
 * "Valor Total Decoração", tal como nas propostas reais da Líquen (Deslocação da
 * equipa, Wedding Coordinator, Tecidos suspensos, Mobiliário opção A/B, …).
 *
 * É apenas de DISPLAY (texto livre pt-PT, incl. o "+ IVA" quando aplicável) —
 * não entra no modelo de dinheiro/faturação (que continua a partir do total
 * estruturado), do mesmo modo que `budgetItems` são só nomes. Assim a estrutura
 * do PDF varia conforme o que cada casal pede, sem desestabilizar as finanças.
 */
export interface BudgetExtra {
  /** Rótulo à esquerda, e.g. "Deslocação da equipa Líquen". */
  label: string;
  /** O {@link BudgetExtra.label} em inglês. O `valueText` NÃO tem irmão: o
   *  dinheiro fica à portuguesa nas duas línguas. */
  labelEn?: string;
  /** Valor à direita como texto livre, e.g. "896,00 €" ou "895,00 € + IVA". */
  valueText: string;
}

export interface ProposalDoc {
  /** Which studio template this proposal follows — switches the apresentação
   *  heading, the pricing model, and whether a cronograma is shown. */
  template?: "decoracao" | "organizacao";
  /** Running header title, e.g. "PO Decoração Casamento Maria Rebocho 3.07.2027". */
  ref: string;
  /** Header title on the content pages (Organização template shows
   *  "Proposta de orçamento para Organização de Casamento"). */
  headerTitle?: string;
  /** O {@link ProposalDoc.headerTitle} em inglês. */
  headerTitleEn?: string;

  /**
   * ── O NOME DO FICHEIRO PDF, QUANDO ELA O ESCREVE ────────────────────────
   *
   * Pedido dela: «gostava de poder editar o nome do pdf que vai ser gerado».
   *
   * Sem isto, o nome é composto — casa, casal e data — e acerta na maioria dos
   * casos. Não acerta em todos: duas propostas para o mesmo casal, uma versão
   * para os pais e outra para eles, ou simplesmente outra maneira de arrumar a
   * pasta.
   *
   * Vive no DOCUMENTO e não nas definições da casa porque é uma decisão DESTA
   * proposta — como o título interno, ao lado do qual nasceu. E porque é isso
   * que o congela: o nome com que uma proposta seguiu para um casal não muda
   * porque a regra da casa mudou seis meses depois.
   *
   * Ausente quer dizer «compõe-o tu», que é o que a casa fazia e continua a
   * fazer. Ver `nomeDoFicheiroDaProposta`.
   */
  nomeDoFicheiro?: string;

  /**
   * «Usa ESTA na capa, mesmo assim.»
   *
   * A regra (`regra-da-capa.ts`) troca uma fotografia ao alto, ou pequena, pela
   * melhor deitada dos temas. Ela viu o estúdio a mostrar a dela — cortada para
   * ficar deitada, e bonita assim — e o PDF a sair com outra: «diz que é esta a
   * foto de capa mas depois quando abro o pdf está outra foto». Com isto ligado,
   * a dela vai, recortada ao centro como o estúdio a mostra.
   *
   * Vale para a fotografia que estava na capa quando ela o escolheu: trocar a
   * fotografia apaga-o (`setCoverAt`), para uma escolha antiga não passar em
   * silêncio para uma fotografia que ela ainda não viu na folha.
   */
  capaMesmoAssim?: boolean;

  /**
   * O enquadramento da fotografia da capa, escolhido à mão — como o
   * `object-position` em fracções (`{ x: 0.5, y: 0.8 }` = ao centro, mais para
   * baixo). Ela arrasta a fotografia na caixa do estúdio até o que interessa
   * ficar à vista: «não ficou com o carro… quero que o sistema fique
   * inteligente para saber identificar isto». Sem ele, o PDF escolhe sozinho
   * (a «atenção» do sharp) e o estúdio mostra essa escolha.
   *
   * Como o `capaMesmoAssim`, é da fotografia: trocá-la apaga-o.
   */
  focoDaCapa?: { x: number; y: number };

  /**
   * ════════════════════════════════════════════════════════════════════════
   * AS FOTOGRAFIAS QUE ELA ESCOLHEU PARA CADA PÁGINA DO PDF
   * ════════════════════════════════════════════════════════════════════════
   *
   * Pedido dela (15/10): «as fotos de fundo que estão por trás dos títulos
   * [Cocktail…] são completamente automáticas… queremos ser nós a meter as
   * fotos… em qualquer sítio do PDF». A chave é a da página no plano
   * (`chavesDasPaginas`, em `pdf-editorial/plano.ts`: `indice`,
   * `separador:cocktail`, `investimento`, `orcamento:1`…), e o valor são as
   * fotografias de cada lugar dessa página, pela ordem — no separador, uma
   * (a página inteira) ou duas (lado a lado). `focos` é o enquadramento à mão
   * de cada uma, como o `focoDaCapa`.
   *
   * Sem entrada, a página continua a escolher sozinha (`Album.escolher`), e a
   * miniatura do estúdio mostra o que ela escolheu (`fotosDoEditorial`).
   */
  fotosDasPaginas?: Record<string, FotosDeUmaPagina>;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * CONTRA QUE PORTUGUÊS É QUE CADA TRADUÇÃO FOI ESCRITA
   * ════════════════════════════════════════════════════════════════════════
   *
   * A chave é a do campo (`itemRotulo:0:2`), o valor é uma impressão digital do
   * texto português no momento em que o inglês foi escrito ou dado por revisto.
   *
   * Existe para uma coisa só, e é o defeito mais grave do estúdio: «Reunião
   * Inicial» com «Ceremony Decor» por tradução. Alguém traduziu, mudou depois o
   * português, e o inglês ficou errado — a passar em todas as verificações,
   * porque nenhuma delas pergunta se o inglês ainda corresponde: perguntam se
   * ele está lá.
   *
   * Ver `estadoDoIngles`, em `proposal-doc-bilingue.ts`, para as regras — e em
   * particular para o que acontece às propostas ANTERIORES a este registo, que
   * não têm marca nenhuma e não podem por isso ser acusadas.
   *
   * Nunca é impresso: é do estúdio, e está no `NUNCA_NO_PDF`.
   */
  traducoesFeitas?: Record<string, number>;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A CONFIGURAÇÃO DAS PÁGINAS, DECIDIDA UMA VEZ PARA A PROPOSTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «"Manter a forma de cada fotografia" hoje está desligada no
   * primeiro board e ligada no terceiro, sem razão».
   *
   * E é o que acontece quando a escolha só existe por página: sete páginas,
   * sete decisões, tomadas em sete momentos diferentes de uma tarde. O
   * resultado não é variedade — é uma proposta que parece montada por duas
   * pessoas.
   *
   * Isto é o que a proposta INTEIRA faz, quando a página não disser outra
   * coisa. Uma página continua a poder discordar: o campo dela ganha sempre,
   * porque há páginas que pedem mesmo outro tratamento.
   *
   * ── E PORQUE É QUE AUSENTE NÃO É `false` ────────────────────────────────
   *
   * Pela mesma razão que já valia por página: ausente quer dizer «ninguém
   * escolheu», e uma proposta já enviada tem de continuar a sair como sempre
   * saiu. Um `false` gravado seria uma escolha, e mudaria o desenho de
   * documentos antigos no dia em que a regra de omissão mudasse.
   */
  layoutPorOmissao?: LayoutDeMoodboard;
  /** Como {@link ProposalDoc.layoutPorOmissao}, para o recorte. */
  enquadramentoPorOmissao?: "forma-da-foto";

  // ── 1. Apresentação ──
  /** Couple / client, e.g. "Maria & Zé". */
  clientNames: string;
  eventType: string; // "Casamento"
  eventDate: string; // "3 de julho de 2027"
  location: string; // "Monte da Oliveirinha"
  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS QUILÓMETROS ATÉ AO LOCAL, ESCRITOS POR QUEM FAZ A ESTRADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * A deslocação era calculada a partir de uma tabela de cem localidades: um
   * casamento numa herdade que lá não estivesse não tinha conta nenhuma, e o
   * painel dizia «não reconheço o local». Este campo é a saída — a distância
   * num sentido, em quilómetros, tal como ela a mede.
   *
   * ── PORQUE É QUE VIVE NO DOCUMENTO E NÃO NAS DEFINIÇÕES ─────────────────
   * Porque é um facto DESTA proposta, como o local e o número de convidados, e
   * não uma regra da casa. E porque é isso que congela o número: uma vez
   * escrito aqui, mudar a sede, a tabela ou o preço do gasóleo deixa de lhe
   * tocar — a decisão passa a valer só para as propostas seguintes.
   *
   * AUSENTE de propósito nas propostas antigas, e nunca semeado por
   * {@link withProposalDefaults}: sem ele, a conta é a que sempre foi (a
   * sugestão da tabela a partir da sede). Semear a sugestão aqui era escrever
   * no documento um número que ninguém confirmou.
   *
   * Zero é um valor legítimo — o evento na própria casa — e por isso quem lê
   * este campo tem de distinguir `0` de `undefined`, nunca com um `||`.
   */
  kmDeslocacao?: number;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUANTAS CARRINHAS VÃO A ESTE EVENTO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «nós temos duas carrinhas para os eventos. ou seja se forem
   * duas ou se forem uma ou mais carrinhas».
   *
   * A conta da deslocação assumia uma. Quando saem as duas, o gasóleo, as
   * portagens e o desgaste são a dobrar, e a proposta cobrava metade — com a
   * diferença a sair do bolso da empresa.
   *
   * ── PORQUE É QUE VIVE AQUI E NÃO NAS DEFINIÇÕES ─────────────────────────
   * Pela mesma razão que o {@link kmDeslocacao}: é um facto DESTE evento. Num
   * casamento de 200 pessoas saem as duas; num jantar de 30 vai uma; um dia
   * podem ser três com uma alugada. Não é uma regra da casa — é o que
   * aconteceu nesta proposta, e fica congelado nela.
   *
   * AUSENTE quer dizer UMA, e é uma decisão: nenhuma proposta escrita antes
   * disto muda de preço por este campo passar a existir.
   */
  carrinhasDeslocacao?: number;
  guests: string; // "150 pax"
  ceremony?: string; // "Civil, simbólica"
  time?: string; // "A definir"
  /**
   * O QUE ESTA PROPOSTA É, numa linha — «Decor e decoração Floral».
   *
   * Existe na folha que ela envia há anos («Serviço: Decor e decoração Floral»,
   * entre o número de convidados e a cerimónia) e não existia aqui. Sem ele, a
   * apresentação diz onde e para quantos, e não diz o que se vai fazer — que é
   * o que distingue uma proposta de decoração de uma de organização quando as
   * duas chegam ao mesmo casal na mesma semana.
   *
   * Texto LIVRE e opcional, como todos os campos desta secção: uma proposta que
   * o não tenha preenchido não desenha o rótulo (ver `proposal-doc-pdf.ts` — um
   * «Serviço:» seguido de nada é pior do que não haver linha nenhuma).
   */
  servico?: string;
  /** O {@link ProposalDoc.servico} em inglês. */
  servicoEn?: string;
  /**
   * @deprecated O campo saiu do estúdio e do PDF (pedido da Catarina).
   *
   * A propriedade FICA porque há propostas gravadas com valor lá dentro, e um
   * documento antigo tem de continuar a poder ser lido, copiado e reaberto sem
   * dar erro. Não é escrita por nada de novo, e não é impressa.
   */
  weddingPlanners?: string;

  // ── 2. Serviços ──
  serviceGroups: ServiceGroup[];

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A ORDEM DESTE DOCUMENTO FOI ARRUMADA À MÃO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Sem este campo, o orçamento e os mood boards saem pela ordem da lista de
   * Serviços — uma correcção que existe porque as três listas são editores
   * separados e se desalinhavam sozinhas (ver `proposal-ordem.ts`).
   *
   * A partir do momento em que ela ARRASTA um mood board ou uma linha do
   * orçamento, essa sugestão passa a estorvar: ela punha o board no sítio e a
   * página seguinte devolvia-o ao lugar «certo». Este campo é o interruptor —
   * presente, a ordem escrita vale sozinha, no editor e no PDF.
   *
   * Nasce ausente e só o arrasto (ou o botão «Alinhar pelos Serviços», que
   * escreve a ordem sugerida no documento) o acende: propostas antigas
   * continuam a sair exactamente como sempre saíram.
   */
  ordemExplicita?: "arrumada-a-mao";

  // ── Mood boards (one page each; Decoração template) ──
  moodBoards: MoodBoard[];

  // ── Cronograma de Organização (Organização template) ──
  cronograma?: CronogramaPhase[];

  // ── 3./4. Orçamento Proposto ──
  // Decoração template: grouped total.
  budgetItems: string[]; // item NAMES only, e.g. "Decor Cerimónia"
  /**
   * Os nomes das rubricas em inglês — array PARALELO a `budgetItems`, com o
   * índice `i` a traduzir a rubrica `i`.
   *
   * `(string | null)[]` e não `string[]` pela mesma razão que os outros quatro
   * arrays paralelos do orçamento: `null` numa posição quer dizer «esta rubrica
   * não foi traduzida», que é diferente de `""` («foi decidido que fica
   * igual»). É essa diferença que faz a lista de campos por traduzir distinguir
   * o esquecimento da decisão sem um campo a mais.
   *
   * Ninguém mexe neste array à mão: entra no `PARALELOS` de
   * `proposal-budget.ts`, e é isso que o mantém alinhado quando uma linha é
   * acrescentada, removida ou arrumada. Um deslize de uma posição aqui é a
   * rubrica errada traduzida no PDF do cliente.
   */
  budgetItemsEn?: (string | null)[];
  /**
   * Preços por linha, SÓ INTERNOS — o índice `i` corresponde a
   * `budgetItems[i]`. Servem para somar e para avisar quando a soma e o total
   * não batem certo; o PDF continua a imprimir a coluna de preço em branco e
   * um único «Valor Total», como nas propostas reais.
   *
   * Ninguém mexe neste array à mão: as alterações passam pelos ajudantes de
   * `proposal-budget.ts`, que mexem nos dois ao mesmo tempo. Ver lá o porquê
   * de ser um array paralelo e não um campo dentro de `budgetItems`.
   */
  budgetAmounts?: (number | null)[];
  /**
   * O que cada linha CUSTA à Líquen — flores, aluguer, horas de equipa.
   *
   * Mesmo array paralelo que `budgetAmounts`, e pelas mesmas razões (ver
   * `proposal-budget.ts`). Opcional linha a linha: preencher o custo de duas
   * linhas em dez já dá uma margem parcial útil, e exigir todos garantia que
   * não se preenchia nenhum.
   *
   * NUNCA SAI DAQUI. Não é lido pelo desenhador do PDF, não vai no email, não
   * existe no portal do cliente. Um número destes numa proposta é o fim de uma
   * negociação — e há um teste em `proposal-doc-pdf` a garanti-lo.
   */
  budgetCosts?: (number | null)[];
  /**
   * Como é que cada linha ESCALA com o número de convidados: fixa (o normal),
   * por convidado, ou por mesa. Mesmo array paralelo dos outros.
   *
   * Quando uma linha tem escala, o `budgetAmounts[i]` dela deixa de ser escrito
   * à mão e passa a ser o RESULTADO da multiplicação — escrito no mesmo sítio
   * de sempre, para que a soma, o desvio do total, a margem e o resumo
   * continuem a ler o que já liam sem saberem que aquele número foi calculado.
   *
   * Ver `src/lib/orcamento/escala.ts`.
   */
  budgetScales?: (import("./orcamento/escala").Escala | null)[];
  /** Quantas pessoas por mesa, para as linhas "por mesa" (por omissão 10). */
  convidadosPorMesa?: number;
  /**
   * Quais das linhas são EXTRA — o que distingue a versão base da versão com
   * extras da mesma proposta. Mesmo array paralelo dos outros.
   *
   * Uma proposta sem marcas nenhumas é exactamente a proposta de antes: não há
   * segundo total nem uma palavra a mais no PDF. Ver
   * `src/lib/orcamento/versoes-da-proposta.ts` — em particular a razão de o
   * total da base ser DERIVADO e não escrito.
   */
  budgetOpcional?: boolean[];

  /**
   * De que fotos da BIBLIOTECA saíram as fotos desta proposta.
   *
   * Guarda os caminhos de ORIGEM (o ficheiro no bucket dos temas), não os da
   * proposta: as fotos da proposta são cópias, com caminho próprio, e comparar
   * cópias nunca diria que duas propostas mostraram a mesma imagem.
   *
   * Serve uma coisa só, e não sai daqui para lado nenhum: avisar que uma foto
   * já foi para outro casamento. Duas noivas com o mesmo Pinterest é uma
   * coincidência; duas propostas da Líquen com o mesmo arco é um descuido que
   * se vê de longe quando as duas se encontram no Instagram.
   *
   * NÃO É DESENHADA. O PDF não a lê — e o teste que compara os desenhos com e
   * sem custos/notas cobre a mesma garantia por construção: só entra no
   * documento o que alguém mandou desenhar.
   */
  fotosDeBiblioteca?: string[];

  /**
   * NOTAS INTERNAS — o que se sabe sobre este negócio e nunca se escreve ao
   * cliente. "Cliente da AMARA, cuidado com o prazo." "Já recusaram uma
   * proposta em 2025 por preço."
   *
   * Vivem no documento porque é ao documento que dizem respeito, e porque é
   * assim que viajam com ele na cópia de segurança. NUNCA SÃO DESENHADAS: o
   * gerador do PDF não as lê, e há um teste que compara as instruções de
   * desenho com e sem notas para garantir que continua assim.
   *
   * O sítio onde isto podia correr mal é o de sempre — alguém acrescenta um
   * rodapé "para conferir" e esquece-se de o tirar. É esse o teste.
   */
  notasInternas?: string;
  /**
   * Notas presas a uma secção ("nas flores, ela quer eucalipto e mais nada").
   * A chave é o id da secção do estúdio: evento, servicos, orcamento, total…
   */
  notasPorSeccao?: Record<string, string>;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * AS ESCOLHAS QUE O CASAL FAZ NA PÁGINA — E QUE O PDF NÃO IMPRIME
   * ════════════════════════════════════════════════════════════════════════
   *
   * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
   * dois estilos de corredor), eles escolhem ali.»
   *
   * Vivem no DOCUMENTO para viajarem com ele: uma revisão, uma cópia a partir
   * de outra proposta e a cópia de segurança levam as perguntas consigo sem
   * uma linha a mais em lado nenhum. A RESPOSTA do casal não está aqui — está
   * no pedido, e a razão está escrita em `proposta-escolhas.ts`.
   *
   * NUNCA SÃO DESENHADAS NO PDF, e isso é uma decisão e não um esquecimento:
   * uma folha A4 não tem como oferecer uma escolha, e imprimir «Opção A / B»
   * no documento que o casal guarda e mostra à família só cria a dúvida de
   * qual das duas é que ficou. Está declarado em `NUNCA_NO_PDF`.
   */
  escolhas?: Escolha[];

  totalLabel: string; // "Valor Total Decoração"
  /**
   * O {@link ProposalDoc.totalLabel} em inglês.
   *
   * O rótulo do total também nasce escrito por nós, e por isso já é traduzido
   * por reconhecimento («Valor Total Decoração» → «Decoration Total», ver
   * `rotuloDoTotalNaLingua`). Esta caixa MANDA sobre esse reconhecimento: um
   * rótulo reescrito à mão («Investimento em flor e decor») deixa de ser
   * reconhecido e só ela o sabe dizer em inglês.
   */
  totalLabelEn?: string;
  totalText: string; // "3000,00 € + IVA" — kept as text to match the studio's format
  /** Linhas adicionais mostradas por baixo do total (Deslocação, Wedding
   *  Coordinator, Tecidos, Mobiliário opção A/B, …). Só DISPLAY — ver {@link BudgetExtra}. */
  budgetExtras?: BudgetExtra[];

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS ADICIONAIS ESTÃO DENTRO DO VALOR ESCRITO, OU SOMAM-SE A ELE?
   * ══════════════════════════════════════════════════════════════════════════
   *
   * As duas leituras são legítimas e a diferença é dinheiro real, por isso é
   * ela que escolhe e não o programa que adivinha.
   *
   *   `false` (omissão, e o que sempre se fez) — o valor escrito é o TOTAL, e
   *   os adicionais já lá estão dentro. Escreve 3.000 com uma deslocação de
   *   140, e o quadro diz «Subtotal dos serviços 2.860 + Deslocação 140 =
   *   3.000». A deslocação SAI dos serviços.
   *
   *   `true` — o valor escrito são os SERVIÇOS, e os adicionais acrescem.
   *   Escreve 3.000 com a mesma deslocação, e o quadro diz «Subtotal dos
   *   serviços 3.000 + Deslocação 140 = 3.140», com o IVA por cima.
   *
   * Palavras dela, sobre o segundo caso: «nós tínhamos dito que era três mil
   * mais cento e quarenta de deslocação, e depois mais o IVA».
   *
   * ── PORQUE É QUE VIVE NO DOCUMENTO E NÃO NAS DEFINIÇÕES ──────────────────
   * Uma proposta já enviada tem de continuar a ler-se exactamente como foi
   * enviada. Se isto fosse uma definição da casa, mudá-la reescrevia em
   * silêncio o total de todas as propostas antigas — incluindo as que o casal
   * tem no email, e as que já têm sinal pago sobre o total antigo. Guardado no
   * documento, cada proposta fica com a regra com que nasceu.
   */
  budgetExtrasSomam?: boolean;

  /**
   * ── NÃO HÁ INTERRUPTOR DO «TOTAL A PAGAR», E É DE PROPÓSITO ──────────────
   *
   * Havia aqui um `mostrarTotalAPagar?: boolean`, com um comentário a dizer
   * que a linha estava «desligada por omissão» e que «continua a poder
   * ligar-se». Saiu, porque as duas coisas tinham deixado de ser verdade:
   *
   *  · NADA em código o lia. O gerador do PDF deixou de o consultar quando o
   *    argumento a favor de o ter caiu — está escrito lá, com o caso à frente:
   *    sem essa linha impressa, o casal não tinha como ligar os 2.950,79 € de
   *    uma página aos 3.025,80 € da outra, e a soma que ninguém escreve é a
   *    soma que o casal faz de cabeça, e faz mal.
   *
   *  · E depois ela pediu o contrário do que este campo permitia: «quero
   *    sempre que nas propostas apareça assim na parte do orçamento». Hoje a
   *    escada — TOTAL, IVA, Total a pagar — sai sempre, com adicionais ou sem
   *    eles, e há testes a prendê-lo em `proposal-doc-pdf.dinheiro.test.ts`.
   *
   * Ou seja: um campo morto cuja documentação prometia uma escolha que já não
   * existia — e que descrevia como estado actual precisamente aquilo que ela
   * mandou mudar. Uma análise a este código leu esse comentário e concluiu, com
   * toda a lógica, que faltava construir o interruptor. Construí-lo teria
   * desfeito um pedido dela.
   */
  // Organização template: per-item estimated values.
  budgetRows?: BudgetRow[];
  totalEstimatedText?: string; // "[Valor Total]" / "12.500,00 €"
  budgetNote?: string; // "Os valores são estimativas e podem ser ajustados…"
  /** A {@link ProposalDoc.budgetNote} em inglês. */
  budgetNoteEn?: string;

  // ── Total ESTRUTURADO (fonte de verdade do dinheiro quando presente) ──
  // O texto livre acima (`totalText`/`totalEstimatedText`) é só para DISPLAY no
  // PDF; estes campos é que determinam a matemática (base/IVA/total) a jusante,
  // eliminando a ambiguidade "3.000,00 €" (com IVA?) vs "3.000,00 € + IVA".
  /** Valor introduzido pelo estúdio. Interpretação depende de `totalVatMode`. */
  totalAmount?: number;
  /** Se `totalAmount` já inclui IVA ("incluido") ou o IVA acresce ("acrescer"). */
  totalVatMode?: VatMode;
  /** Taxa de IVA aplicável (por omissão {@link DEFAULT_VAT_RATE}). */
  vatRate?: number;
  /**
   * Percentagem do sinal, de 1 a 99 (por omissão {@link SINAL_POR_OMISSAO}).
   *
   * NÃO é só do PDF: é lida pelas rotas que EMITEM as facturas do sinal e do
   * saldo. Foi essa a razão de não bastar acrescentar um campo ao estúdio —
   * uma proposta a dizer 40% com uma factura a sair a 30% é pior do que não
   * poder mudar a percentagem de todo.
   */
  depositPercent?: number;

  // ── Validade da proposta ──
  /** Data explícita de validade (yyyy-mm-dd). Tem prioridade sobre `validUntilDays`. */
  validUntil?: string;
  /** Nº de dias de validade a contar do envio (por omissão {@link DEFAULT_VALID_DAYS}). */
  validUntilDays?: number;

  // ── Cover (two flanking photos around the dark logo panel) ──
  /** SEMPRE {@link COVER_SLOTS} posições: `[esquerda, direita]`, com `""` numa
   *  posição vazia. É a POSIÇÃO que decide o lado onde a foto é impressa, por
   *  isso o array nunca se compacta — ver {@link normaliseCoverImages}. */
  coverImages: ImageData[];

  // ── Fixed boilerplate (defaults below; overridable per event) ──
  notasImportantes: string[];
  incluido: string[];
  naoIncluido: string[];
  condicoesGerais: string[];
  observacoesGerais: string[];
  faseamento: string[];
  cancelamento: string[];
}

/**
 * A percentagem de sinal de um documento, já validada.
 *
 * Um sítio só, lido pelo estúdio E pelas três rotas de facturação, para não
 * poderem discordar. Um valor absurdo (0, 150, NaN, texto) cai na percentagem
 * da casa em vez de emitir uma factura estranha.
 */
export function depositPercentOf(
  doc: Pick<ProposalDoc, "depositPercent"> | null | undefined,
): number {
  const p = doc?.depositPercent;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 1 || p > 99) return SINAL_POR_OMISSAO;
  return Math.round(p);
}

/** The studio's standard "Notas Importantes" (Orçamento page). */
export const DEFAULT_NOTAS_IMPORTANTES: string[] = [
  "O serviço de montagem e desmontagem está incluído na Proposta;",
  "Todos os encargos inerentes ao espaço são da responsabilidade do cliente ou do próprio espaço;",
  "O espaço do Evento e todas as zonas a utilizar, têm de nos ser entregues limpos e prontos a usar;",
];

/** "Condições de Reserva" — Incluído na proposta. */
export const DEFAULT_INCLUIDO: string[] = [
  "Serviço de decoração, material e flores conforme descrito;",
  "Serviço de montagem, desmontagem como descritos.",
];

/** "Condições de Reserva" — Não incluído no orçamento. */
export const DEFAULT_NAO_INCLUIDO: string[] = [
  "Aluguer e/ou outras despesas inerentes ao espaço, como tenda, mobiliário, mobiliário de lounge e palamenta de catering;",
  "Lembranças, papelaria referentes ao evento como menus, seating chart, seating plan.",
];

/** Os marcadores que as Condições Gerais trazem para serem preenchidos com os
 *  dados do evento (ver {@link preencherMarcadores}). */
const MARCADOR_DATA = "{DATA}";
const MARCADOR_CONVIDADOS = "{CONVIDADOS}";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * AS DUAS CLÁUSULAS QUE CITAM UM DADO QUE PODE AINDA NÃO EXISTIR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * «Data flexível» e «número por decidir» não são o caso raro: são o caso NORMAL
 * de quem ainda anda a escolher o dia. O formulário grava `date: ""` e o estúdio
 * abre a proposta com `eventDate: ""`.
 *
 * Estas duas frases são CLÁUSULAS CONTRATUAIS — a folha que se vai reler quando
 * houver uma discussão. Preenchidas com um travessão diziam ao casal «Esta
 * proposta só é válida para o evento a realizar no dia —.», que não é uma frase
 * nem é uma condição: é um marcador de folha de cálculo dentro de um contrato.
 *
 * Por isso cada uma tem DUAS redacções — a que cita o dado e a que não precisa
 * dele — e a segunda continua a dizer a mesma coisa em português inteiro. É o
 * padrão que o email de confirmação já usava no mesmo caso («Data: ainda a
 * definir»): escreve-se a ausência por palavras, não se enfia um símbolo no
 * meio da frase. Não se inventa data nem número: diz-se como passam a existir —
 * por escrito, que é o que a cláusula da pré-reserva já exige.
 */
const CONDICAO_DO_DIA = {
  com: `Esta proposta só é válida para o evento a realizar no dia ${MARCADOR_DATA}.`,
  sem: "Esta proposta só é válida para a data do evento que vier a ser confirmada por escrito.",
} as const;
const CONDICAO_DO_NUMERO = {
  com: `O orçamento é válido para o número de ${MARCADOR_CONVIDADOS} convidados; abaixo ou acima deste número o valor da proposta terá de ser revisto.`,
  sem: "O orçamento é válido para o número de convidados que vier a ser confirmado por escrito; abaixo ou acima desse número o valor da proposta terá de ser revisto.",
} as const;

/**
 * Frases COM marcador → a mesma frase sem ele, para quando o dado falta.
 *
 * A chave é a frase inteira e não o marcador: o que se troca é a CLÁUSULA, não
 * o buraco no meio dela. Uma condição reescrita à mão pelo estúdio não está
 * aqui e sai como ela a escreveu — não temos como adivinhar a redacção dela.
 */
export type RedaccoesSemDado = Readonly<Record<string, string>>;

/** As redacções alternativas das Condições Gerais da casa, em português. A
 *  versão inglesa tem as suas (ver `proposal-doc-textos.ts`) e entra pelo
 *  terceiro argumento do {@link preencherMarcadores}. */
export const CONDICOES_SEM_DADO: RedaccoesSemDado = {
  [CONDICAO_DO_DIA.com]: CONDICAO_DO_DIA.sem,
  [CONDICAO_DO_NUMERO.com]: CONDICAO_DO_NUMERO.sem,
};

/** O que fica no lugar de um marcador que sobrou numa frase que não conhecemos
 *  — palavras, nunca um símbolo (ver {@link CONDICOES_SEM_DADO}). */
const DADO_POR_DEFINIR = "a definir";

/** "Condições Gerais". `{DATA}` / `{CONVIDADOS}` are substituted from the
 *  event data so the wording stays specific without manual editing. */
export const DEFAULT_CONDICOES_GERAIS: string[] = [
  "Aos valores acresce o IVA à taxa legal em vigor como descrito.",
  "Os orçamentos enviados pela Líquen Events terão de ser validados pela mesma, aquando da sua confirmação por parte dos clientes, sendo o critério aplicado, a disponibilidade para a realização do evento.",
  "A pré-reserva do evento deve ser efetuada por escrito através de email. A confirmação do evento só será concluída após pagamento da adjudicação.",
  // A sede é em Évora e os casamentos são em todo o país: a deslocação é
  // cobrada pela distância até ao sítio onde o evento acontece. A isenção do
  // distrito de Évora fica: aí não há deslocação a cobrar.
  "Será cobrado o valor de deslocação da equipa Líquen de acordo com os quilómetros relativos à distância de Évora ao local do evento, sempre que o evento se realize fora do distrito de Évora.",
  // Trabalhar longe é mais do que combustível: um casamento a quatro horas de
  // Évora obriga a equipa a dormir lá, e isso era um custo que a proposta não
  // dizia e a Líquen absorvia.
  "Sempre que a distância ao local ou o horário do evento obriguem a equipa Líquen a pernoitar, será cobrado o valor do alojamento.",
  "Deve estar contemplada a refeição para os elementos da equipa Líquen que ficam durante todo o evento.",
  CONDICAO_DO_DIA.com,
  CONDICAO_DO_NUMERO.com,
  `A confirmação do número de pessoas tem de ser feita até ${DIAS_PARA_CONFIRMAR_CONVIDADOS} dias antes da festa. Se o número de participantes que se verificar no dia do evento for inferior ao previsto, será pago o número que foi confirmado. Caso o número de participantes seja superior ao comunicado, terá de ser feito o ajuste dos mesmos, não podendo a Líquen Events ser responsabilizada por falhas ou lacunas que resultem do serviço prestado a um número de participantes superior ao previamente confirmado.`,
  "A Líquen Events reserva-se ao direito de alterar o preço, caso se verifiquem alterações significativas na conjuntura económica nacional e/ou internacional ou nas premissas estabelecidas aquando da realização desta proposta.",
];

/** "Observações Gerais". */
export const DEFAULT_OBSERVACOES_GERAIS: string[] = [
  "A Líquen Events não se responsabiliza caso o evento não se possa realizar ou tenha de mudar de data devido a alterações significativas na conjuntura económica e/ou social nacional e/ou internacional e/ou em caso de guerras e/ou catástrofes naturais.",
  "Todo o material e adereços usados no evento são para uso exclusivo na decoração.",
  "Líquen Events é uma marca registada propriedade de Líquen Events. Todas as imagens, conteúdo, grafismo, texto e logótipo são propriedade da Líquen Events; todos os direitos são reservados.",
  "O conteúdo desta proposta é intransmissível, pessoal e confidencial, não podendo ser reproduzido ou partilhado com terceiros sem autorização expressa, por escrito, por parte da Líquen Events.",
];

/**
 * Preenche os marcadores das Condições Gerais com os dados do evento.
 *
 * Vive aqui, e não solto dentro do {@link withProposalDefaults}, porque há
 * agora um SEGUNDO leitor: o dicionário de idiomas, que precisa de reconhecer o
 * texto da casa já preenchido (para saber se ela lhe mexeu) e de preencher a
 * versão inglesa exactamente da mesma maneira. Duas substituições escritas em
 * dois sítios divergiriam, e o sintoma seria uma proposta em inglês a dizer
 * «{DATA}» ao cliente.
 *
 * `semDado` são as redacções alternativas na língua do texto que está a ser
 * preenchido — as portuguesas por omissão, as inglesas quando é o dicionário a
 * chamar. Sem o dado, troca-se a CLÁUSULA INTEIRA por essa redacção (ver
 * {@link CONDICOES_SEM_DADO}); só o que não estiver na tabela é que cai no
 * `a definir`, e mesmo esse é uma palavra e não um símbolo.
 */
export function preencherMarcadores(
  texto: string,
  doc: Pick<ProposalDoc, "eventDate" | "guests">,
  semDado: RedaccoesSemDado = CONDICOES_SEM_DADO,
  porDefinir: string = DADO_POR_DEFINIR,
): string {
  const data = (doc.eventDate ?? "").trim();
  const convidados = (doc.guests ?? "").trim();
  const temOsDados = (frase: string) =>
    (!!data || !frase.includes(MARCADOR_DATA)) &&
    (!!convidados || !frase.includes(MARCADOR_CONVIDADOS));

  /**
   * ── E O CAMINHO DE VOLTA (A4-004) ─────────────────────────────────────────
   * As condições são GRAVADAS já preenchidas. Uma proposta gravada antes de
   * haver data ficava com a redacção «válida para a data que vier a ser
   * confirmada» — e, como essa frase já não tem marcador, nada a voltava a
   * trocar quando a data chegava. A capa dizia «12 de setembro de 2026» e as
   * Condições Gerais, três páginas à frente, diziam o contrário.
   *
   * Agora a troca vai nos dois sentidos: uma redacção «sem dado» que a casa
   * conhece volta à frase com marcador assim que o dado existe. Repara também
   * as propostas que já estão gravadas, sem migração nenhuma.
   */
  let frase = texto;
  const comDado = Object.entries(semDado).find(([, sem]) => sem === texto)?.[0];
  if (comDado && temOsDados(comDado)) frase = comDado;
  else if (!temOsDados(texto)) frase = semDado[texto] ?? texto;

  // `replaceAll` e não `replace`: com uma string, o `replace` troca só a
  // PRIMEIRA ocorrência — uma condição editada à mão que repetisse o marcador
  // saía com o segundo literal, «{DATA}» impresso no PDF do cliente.
  return frase
    .replaceAll(MARCADOR_DATA, data || porDefinir)
    .replaceAll(MARCADOR_CONVIDADOS, convidados || porDefinir);
}

/** O «a definir» das condições, para quem precisa de o reconhecer depois de
 *  preenchido (a versão inglesa troca-o pelo seu — ver A4-010). */
export const POR_DEFINIR_PT = DADO_POR_DEFINIR;

/**
 * "Faseamento do Pagamento" — as duas primeiras linhas seguem a percentagem.
 *
 * Era um array fixo a dizer «30% na adjudicação; 70% 1 mês antes». Assim que a
 * percentagem do sinal passou a ser editável na proposta (ver
 * {@link depositPercentOf}), esse texto passou a poder CONTRADIZER a folha onde
 * está impresso: o quadro dos valores dizia «Sinal 50% 5.000,00 €» e três
 * parágrafos abaixo as condições continuavam a dizer 30%. Duas percentagens no
 * mesmo documento é uma conversa desagradável, e a que o casal vai defender é a
 * mais baixa.
 *
 * A terceira linha não menciona números de propósito — fala da «primeira
 * percentagem definida», que é exactamente o que a primeira linha diz.
 */
export function faseamentoPorOmissao(pctSinal: number = SINAL_POR_OMISSAO): string[] {
  const sinal = depositPercentOf({ depositPercent: pctSinal });
  return [
    `${sinal}% na adjudicação;`,
    `${100 - sinal}% 1 mês antes;`,
    "A adjudicação de um serviço só é considerada válida após pagamento no valor da primeira percentagem definida.",
  ];
}

/** O faseamento da casa (30/70) — o mesmo texto de sempre. */
export const DEFAULT_FASEAMENTO: string[] = faseamentoPorOmissao();

/** "Cancelamento". */
export const DEFAULT_CANCELAMENTO: string[] = [
  "Em caso de cancelamento do serviço, a Líquen Events reserva-se o direito de não devolver o valor da adjudicação. Em caso de cancelamento efetuado entre o 30.º dia anterior e até às 14h do oitavo dia útil anterior à data do evento, a Líquen Events tem direito a receber o montante correspondente a 70% do valor total estipulado para o evento, acrescido do respetivo IVA.",
  "Se o cancelamento do evento ocorrer após as 14h do oitavo dia útil antes da data do evento, a Líquen Events terá direito a receber o montante total estipulado para o evento, acrescido de IVA, sendo a denúncia, em qualquer um dos casos, apenas válida se for efetuada por escrito, por email, valendo para tal a data e hora de receção do mesmo.",
  "Para qualquer eventual conflito recorrer-se-á ao Centro de Arbitragem de Conflitos de Consumo de Lisboa.",
];

/** A capa tem duas fotos, uma de cada lado do painel escuro: `coverImages[0]`
 *  imprime à ESQUERDA e `coverImages[1]` à DIREITA. */
export const COVER_SLOTS = 2;

/**
 * Devolve as imagens de capa com exatamente {@link COVER_SLOTS} posições, `""`
 * onde não há foto.
 *
 * O lado onde uma foto sai impressa é dado pela sua POSIÇÃO no array, por isso
 * um buraco não pode encolher o array: um rascunho antigo guardado como
 * `[null, "foto"]` (ou `["foto"]` depois de se remover a capa da esquerda)
 * colapsava para `["foto"]` e a foto escolhida para a DIREITA saía à esquerda.
 * Aceita as duas formas — a antiga (esparsa/curta) e a nova de 2 posições — e
 * emite sempre a normalizada; o `""` só é descartado na geração do PDF.
 */
export function normaliseCoverImages(
  images?: readonly (ImageData | null | undefined)[] | null,
): ImageData[] {
  return Array.from({ length: COVER_SLOTS }, (_, i) => {
    const v = images?.[i];
    return typeof v === "string" ? v : "";
  });
}

// ── Marcadores provisórios de foto ─────────────────────────────────────────
//
// Quando se escolhem fotos na Biblioteca de Temas, a cópia para a pasta desta
// proposta demora — e a foto tem de aparecer no sítio certo no INSTANTE do
// clique, não quando a cópia confirma. O que entra no documento nesse instante
// é um MARCADOR: `pending:<uuid>`.
//
// Um marcador NÃO é um caminho de Storage e não é um valor legítimo de
// documento: é uma promessa que ainda não tem morada. Por isso tem de ser
// filtrado em TODAS as fronteiras por onde o documento sai do editor — o
// rascunho gravado (local e servidor) e o documento que gera a
// pré-visualização / a proposta enviada. Um marcador que atravesse uma dessas
// fronteiras é uma foto que o gerador não consegue ir buscar: um buraco
// silencioso no PDF do cliente, exatamente o que os avisos de conteúdo
// incompleto existem para evitar.
//
// O prefixo vive AQUI, no modelo do documento, e não no seletor que o cria:
// quem filtra são os dois lados, e uma segunda definição do prefixo seria uma
// maneira de um deles deixar de filtrar sem ninguém dar por isso.

/** Prefixo dos marcadores provisórios. Os dois pontos garantem que nunca
 *  colide com um caminho de Storage (`<uuid>/<ficheiro>`). */
export const PENDING_IMAGE_PREFIX = "pending:";

/** Este caminho é um marcador provisório (uma foto ainda por copiar)? */
export function isPendingImage(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(PENDING_IMAGE_PREFIX);
}

/** As fotos deste documento que ainda são promessas — o número que decide se
 *  a proposta já pode seguir para o cliente. */
export function countPendingImages(
  doc: Partial<Pick<ProposalDoc, "coverImages" | "moodBoards" | "escolhas" | "fotosDasPaginas">>,
): number {
  let n = 0;
  for (const e of Object.values(doc.fotosDasPaginas ?? {}))
    for (const p of e?.fotos ?? []) if (isPendingImage(p)) n += 1;
  for (const p of doc.coverImages ?? []) if (isPendingImage(p)) n += 1;
  for (const b of doc.moodBoards ?? [])
    for (const p of b.images ?? []) if (isPendingImage(p)) n += 1;
  // As fotografias das alternativas contam como as outras: uma promessa por
  // cumprir é uma promessa por cumprir, esteja num mood board ou numa opção.
  for (const e of doc.escolhas ?? [])
    for (const o of e.opcoes ?? []) if (isPendingImage(o.imagem)) n += 1;
  return n;
}

/**
 * O mesmo documento sem um único marcador provisório.
 *
 * Nas capas o marcador vira `""` e NÃO desaparece do array: é a posição que
 * decide o lado onde a foto é impressa (ver {@link normaliseCoverImages}), por
 * isso compactar aqui mandaria a foto da direita imprimir à esquerda. Nos mood
 * boards sai mesmo da lista — ali a posição é só ordem.
 *
 * Devolve o MESMO objeto quando não há nada a filtrar (o caso normal), para
 * não sujar as comparações por referência de quem grava o rascunho.
 */
export function stripPendingImages<
  T extends Partial<
    Pick<ProposalDoc, "coverImages" | "moodBoards" | "escolhas" | "fotosDasPaginas">
  >,
>(doc: T): T {
  if (countPendingImages(doc) === 0) return doc;
  const out: T = { ...doc };
  if (doc.fotosDasPaginas) {
    // Uma fotografia de página a caminho não vai: a página escolhe sozinha
    // até ela chegar.
    const paginas: NonNullable<ProposalDoc["fotosDasPaginas"]> = {};
    for (const [chave, e] of Object.entries(doc.fotosDasPaginas)) {
      // Cada uma fica no seu LUGAR (a posição conta: na paleta o 6.º é o
      // painel). A que vem a caminho deixa o lugar vazio — automático.
      const fotos = (e?.fotos ?? []).map((p) => (isPendingImage(p) ? "" : p));
      if (!fotos.some((p) => p && p.trim())) continue;
      paginas[chave] = { ...e, fotos };
    }
    out.fotosDasPaginas = paginas;
  }
  if (doc.coverImages) {
    out.coverImages = doc.coverImages.map((p) => (isPendingImage(p) ? "" : p));
  }
  if (doc.moodBoards) {
    out.moodBoards = doc.moodBoards.map((b) =>
      (b.images ?? []).some(isPendingImage)
        ? { ...b, images: b.images.filter((p) => !isPendingImage(p)) }
        : b,
    );
  }
  // Numa opção o marcador some e a OPÇÃO FICA: o que identifica a alternativa
  // é o rótulo, e apagar a opção porque a fotografia não chegou trocava a
  // escolha que o casal já pode ter feito. Fica sem fotografia, que é o que
  // ela vê no estúdio e pode voltar a pôr.
  if (doc.escolhas) {
    out.escolhas = doc.escolhas.map((e) =>
      (e.opcoes ?? []).some((o) => isPendingImage(o.imagem))
        ? {
            ...e,
            opcoes: e.opcoes.map((o) =>
              isPendingImage(o.imagem) ? { ...o, imagem: undefined } : o,
            ),
          }
        : e,
    );
  }
  return out;
}

/**
 * Extrai o primeiro número monetário de texto livre
 * ("3.000,00 € + IVA" → 3000; "14.700,00 €" → 14700). Só isto — a
 * interpretação do IVA fica a cargo de {@link resolveProposalMoney}.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE ISTO TAMBÉM TEM DE LER INGLÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Lia só português — ponto a separar milhares, vírgula decimal. E a casa
 * ESCREVE em inglês: o `montantesEmIngles` (money.ts) troca os separadores
 * quando a proposta sai na versão inglesa. Fechando o círculo, com a função
 * antiga:
 *
 *     3.000,00 €      → «€3,000.00»      → relido  3
 *     14.700,00 €     → «€14,700.00»     → relido  14,7
 *     1.234.567,89 €  → «€1,234,567.89»  → relido  1,23
 *     850,50 €        → «€850.50»        → relido  85 050   ← cem vezes MAIS
 *
 * Não é hipótese de laboratório: o leitor de propostas em PDF
 * (`proposta-de-pdf/campos.ts`) chama isto com o texto do total lido da folha,
 * e uma proposta inglesa importada valia três euros — ou cem vezes o que
 * estava impresso, que é pior, porque três euros salta à vista e 85 050 € tem
 * o ar de um número a sério.
 *
 * ── COMO SE DECIDE QUAL É O SEPARADOR DECIMAL ─────────────────────────────
 *
 *  1. Espaços (normais ou duros) são SEMPRE milhares. «1 500,00» é português
 *     de tipografia e não tem outra leitura possível.
 *  2. Se aparecerem os dois sinais, o DECIMAL é o último — é o que distingue
 *     «1.234.567,89» de «1,234,567.89» sem ter de adivinhar a língua.
 *  3. Se aparecer só um, e ele separar grupos certinhos de três dígitos até ao
 *     fim (`3.000`, `1,234,567`), são milhares. Dinheiro tem no máximo dois
 *     decimais, portanto três dígitos a seguir ao sinal nunca são cêntimos.
 *  4. Caso contrário é o decimal — inclusive `3355.98`, que antes se lia como
 *     335 598. Ninguém escreve trezentos e trinta e cinco mil e seiscentos
 *     assim; quem o escreve é o `String()` do JavaScript.
 *
 * O `textoDoTotal` do estúdio continua a existir e continua a escrever em
 * português: o campo é o que ELA lê, e um total escrito «3355.98» num ecrã
 * português é uma coisa que não se mostra. O que aqui muda é a leitura ser
 * tolerante — deixa de haver um número que entra certo e sai mil vezes maior.
 */
export function parseMoneyText(text: string | undefined): number {
  if (!text) return 0;
  // Um número com os dois separadores lá dentro; as pontas são sempre dígitos,
  // para não apanhar o ponto final de uma frase nem a vírgula que a segue.
  const m = text.match(/\d(?:[\d.,\s\u00a0]*\d)?/);
  if (!m) return 0;

  const bruto = m[0].replace(/[\s\u00a0]/g, "");
  const ultimoPonto = bruto.lastIndexOf(".");
  const ultimaVirgula = bruto.lastIndexOf(",");

  /** O sinal separa grupos de três até ao fim? Então são milhares. */
  const soMilhares = (sinal: "." | ","): boolean =>
    new RegExp(`^\\d{1,3}(?:\\${sinal}\\d{3})+$`).test(bruto);

  let decimal: number;
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    decimal = Math.max(ultimoPonto, ultimaVirgula);
  } else if (ultimaVirgula >= 0) {
    decimal = soMilhares(",") ? -1 : ultimaVirgula;
  } else if (ultimoPonto >= 0) {
    decimal = soMilhares(".") ? -1 : ultimoPonto;
  } else {
    decimal = -1;
  }

  const inteiros = (decimal < 0 ? bruto : bruto.slice(0, decimal)).replace(/[.,]/g, "");
  const centimos = decimal < 0 ? "" : bruto.slice(decimal + 1).replace(/[.,]/g, "");
  const n = Number.parseFloat(`${inteiros || "0"}.${centimos || "0"}`);
  return Number.isFinite(n) ? n : 0;
}

/** Deteta, em texto livre, uma anotação do tipo "+ IVA" / "acresce IVA" /
 *  "IVA não incluído" ⇒ o valor é LÍQUIDO (modo "acrescer"). Caso contrário
 *  assume-se que o valor já inclui IVA. Case-insensitive e tolerante a acentos. */
export function detectVatMode(text: string | undefined): VatMode {
  if (!text) return "incluido";
  const t = text.toLowerCase();
  // "+ iva", "mais iva", "acresce (o) iva", "iva não/nao incluido/incluído".
  if (/\+\s*iva|mais\s+iva|acresce\s+(?:o\s+)?iva|iva\s+n[aã]o\s+inclu/.test(t)) {
    return "acrescer";
  }
  return "incluido";
}

/**
 * Resultado desdobrado do total de uma proposta. O que está garantido, e o que
 * está pinado em `money-invariantes.test.ts`, é UM invariante só:
 *
 *     gross === round2(base + vat)
 *
 * Dizia-se aqui, a mais, que `vat = round2(base * vatRate)`. Não é verdade no
 * modo "incluído", e não é por descuido: aí o IVA é obtido por SUBTRACÇÃO
 * (`gross − base`), que é o que faz as duas parcelas fecharem o bruto ao
 * cêntimo. Num bruto de 10.000,03 € a 23%, a base é 8.130,11 € e o IVA 1.869,92
 * €, enquanto `base × 0,23` arredonda a 1.869,93 € — um cêntimo a mais, que
 * somado à base já não dá o total que o cliente viu. Em 10.000,00 € facturados
 * isso é o género de cêntimo que separa a factura da proposta.
 *
 * Quem precisar do IVA deste documento LÊ o `vat`; recalculá-lo a partir da
 * base é a maneira de o perder.
 */
export interface ProposalMoney {
  /** Base tributável (sem IVA). */
  base: number;
  /** Montante de IVA. */
  vat: number;
  /** Total COM IVA — é este que alimenta `Proposal.total` e o split 30/70. */
  gross: number;
  vatRate: number;
  mode: VatMode;
}

/**
 * Resolve o dinheiro de uma proposta para um total BRUTO (com IVA) coerente.
 *
 * Fonte de verdade: os campos ESTRUTURADOS (`totalAmount`/`totalVatMode`).
 * Retrocompatibilidade: se `totalAmount` estiver ausente, extrai o número do
 * texto livre e, se `totalVatMode` também faltar, deteta o "+ IVA" no texto.
 *
 *  - modo "acrescer": `amount` é a BASE ⇒ `vat = base*taxa`, `gross = base+vat`.
 *  - modo "incluido": `amount` é o BRUTO ⇒ `base = gross/(1+taxa)`, `vat = gross-base`.
 */
export function resolveProposalMoney(
  // `Partial` de propósito: um documento a meio de ser escrito ainda não tem
  // texto de total nenhum, e um `Pick` estrito obrigava quem chama a inventar
  // um `totalText: ""` só para satisfazer o tipo — o género de campo inventado
  // que depois alguém lê como se fosse verdade.
  doc: Partial<
    Pick<
      ProposalDoc,
      "totalAmount" | "totalVatMode" | "vatRate" | "totalText" | "totalEstimatedText"
    >
  >,
): ProposalMoney {
  const vatRate =
    typeof doc.vatRate === "number" && doc.vatRate >= 0 ? doc.vatRate : DEFAULT_VAT_RATE;
  const text = doc.totalText || doc.totalEstimatedText;
  const amount =
    typeof doc.totalAmount === "number" && doc.totalAmount > 0
      ? doc.totalAmount
      : parseMoneyText(text);
  const mode: VatMode = doc.totalVatMode ?? detectVatMode(text);

  if (mode === "acrescer") {
    const base = round2(amount);
    const vat = round2(base * vatRate);
    return { base, vat, gross: round2(base + vat), vatRate, mode };
  }
  const gross = round2(amount);
  const base = round2(gross / (1 + vatRate));
  const vat = round2(gross - base);
  return { base, vat, gross, vatRate, mode };
}

/**
 * O `totalAmount` a GRAVAR para uma dada base, no modo de IVA em vigor.
 *
 * É a volta de {@link resolveProposalMoney}, e existe para as duas contas não
 * poderem divergir. O campo do estúdio chama-se «Preço final (sem IVA)» e o
 * que ela lá escreve é sempre a BASE; o que o documento guarda depende do
 * modo — em "acrescer" é a própria base, em "incluído" é a base já com o IVA
 * somado, porque é assim que o resolvedor a volta a ler.
 *
 * ── PORQUE É QUE A BASE É ARREDONDADA PRIMEIRO ─────────────────────────────
 * O estúdio fazia `base × (1+taxa)` e arredondava no fim. Com uma base a
 * chegar do PATCH do pedido com mais de dois decimais (999,995 €), a ida dava
 * 1.229,99 € e a volta devolvia 999,99 € — o campo mudava sozinho debaixo dos
 * dedos dela e o pedido e a proposta separavam-se por um cêntimo sem ninguém
 * ter tocado em nada. Um valor em euros tem cêntimos e mais nada: arredonda-se
 * ANTES de o multiplicar, e a ida e volta passa a devolver sempre o mesmo
 * número.
 */
export function totalAmountParaBase(
  base: number,
  mode: VatMode,
  vatRate: number = DEFAULT_VAT_RATE,
): number {
  const taxa = typeof vatRate === "number" && vatRate >= 0 ? vatRate : DEFAULT_VAT_RATE;
  const b = round2(base);
  return mode === "acrescer" ? b : round2(b * (1 + taxa));
}

export { FUSO_DO_ESTUDIO, hojeNoEstudio } from "./fuso";
import { hojeNoEstudio } from "./fuso";

/**
 * O dia de calendário `dias` depois de `dia` (ambos `yyyy-mm-dd`).
 *
 * Aritmética sobre a DATA, sem hora nenhuma pelo meio: o `Date.UTC` trata o
 * excesso de dias (13 + 60) como o calendário trata, virando o mês e o ano
 * sozinho, e nenhuma mudança para a hora de Verão a meio da contagem lhe rouba
 * ou lhe dá um dia. Somar `dias × 24 h` a um instante não tem esta propriedade.
 */
export function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Data de validade (yyyy-mm-dd) de uma proposta: honra uma `validUntil`
 * explícita no doc, senão hoje + `validUntilDays` (por omissão
 * {@link DEFAULT_VALID_DAYS}). `from` é injetável para testes.
 *
 * ── PORQUE É QUE O «HOJE» NÃO É O DE GREENWICH ─────────────────────────────
 * Isto era `d.setDate(d.getDate() + days)` seguido de `toISOString()`, o que dá
 * sempre o dia UTC do instante mais os dias. Entre a meia-noite e a 01:00 do
 * Verão, Lisboa já virou o dia e Greenwich ainda não: uma proposta enviada às
 * 00:30 de 13 de Agosto contava a partir de 12 e saía «válida até 11 de
 * Outubro» em vez de 12 — um dia a menos do que os 60 que o documento promete,
 * e o dia que falta é o ÚLTIMO, que é justamente aquele em que os casais que
 * ainda não decidiram decidem. Depois disso, o link de aceitação recusa a
 * proposta com a data do próprio PDF ainda a dizer que ela é válida.
 *
 * O dia civil é lido no fuso do estúdio e os dias somam-se sobre esse dia, não
 * sobre o instante: o resultado é o mesmo com o processo em UTC (é onde correm
 * os servidores) ou em Lisboa, e nenhuma mudança para a hora de Verão a meio da
 * contagem lhe rouba ou lhe dá um dia.
 */
export function resolveValidUntil(
  doc: Pick<ProposalDoc, "validUntil" | "validUntilDays"> & { eventDate?: string },
  from: Date = new Date(),
): string {
  if (doc.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(doc.validUntil)) return doc.validUntil;
  const hoje = hojeNoEstudio(from);
  return somarDias(hoje, diasDeValidade(doc, hoje));
}

/**
 * Os dias de validade que valem para este documento, a contar de `hoje`.
 *
 * Sem dias escritos, os da regra do evento. Com dias escritos
 * (`validUntilDays`), esses — MAS, com o evento a 90 dias ou menos, nunca mais
 * do que a regra dá. É de propósito: o estúdio escrevia os 60 das
 * preferências em todos os rascunhos, e uma proposta para a semana que vem
 * continuava a dizer «válida 60 dias», que é o que ela não quer.
 */
export function diasDeValidade(
  doc: Pick<ProposalDoc, "validUntilDays"> & { eventDate?: string },
  hoje: string,
): number {
  const pelaRegra = diasDeValidadePeloEvento(hoje, diaDoEvento(doc.eventDate));
  // Floor BEFORE the positivity check: a fraction < 1 (e.g. 0.5) must fall back
  // to the default like an integer 0 — never collapse to a same-day (0-day)
  // validity, which /proposta's end-of-day expiry would treat as valid only on
  // the day of sending.
  const flooredDays =
    typeof doc.validUntilDays === "number" ? Math.floor(doc.validUntilDays) : Number.NaN;
  if (!(flooredDays > 0)) return pelaRegra;
  return eventoPerto(hoje, diaDoEvento(doc.eventDate))
    ? Math.min(flooredDays, pelaRegra)
    : flooredDays;
}

/** O evento é daqui a 1–90 dias (é aí que a regra encurta a validade). */
function eventoPerto(hoje: string, evento: string | null): boolean {
  const faltam = diasAte(hoje, evento);
  return faltam !== null && faltam > 0 && faltam <= 90;
}

function diasAte(hoje: string, evento: string | null): number | null {
  if (!evento) return null;
  const n = Math.round((Date.parse(evento) - Date.parse(hoje)) / 86_400_000);
  return Number.isFinite(n) ? n : null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A VALIDADE DEPENDE DE QUANTO FALTA PARA O EVENTO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A regra dela, de 14/10 (`hoje` e `evento` em yyyy-mm-dd):
 *
 *   · evento a mais de 90 dias  → 60 dias;
 *   · evento a 30–90 dias       → 30 dias, sem passar da véspera;
 *   · evento a menos de 30 dias → até à véspera, no máximo 7 dias e NUNCA
 *     menos de 5 («tem que ser pelo menos 5 dias») — mesmo que os 5 passem a
 *     véspera de um evento que é daqui a 3 dias;
 *   · sem data, ou com uma data que já passou → os 60 de sempre (a data errada
 *     é a Conferência que a aponta, não a validade).
 *
 * Os dias escritos à mão só passam por cima disto num evento a mais de 90
 * dias (ver {@link diasDeValidade}).
 */
export function diasDeValidadePeloEvento(hoje: string, evento: string | null): number {
  const faltam = diasAte(hoje, evento);
  if (faltam === null || faltam <= 0) return DEFAULT_VALID_DAYS;
  if (faltam > 90) return DEFAULT_VALID_DAYS;
  if (faltam >= 30) return Math.min(30, faltam - 1);
  return Math.max(5, Math.min(7, faltam - 1));
}

const MESES_DO_EVENTO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * O dia do evento (yyyy-mm-dd), a partir do que o estúdio escreve no campo
 * («12 de setembro de 2026»), ou `null`. É a mesma forma que
 * `isoDaDataPorExtenso` (em `proposal-doc-textos.ts`) reconhece — aqui à parte
 * porque esse ficheiro importa este, e um teste prende as duas iguais.
 */
export function diaDoEvento(texto: string | undefined): string | null {
  const t = (texto ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2}) de ([a-zç]+) de (\d{4})$/i.exec(t);
  if (!m) return null;
  const mes = MESES_DO_EVENTO.indexOf(m[2].toLowerCase());
  if (mes < 0) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Fills the fixed-text defaults into a partial doc, substituting the
 *  event-specific tokens in the general conditions. */
export function withProposalDefaults(
  doc: Omit<
    ProposalDoc,
    | "notasImportantes"
    | "incluido"
    | "naoIncluido"
    | "condicoesGerais"
    | "observacoesGerais"
    | "faseamento"
    | "cancelamento"
  > &
    Partial<
      Pick<
        ProposalDoc,
        | "notasImportantes"
        | "incluido"
        | "naoIncluido"
        | "condicoesGerais"
        | "observacoesGerais"
        | "faseamento"
        | "cancelamento"
      >
    >,
): ProposalDoc {
  const fill = (s: string) => preencherMarcadores(s, doc);
  return {
    ...doc,
    // Coerce the editor's variable arrays to [] — a corrupt/old localStorage
    // draft (merged in the studio on mount) could omit them, and the PDF
    // renderer iterates serviceGroups/budgetItems/… directly. A missing array
    // would throw "undefined is not iterable" → generic 500 "erro ao gerar".
    // Com `id` em cada grupo/item — preenchido pela POSIÇÃO quando falta (ver
    // {@link withServiceIds}), para o editor ter uma identidade estável por
    // linha sem que o documento serialize diferente a cada chamada.
    serviceGroups: withServiceIds(doc.serviceGroups ?? []),
    moodBoards: withMoodBoardIds(doc.moodBoards ?? []),
    cronograma: doc.cronograma ?? [],
    budgetItems: doc.budgetItems ?? [],
    budgetExtras: doc.budgetExtras ?? [],
    budgetRows: doc.budgetRows ?? [],
    // A capa sai sempre com as 2 posições preenchidas ("" = vazia), venha o
    // rascunho na forma antiga (esparsa/curta) ou já na nova.
    coverImages: normaliseCoverImages(doc.coverImages),
    notasImportantes: doc.notasImportantes ?? DEFAULT_NOTAS_IMPORTANTES,
    incluido: doc.incluido ?? DEFAULT_INCLUIDO,
    naoIncluido: doc.naoIncluido ?? DEFAULT_NAO_INCLUIDO,
    condicoesGerais: (doc.condicoesGerais ?? DEFAULT_CONDICOES_GERAIS).map(fill),
    observacoesGerais: doc.observacoesGerais ?? DEFAULT_OBSERVACOES_GERAIS,
    // O faseamento por omissão SEGUE a percentagem do sinal deste documento —
    // um faseamento escrito à mão continua a mandar, como todos os outros
    // blocos de texto fixo.
    faseamento: doc.faseamento ?? faseamentoPorOmissao(depositPercentOf(doc)),
    cancelamento: doc.cancelamento ?? DEFAULT_CANCELAMENTO,
  };
}
