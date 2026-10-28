/**
 * Biblioteca de Temas — tipos partilhados (client-safe).
 *
 * Um "tema" é uma pasta de fotos de inspiração que o estúdio reutiliza de
 * casamento para casamento ("Itália", "Terracotta", "Branco & Verde"…). Em vez
 * de ir ao Pinterest / às pastas do disco a cada proposta, a equipa carrega as
 * fotos UMA vez aqui e depois, no estúdio de propostas, escolhe o tema e
 * insere as imagens diretamente no mood board ou na capa.
 *
 * Os metadados do tema (nome, notas) vivem na tabela `proposal_themes`; as
 * fotos vivem no bucket privado de Storage `theme-assets`, uma pasta por tema
 * (ver `theme-storage.ts`). Este módulo não importa nada de servidor para
 * poder ser usado pelos componentes do back office.
 */

/** Um tema da biblioteca (metadados; as fotos são listadas do Storage). */
export interface ProposalTheme {
  id: string;
  /** Nome mostrado à equipa, ex.: "Terracotta". */
  name: string;
  /** Nota interna opcional ("tons quentes, para espaços de pedra"). */
  notes?: string;
  /** Foto ESCOLHIDA para o cartão do tema (caminho no bucket, `<tema>/<f>.jpg`).
   *  Ausente = o cartão usa a foto mais recente da pasta, como antes. */
  coverPath?: string;
  /**
   * As fotos que a equipa ARRUMOU à mão, pela ordem que escolheu — e só essas.
   *
   * A pasta continua a ser a única fonte de verdade do que EXISTE; isto é
   * apenas a ordem preferida de um prefixo dela. Tudo o que não está aqui vem
   * a seguir, das mais recentes para as mais antigas, como sempre veio. Guardar
   * só o que foi arrumado é o que faz isto caber numa linha: arrastar seis
   * fotos boas para a frente custa seis caminhos, não uma cópia do catálogo.
   *
   * Um caminho que já não exista na pasta é simplesmente ignorado ao listar —
   * apagar uma foto nunca deixa a ordem inválida.
   */
  photoOrder?: string[];
  /**
   * O que este tema É.
   *
   * `pasta` — as suas fotos são as da pasta com o mesmo id (como sempre foi).
   * `filtro` — é uma pergunta guardada: as fotos são as que respondem à
   *   `filterRule`, venham da pasta que vierem. É o que permite que a mesma foto
   *   apareça em vários temas sem existir duas vezes.
   * `manual` — uma lista de fotos escolhida à mão, para o que não encaixa em
   *   etiqueta nenhuma.
   *
   * Ausente conta como `pasta`: é o comportamento de antes desta funcionalidade
   * e o de qualquer base onde a migração ainda não correu.
   */
  kind?: "pasta" | "filtro" | "manual";
  /** A regra, quando `kind` é `filtro` (ver `RegraDoTema`). */
  filterRule?: import("./biblioteca-types").RegraDoTema;
  /** Fixado no topo da lista. Os temas de que se usa em quase todas as
   *  propostas não têm de ser procurados de cada vez. */
  favorito?: boolean;
  /**
   * Fora da lista principal, sem ser apagado.
   *
   * Existe para haver uma alternativa a eliminar: um tema que já não se usa
   * leva atrás as fotos quando é apagado, e essa decisão é definitiva. Arquivar
   * tira-o da frente e deixa tudo onde está.
   */
  arquivado?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Uma foto guardada: caminho estável no bucket + URL assinado p/ pré-visualizar. */
export interface ThemeImage {
  path: string;
  /** URL assinado do ORIGINAL (o que vai para a proposta / para a capa). */
  url: string;
  /** URL assinado da miniatura, quando existe. É esta que a grelha deve
   *  mostrar: o original tem ~3000 px e 2,5–3,5 MB, e uma grelha de 100 fotos
   *  a puxar originais são centenas de MB. As fotos carregadas ANTES de as
   *  miniaturas existirem não têm nenhuma — nesse caso mostra-se `url`. */
  thumbUrl?: string;
  /**
   * URL assinado da MICRO (96 px), quando existe.
   *
   * Para as tiras de pré-visualização do cartão de tema, que são desenhadas
   * com 43 px e recebiam o ficheiro de 400 — 9,3× mais píxeis do que os que se
   * pintam. Ausente nas fotos anteriores a esta derivada existir; nesse caso
   * mostra-se a `thumbUrl`, como sempre.
   */
  microUrl?: string;
  /**
   * A fotografia em 16 px, em `data:` URI — desenhada a **0 ms**, antes de
   * haver rede, enquanto a `thumbUrl` viaja.
   *
   * Viaja DENTRO deste JSON de propósito: são ~180 caracteres por foto (~19 KB
   * nas 104 da biblioteca) contra os 1845–2192 ms de caixa cinzenta que a
   * linha de base mediu. Um pedido a mais por foto deitaria a ideia toda ao
   * chão — o que se está a comprar é precisamente não haver pedido.
   *
   * Ausente nas fotos carregadas antes disto existir, e enquanto a migração
   * não correr. Sem ele a célula fica como sempre esteve.
   */
  lqip?: string;
  /**
   * A cor dominante da fotografia, em `#rrggbb` — ver `Foto.cor`.
   *
   * Serve o aviso de paleta e o «organizar automaticamente» do estúdio.
   * Ausente nas fotos carregadas antes disto existir; sem ela a fotografia
   * simplesmente não entra em nenhum dos dois.
   */
  cor?: string;
  /**
   * As medidas do ficheiro guardado, em pixéis (`biblioteca_fotos`). É o que
   * deixa o seletor dizer ANTES de escolher que uma foto vai ficar com má
   * qualidade (ela, 28/10). Ausentes nas fotos anteriores a estas colunas.
   */
  largura?: number;
  altura?: number;
}

/** O que `GET /api/temas/[id]/imagens?offset=&limit=` devolve. */
export interface ThemeImagePage {
  /** A pasta foi mesmo lida. `false` = falha temporária, NÃO "tema sem fotos". */
  ok: boolean;
  /** Só a página pedida — só estas é que foram assinadas. */
  images: ThemeImage[];
  /** Total de fotos do tema. Com `truncated`, é um MÍNIMO. */
  total: number;
  /** A contagem bateu no teto: há mais fotos do que as contadas. */
  truncated: boolean;
}

/** Fotos por página na grelha de um tema (o que a UI pede por omissão). */
export const THEME_PAGE_SIZE = 60;

/** Teto por página aceite pela rota — acima disto o pedido é cortado, não
 *  recusado. Impede que um `?limit=5000` mande assinar a biblioteca toda. */
export const MAX_THEME_PAGE_SIZE = 200;

/** O que a lista de temas precisa para desenhar um cartão. */
export interface ThemeSummary extends ProposalTheme {
  /** Nº de fotos na pasta do tema, ou `null` quando a pasta NÃO pôde ser lida
   *  (Storage em baixo). Distinguir os dois casos evita mostrar "0 fotos" —
   *  que a equipa leria como "as minhas fotos desapareceram" — quando o que
   *  aconteceu foi uma falha temporária de leitura. */
  imageCount: number | null;
  /** A contagem é um MÍNIMO: a listagem da pasta bateu no limite por página. */
  truncated?: boolean;
  /** URL assinado da foto do cartão: a escolhida (`coverPath`) ou, sem
   *  escolha — ou se a escolhida já não existir —, a primeira da grelha (a
   *  primeira da ordem manual, ou a mais recente sem ordem). */
  coverUrl?: string;
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * O PLANO B, QUE TEM DE VIAJAR ATÉ AO NAVEGADOR
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `coverUrl` traz a DERIVADA mais adequada — a miniatura de 400 px para uma
   * capa desenhada com ~128. Essa derivada pode não existir: nasce no
   * carregamento, e as fotos anteriores a ela (ou migradas em massa) não a
   * têm.
   *
   * E aqui está a armadilha que partiu a página: **assinar um caminho não
   * verifica que o ficheiro existe.** O `createSignedUrls` devolve um URL
   * perfeitamente formado para um objecto que não está lá — que depois dá
   * 404 no `<img>`. O servidor achava que tinha plano B (o original é sempre
   * assinado) mas nunca o chegava a usar, porque para ele a derivada
   * "existia": estava no mapa.
   *
   * Quem descobre a verdade é o navegador, no `onError`. Por isso o plano B
   * tem de ir com ele: o URL do ORIGINAL, que é o único que veio da LISTAGEM
   * da pasta e portanto o único que existe de certeza.
   *
   */
  coverFallbackUrl?: string;
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * O BORRÃO QUE FAZ O CARTÃO NÃO NASCER CINZENTO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «placeholder blur por foto — acaba o ecrã de cartões
   * cinzentos».
   *
   * São poucas centenas de bytes por fotografia, e viajam DENTRO desta
   * resposta: estão pintados no primeiro fotograma, antes de qualquer ida ao
   * Storage. A grelha de fotos de um tema e o seletor já os usavam; os
   * CARTÕES, que são a primeira coisa que se vê ao abrir a biblioteca, eram os
   * únicos a ficar à espera em cinzento.
   *
   * Não custam uma ida a mais: os `lqip` lêem-se por PASTA, e a lista de temas
   * já sabe de que pastas precisa. Podem faltar (fotos anteriores à migração),
   * e aí o cartão fica como estava.
   *
   */
  coverLqip?: string;
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A OFERTA EM AVIF
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Um AVIF pesa menos 25% do que o WebP com a mesma fidelidade — medido, e a
   * tabela está em `derivadas.ts`. Mas o Safari só o lê desde o iOS 16 — e estas fotografias são
   * também as que um casal abre na página da proposta, no telemóvel que tiver.
   *
   * Por isso viaja SEPARADO e é uma proposta, não uma troca: o `<picture>`
   * oferece-o primeiro e quem não o souber ler pede o `coverUrl`, que existe
   * sempre.
   *
   * Ausente quer dizer «não há» — e é uma ausência de confiança, não uma
   * suposição: o Supabase só assina o que está lá. Isso importa porque um
   * `<source>` que dá 404 NÃO faz o navegador recuar para o `<img>`.
   *
   */
  coverAvif?: string;
  /**
   * A cor dominante da capa, em `#rrggbb` — a mesma `ThemeImage.cor`.
   *
   * É o que o cartão pinta no lugar da fotografia enquanto ela não chega, e o
   * que fica se ela não chegar de todo (as duas fontes a dar erro): «nunca um
   * cartão vazio» (T1). Viaja aqui pela mesma razão do borrão — está pintada
   * no primeiro fotograma, sem ida nenhuma ao Storage.
   *
   * Ausente nas fotos anteriores à cor existir e quando a leitura estoura o
   * tempo da lista; aí o lugar é o esqueleto cinzento de sempre.
   */
  coverCor?: string;
}

/** Limites de escrita partilhados entre o formulário e as rotas de API. */
export const MAX_THEME_NAME = 60;
export const MAX_THEME_NOTES = 300;

/**
 * Quantas fotos podem ficar com ordem manual num tema.
 *
 * Não é um limite de fotos por tema (esse não existe): é o tamanho do prefixo
 * arrumado à mão. Arrumar as primeiras centenas cobre o uso real — pôr as
 * melhores à frente — e mantém a linha do tema pequena e a listagem barata.
 */
export const MAX_PHOTO_ORDER = 500;

/**
 * Compara nomes de temas como a equipa os lê: sem acentos, sem maiúsculas e
 * sem espaços a mais. "Itália", "italia" e "  ITALIA " são o MESMO tema — sem
 * isto a biblioteca enche-se de pares quase iguais que ninguém distingue no
 * seletor da proposta. É a forma normalizada que as rotas comparam antes de
 * escrever (o índice único da base de dados é o backstop, ver db/schema.sql).
 *
 * Vive neste módulo — e não no do Storage — para o formulário de criação poder
 * usar exatamente a mesma regra e avisar antes de enviar, em vez de a equipa
 * levar com o 409 depois de escrever o nome todo.
 */
export function normalizedThemeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A recusa que as rotas devolvem quando o nome colide com um tema existente.
 *  Uma só definição: a mensagem é lida pela equipa e testada nas duas rotas. */
export function themeNameTakenError(name: string): string {
  return `Já existe um tema com um nome equivalente a "${name}".`;
}

/** Quantas fotos podem ser importadas para uma proposta de uma só vez. */
export const MAX_IMPORT_BATCH = 40;

// ── Não repetir fotos que já estão no tema ─────────────────────────────────

/**
 * Quantos resumos podem ser perguntados de uma vez a `/api/temas/[id]/repetidas`.
 *
 * Um teto por PEDIDO, não por arrasto: o cliente parte o lote em pedaços (ver
 * `CHECK_CHUNK`) e um pedido feito à mão não pode mandar comparar 5000 valores.
 */
export const MAX_DUPLICATE_CHECK = 500;

/**
 * Resumos por pedido de pré-verificação, do lado do cliente.
 *
 * Em pedaços de 50 e não o lote todo: assim a primeira foto começa a subir ao
 * fim de ~0,3 s em vez de ~2 s num arrasto de 300 (MEDIDO: sha256 a 251 MB/s,
 * ~16 ms por foto de 4 MB). Do segundo pedaço em diante o índice do servidor
 * já está em memória e a chamada é quase grátis.
 */
export const CHECK_CHUNK = 50;

/** Porque é que uma foto do arrasto NÃO foi adicionada. Nunca é um erro: são
 *  os dois casos em que a foto já lá está. */
export type SkipReason =
  /** Já existe uma foto igual NESTE tema. */
  | "no-tema"
  /** A mesma foto vinha duas vezes DENTRO deste arrasto. */
  | "no-lote";

/** Uma foto do lote que o servidor não escreveu por já lá estar. */
export interface ThemeDuplicate {
  /** Nome do ficheiro do lado dela — é como ela reconhece a foto. */
  name: string;
  /** O caminho da foto que JÁ estava no tema, quando se sabe qual é. */
  path?: string;
  reason: SkipReason;
}

// ── Levar fotos de um tema para outro ──────────────────────────────────────

/**
 * Fotos por pedido de cópia. O 40 já é o vocabulário desta casa
 * (`MAX_IMPORT_BATCH`), e um lote destes são ~80 chamadas de Storage e ZERO
 * bytes a atravessar a função — folgado nos 60 s de `maxDuration`.
 *
 * Acima disto a rota RECUSA (400), não corta em silêncio: um pedido feito à
 * mão não pode pôr 5000 cópias a correr.
 */
export const MAX_THEME_COPY_BATCH = 40;

/**
 * Fotos por lote do lado do cliente. Maior do que o `IMPORT_CHUNK` de 8 do
 * seletor de propostas porque aqui não passam bytes nem há ordem a preservar —
 * o lote pode ser maior sem a barra de progresso parar.
 */
export const THEME_COPY_CHUNK = 20;

/**
 * Copiar ou mover. Campo OBRIGATÓRIO e sem valor por omissão na rota: um
 * "mover" nunca pode sair de um pedido a que faltou um campo.
 *
 * Em português porque é o que a rota recebe e o que a equipa lê nos registos —
 * como o resto das rotas desta casa.
 */
export type ThemeCopyMode = "copiar" | "mover";

/** O que `POST /api/temas/[id]/imagens/copiar` devolve. */
export interface ThemeCopyResult {
  ok: true;
  /** As que ficaram mesmo no destino, `de → para`. */
  copied: { from: string; to: string }[];
  /** As que JÁ estavam no destino (o Storage respondeu 409). Não é um erro. */
  existing: string[];
  /** As que não foi possível levar — continuam na origem, intactas. */
  failed: string[];
  /** Quantas foram pedidas (depois de tirar repetições). */
  requested: number;
  /** Fotos que chegaram ao destino SEM miniatura porque a cópia dela falhou.
   *  O tema de destino passa a puxar originais e é preciso dizê-lo. */
  thumbsMissing: number;
}

// ── Juntar dois temas num só ───────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FUNDIR TEMAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre a biblioteca: «há temas duplicados — "Itália" e
 * "Italia", "Branco e verde" e "Branco & Verde" —, e a única saída é apagar um
 * dos dois, que leva as fotos atrás».
 *
 * Fundir é uma composição do que já existe — mover cada foto para o outro tema
 * (`transferThemeImage`, a mesma primitiva do «Copiar para…») — mais duas
 * coisas que só uma fusão faz: juntar as notas e tirar da lista o tema que
 * ficou vazio.
 *
 * ── O QUE NUNCA ACONTECE ────────────────────────────────────────────────
 *
 * Nenhuma fotografia é APAGADA. Nem uma. Isso deixa duas consequências à
 * vista, e as duas são propositadas:
 *
 *  · uma foto que já esteja no destino com o mesmo nome de ficheiro FICA na
 *    origem. É quase de certeza a mesma fotografia — desde o
 *    `theme-fingerprint.ts` o nome É o resumo do conteúdo, e as antigas, de
 *    nome UUID, só colidem se uma tiver saído da outra —, mas «quase de
 *    certeza» não chega para apagar. O Storage responde 409 e ficamos por aí;
 *  · por isso a origem pode não ficar vazia, e nesse caso NÃO é arquivada. O
 *    relatório diz quantas ficaram e porquê, e apagar o tema continua a ser
 *    uma decisão dela, no botão que já existe para isso.
 *
 * É lento de propósito: uma fusão que apaga fotos por dedução é uma fusão que
 * um dia apaga a errada.
 */

/**
 * Fotos por chamada de `POST /api/temas/[id]/fundir`.
 *
 * O mesmo 40 do `MAX_THEME_COPY_BATCH`, e pela mesma razão: são ~120 chamadas
 * de Storage (a foto e as suas derivadas) e ZERO bytes a atravessar a função,
 * o que cabe folgado nos 60 s de `maxDuration`.
 */
export const THEME_MERGE_BATCH = MAX_THEME_COPY_BATCH;

/** O que uma chamada de `POST /api/temas/[id]/fundir` devolve. */
export interface ThemeMergeBatch {
  ok: true;
  /** Foram mesmo para o destino, e saíram da origem. */
  moved: number;
  /** Já lá estavam com o mesmo nome de ficheiro. Ficaram na origem. */
  existing: number;
  /** Não foi possível levar — continuam na origem, intactas. */
  failed: number;
  /** Chegaram ao destino sem miniatura: esse tema passa a puxar originais. */
  thumbsMissing: number;
  /**
   * Por onde a chamada seguinte continua a listar.
   *
   * As que SAEM encolhem a pasta e não contam; as que ficam (repetidas ou
   * falhadas) têm de ser saltadas, senão a chamada seguinte tentava-as outra
   * vez e a fusão nunca acabava.
   */
  nextOffset: number;
  /** A pasta da origem acabou — não há mais nada para tentar. */
  done: boolean;
  /** Quantas fotos ficaram na origem no fim de tudo (só faz sentido com `done`). */
  leftBehind: number;
  /** A origem ficou vazia e saiu da lista. Ver `ThemeMergeBatch` acima. */
  archived: boolean;
}
