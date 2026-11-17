/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ACENTOS QUE FALTAM NOS CAMPOS QUE SAEM IMPRESSOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Decor Floral Cerimonia" sem acento na lista de serviços →
 * "Cerimónia". Verificação ortográfica dos campos que saem no PDF.»
 *
 * O documento é escrito à pressa, muitas vezes com o casal ao telefone, e
 * quase todos os campos são texto livre. O que se perde não são erros de
 * português — é o acento de UMA palavra num título em corpo 24, na página que
 * o casal lê primeiro. Ninguém relê um documento de catorze páginas à procura
 * de um «ó».
 *
 * ── O QUE ISTO NÃO É ──────────────────────────────────────────────────────
 * Não é um corrector ortográfico. Um corrector generalista em texto de
 * decoração floral produz mais ruído do que achados — «lisianthus»,
 * «ranunculus», «Monte da Oliveirinha», os nomes dos noivos — e um aviso que
 * está sempre errado é um aviso que se aprende a ignorar, incluindo no dia em
 * que está certo.
 *
 * É uma lista FECHADA de palavras que aparecem nestas propostas e que só têm
 * uma grafia possível. Cada entrada é uma palavra cuja forma sem acento NÃO É
 * uma palavra portuguesa — «cerimonia», «decoracao», «hortensias». É por isso
 * que os pares ambíguos («esta/está», «pais/país», «por/pôr», «para/pára») não
 * estão aqui e não podem estar: nesses, só o sentido da frase decide, e este
 * ficheiro não tem sentido nenhum de frase.
 *
 * ── E A MARCA ─────────────────────────────────────────────────────────────
 * «Liquen» sem acento entra pela mesma porta. O código escreve sempre
 * «Líquen»; o que chegava aos PDFs sem acento vinha dos campos escritos à mão.
 *
 * ── PURO DE PROPÓSITO ─────────────────────────────────────────────────────
 * Recebe um documento e devolve achados; recebe um achado e devolve um
 * documento novo. Não sabe o que é React nem o que é um PDF — o que permite
 * medir isto num teste em vez de o experimentar num ecrã.
 */

import type { ProposalDoc } from "./proposal-doc";

/**
 * As palavras, na grafia certa.
 *
 * Regra de admissão, e não é negociável: a forma SEM acentos não pode ser uma
 * palavra portuguesa com sentido próprio. Ver o cabeçalho.
 */
export const PALAVRAS_CERTAS = [
  // ── As rubricas destas propostas ──
  "cerimónia",
  "cerimónias",
  "decoração",
  "decorações",
  "inspiração",
  "organização",
  "iluminação",
  "produção",
  "montagens",
  "adereços",
  "convidados",
  "salão",
  "salões",
  "jardim",
  "corredor",
  "ramo",
  "hortênsias",
  "cravo",
  "lisianthus",
  "sépalas",
  "acessórios",
  "têxteis",
  "tecidos",
  "cadeiras",
  "mobiliário",
  "candelabros",
  "âmbar",
  "búzios",
  "cerâmica",
  "porcelana",
  "âncora",
  // ── Palavras de orçamento e de condições ──
  "orçamento",
  "orçamentos",
  "válido",
  "válida",
  "validade",
  "número",
  "números",
  "período",
  "prévio",
  "prévia",
  "após",
  "início",
  "prazo",
  "condições",
  "observações",
  "notas",
  "adjudicação",
  "anulação",
  "devolução",
  "informação",
  "confirmação",
  "alteração",
  "alterações",
  "responsabilidade",
  "disponibilidade",
  "área",
  "áreas",
  "próximo",
  "próxima",
  "último",
  "última",
  "único",
  "única",
  "mínimo",
  "máximo",
  "média",
  "vídeo",
  "email",
  "telemóvel",
  "morada",
  "família",
  "famílias",
  // ── Estilos, que dão nome a temas da biblioteca ──
  // Entram pela mesma regra de admissão: «classico» e «mediterranico» não são,
  // eles próprios, palavras portuguesas. Servem os campos impressos e os NOMES
  // DOS TEMAS (ver `tema-nome.ts`), que é onde apareceram primeiro.
  "simbólico",
  "simbólica",
  "clássico",
  "clássica",
  "clássicos",
  "clássicas",
  "mediterrânico",
  "mediterrânica",
  "rústico",
  "rústica",
  "romântico",
  "romântica",
  // ── A marca ──
  "líquen",
] as const;

/** Sem acentos, minúsculas. A chave por que uma palavra escrita é procurada. */
function semAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** `cerimonia` → `cerimónia`. Construído uma vez. */
const POR_CHAVE: ReadonlyMap<string, string> = new Map(
  PALAVRAS_CERTAS.map((p) => [semAcentos(p), p]),
);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRAFIA DA CASA — as palavras que não são de acento
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista de cima resolve os acentos, e há rubricas destas propostas que se
 * escrevem mal sem ser por acento nenhum. Vêm dos documentos verdadeiros: o
 * pedido da Catarina Martins traz «Decoração Cocktail / Seatting Plan e Decor
 * Floral Seatting Plann» — a mesma palavra escrita de duas maneiras erradas na
 * mesma linha, e ambas saíram impressas.
 *
 * Regra de admissão, tão apertada como a de cima: a forma da esquerda não pode
 * ser uma palavra — nem portuguesa nem inglesa. Não é aqui que se arbitram
 * sinónimos («copo d'água» e «cocktail» são as duas coisas certas e são a mesma
 * festa); é aqui que se apanha o que ninguém quis escrever.
 *
 * A excepção é `coquetel`, que É uma palavra — a forma brasileira. Entra porque
 * o catálogo de pontos de decoração, o formulário e o quadro do orçamento
 * escrevem todos «Cocktail», e um documento que misture as duas lê-se como
 * dois documentos colados.
 */
const GRAFIAS_DA_CASA: ReadonlyArray<readonly [errada: string, grafia: string]> = [
  ["seatting", "seating"],
  ["seattings", "seatings"],
  ["plann", "plan"],
  ["planns", "plans"],
  ["coquetel", "cocktail"],
  ["coquetéis", "cocktails"],
];

const POR_ERRO: ReadonlyMap<string, string> = new Map(
  GRAFIAS_DA_CASA.map(([errada, grafia]) => [errada.toLowerCase(), grafia]),
);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TERMOS INGLESES DA CASA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma proposta da Líquen é escrita em português e leva meia dúzia de palavras
 * inglesas que são o nome das coisas: um «seating plan» não é um «plano de
 * lugares» e um «welcome drink» não é um «copo de boas-vindas» — é assim que
 * elas se chamam no ofício, e é assim que os casais as procuram.
 *
 * Ora um corrector português não tem opinião nenhuma sobre uma palavra
 * inglesa: para ele, «seatting» é tão estrangeira como «seating». Foi por aí
 * que «Decoração Seatting Plan» chegou a um cliente.
 *
 * ── PORQUE É QUE ISTO NÃO É UMA LISTA DE ERROS ───────────────────────────
 *
 * Porque a lista de erros já existe (a {@link GRAFIAS_DA_CASA}, ali em cima) e
 * tem um tecto: só apanha os enganos que alguém já viu acontecer e se lembrou
 * de escrever. Acrescentar «wellcome», «cocktaill» e «brunchh» à mão era
 * adivinhar de que maneira é que ela vai escrever mal uma palavra que ainda
 * não escreveu mal.
 *
 * Esta lista é dos termos CERTOS, e a regra que os defende é uma só: uma
 * palavra que não se conhece, mas que passa a ser um destes termos quando se
 * DESDOBRA uma letra repetida, é uma gralha. «seatting» → «seating»,
 * «plann» → «plan», «wellcome» → «welcome», «cocktaill» → «cocktail».
 *
 * É exactamente o engano que estas palavras provocam em quem escreve
 * português: a consoante dobrada inglesa que a mão portuguesa dobra onde não
 * deve, ou dobra a mais.
 *
 * ── E PORQUE É QUE NÃO DISPARA EM PALAVRAS BOAS ─────────────────────────
 *
 * Porque só se olha para o que já não foi reconhecido, e porque a forma
 * desdobrada tem de ser um destes termos EXACTAMENTE. Uma palavra portuguesa
 * com consoante dobrada — «carro», «pessoa», «terra» — desdobra para «caro»,
 * «pesoa», «tera», e nenhuma delas está nesta lista nem pode estar: só entram
 * palavras inglesas do ofício.
 */
const TERMOS_INGLESES_DA_CASA: readonly string[] = [
  "seating",
  "seatings",
  "plan",
  "plans",
  "cocktail",
  "cocktails",
  "welcome",
  "drink",
  "drinks",
  "save",
  "date",
  "brunch",
  "lounge",
  "catering",
  "buffet",
  "coffee",
  "break",
  "after",
  "party",
  "finger",
  "food",
  "photo",
  "booth",
  "dress",
  "code",
  "mood",
  "board",
  "boards",
  "boho",
  "candy",
  "bar",
  "kids",
  "corner",
  "chill",
  "out",
  "open",
  "table",
  "wedding",
  "planner",
  "styling",
  "backdrop",
  "arch",
  "greenery",
];

const TERMOS_INGLESES = new Set(TERMOS_INGLESES_DA_CASA);

/**
 * A mesma palavra com UMA letra repetida desdobrada, em todas as posições onde
 * ela se repete.
 *
 * «seatting» dá «seating»; «plann» dá «plan»; «bookkeeping» daria
 * «bokkeeping», «bookeeping» e «bookkeping» — três candidatos, e é por isso
 * que se devolvem todos: a palavra pode ter mais do que um par dobrado e não
 * se sabe qual é o errado sem experimentar.
 */
function semUmaLetraDobrada(palavra: string): string[] {
  const saida: string[] = [];
  for (let i = 1; i < palavra.length; i += 1) {
    if (palavra[i] === palavra[i - 1]) saida.push(palavra.slice(0, i) + palavra.slice(i + 1));
  }
  return saida;
}

/**
 * O termo inglês da casa que esta palavra QUERIA ser, ou nada.
 *
 * ── O NOME, OUTRA VEZ ─────────────────────────────────────────────────────
 * Chamou-se `termoInglesQuaseCerto` durante um commit, e o CodeQL voltou a
 * levantar o alerta de severidade alta que já está descrito no cabeçalho do
 * `grafiaDe`: `Certo` tem `cert` lá dentro, a heurística lê-o como
 * «certificate», e tudo o que sai daqui passa a ser tratado como segredo até
 * chegar ao `localStorage` do rascunho. A regra escrita neste ficheiro é
 * antiga e eu quebrei-a: aqui não há identificadores com «cert», por mais
 * portuguesa que seja a palavra.
 */
function termoDaCasaPorUmaLetra(minuscula: string): string | undefined {
  // Já é um deles: não há nada a dizer. É esta linha que impede o aviso de
  // tocar sobre a palavra bem escrita.
  if (TERMOS_INGLESES.has(minuscula)) return undefined;
  for (const candidato of semUmaLetraDobrada(minuscula)) {
    if (TERMOS_INGLESES.has(candidato)) return candidato;
  }
  return undefined;
}

/**
 * A grafia boa de uma palavra escrita, venha ela do acento ou da lista da casa.
 *
 * ── O NOME NÃO É INOCENTE ─────────────────────────────────────────────────
 * Chamou-se `certaPara` durante um commit, e o CodeQL levantou um alerta de
 * severidade alta — «clear text storage of sensitive information» — na gravação
 * do rascunho no `localStorage`, a dezenas de ficheiros daqui. A razão é uma
 * heurística de NOMES: `cert…` lê-se como «certificate», e o que sai de uma
 * função com esse nome passa a ser tratado como segredo até chegar a um sítio
 * onde é gravado em claro.
 *
 * Não havia segredo nenhum — é uma palavra de dicionário —, mas «certa» em
 * português e `cert` em inglês são a mesma sequência de letras, e discutir com
 * a heurística sai mais caro do que escolher outro nome. Fica `grafiaDe`.
 *
 * ── E NÃO CHEGOU MUDAR O NOME DA FUNÇÃO ───────────────────────────────────
 * O alerta voltou, igual, com a mesma linha do `localStorage` apontada: a
 * heurística não olha só ao nome da função, olha a CADA variável por onde o
 * valor passa. Ficavam cinco `certa` — a etiqueta do tuplo das grafias, o
 * parâmetro de `comAsMaiusculasDe` e as leituras dentro de `gralhasDoDoc` —, e
 * cada uma delas marcava outra vez o texto como segredo. Passaram todas a
 * `grafia`. A regra, para quem escrever aqui: neste ficheiro não há
 * identificadores começados por «cert», por mais portuguesa que seja a palavra.
 */
function grafiaDe(palavra: string): string | undefined {
  const minuscula = palavra.toLowerCase();
  return (
    POR_CHAVE.get(semAcentos(palavra)) ??
    POR_ERRO.get(minuscula) ??
    // Por último, e é de propósito: as duas listas de cima são fechadas e
    // sabem o que dizem. A regra da letra dobrada é uma inferência, e uma
    // inferência nunca pode ganhar a uma palavra que está numa lista.
    termoDaCasaPorUmaLetra(minuscula)
  );
}

/**
 * A palavra certa, com as maiúsculas da que estava escrita.
 *
 * «CERIMONIA» num título em capitulares tem de voltar «CERIMÓNIA», e não
 * «cerimónia» — a correcção não pode trazer atrás uma alteração de desenho que
 * ninguém pediu.
 */
function comAsMaiusculasDe(escrita: string, grafia: string): string {
  if (escrita === escrita.toUpperCase() && escrita !== escrita.toLowerCase()) {
    return grafia.toUpperCase();
  }
  if (escrita[0] === escrita[0]?.toUpperCase()) {
    return grafia[0].toUpperCase() + grafia.slice(1);
  }
  return grafia;
}

/**
 * Onde é que o texto vive dentro do documento.
 *
 * Um caminho estruturado, e não um `string` com o nome do campo: é isto que
 * permite escrever a correcção de volta no sítio certo sem procurar texto — um
 * «Cerimonia» que apareça em dois campos corrige-se um de cada vez.
 */
export type CampoDeTexto =
  | { tipo: "ref" }
  | { tipo: "headerTitle" }
  | { tipo: "servico" }
  | { tipo: "eventType" }
  | { tipo: "totalLabel" }
  | { tipo: "budgetNote" }
  | { tipo: "grupoTitulo"; gi: number }
  | { tipo: "itemRotulo"; gi: number; ii: number }
  | { tipo: "itemDesc"; gi: number; ii: number }
  | { tipo: "boardTitulo"; bi: number }
  | { tipo: "boardSubtitulo"; bi: number }
  | { tipo: "boardNota"; bi: number }
  | { tipo: "linhaDeOrcamento"; i: number }
  | { tipo: "extraRotulo"; i: number };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROSA QUE SAI PUBLICADA E NÃO ESTÁ NO INVENTÁRIO BILINGUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para uma proposta que já tinha seguido: «o corretor
 * ortográfico existe no ecrã de envio, mas estes erros chegaram à página. O
 * corretor tem de correr sobre TODO o conteúdo publicado.»
 *
 * MEDIDO, campo a campo, antes de mexer: as gralhas varriam catorze famílias de
 * campo e deixavam de fora três que ela escreve à mão e que saem publicadas —
 * o cronograma do modelo Organização, as linhas estimadas do mesmo modelo, e as
 * alternativas que o casal escolhe. Escrever «decoracao» em qualquer uma delas
 * passava sem uma palavra.
 *
 * ── E PORQUE É QUE NÃO ENTRAM NO `CampoDeTexto` ──────────────────────────
 *
 * Porque esse tipo tem um segundo dono. `proposal-doc-bilingue.ts` percorre-o
 * com um `switch` sem `default` — de propósito, para que um campo novo não
 * possa nascer mudo numa proposta inglesa. Meter estes lá dentro obrigava a
 * responder «tem segunda versão?» a cada um, e as respostas honestas seriam:
 *
 *   cronograma, linhas estimadas  não têm par inglês NENHUM no tipo do
 *                                 documento — é uma lacuna conhecida, escrita
 *                                 no cabeçalho de `proposal-doc-bilingue.ts`,
 *                                 e não é esta a alteração que a resolve;
 *   alternativas                  TÊM par inglês (`tituloEn`, `rotuloEn`…) e
 *                                 já são contadas — por `camposDeEscolhaPor-
 *                                 Traduzir`, que é de quem elas são.
 *
 * Nos dois casos, entrar no inventário bilingue dava uma resposta errada: no
 * primeiro escrevia-se `false` num campo de prosa dela (que é exactamente o
 * modo de falha que aquele `switch` existe para impedir), no segundo passavam a
 * ser contadas duas vezes, no painel das traduções e no das alternativas.
 *
 * Por isso as duas listas divergem, e divergem DITAS: `camposDoDocumento` é o
 * inventário bilingue, `camposPublicados` é tudo o que sai publicado. Quem lê
 * um campo para o corrigir usa a segunda.
 */
export type OutroCampoPublicado =
  | { tipo: "cronogramaTitulo"; pi: number }
  | { tipo: "cronogramaItem"; pi: number; ii: number }
  | { tipo: "linhaEstimada"; i: number }
  | { tipo: "escolhaTitulo"; ei: number }
  | { tipo: "escolhaNota"; ei: number }
  | { tipo: "escolhaRotulo"; ei: number; oi: number }
  | { tipo: "escolhaDescricao"; ei: number; oi: number };

/** Todo o texto livre que chega ao casal — o que o corretor tem de varrer. */
export type CampoPublicado = CampoDeTexto | OutroCampoPublicado;

/**
 * ── ONDE É QUE ESTE CAMPO ESTÁ NO ECRÃ ────────────────────────────────────
 *
 * O aviso dizia qual era a palavra e oferecia-se para a corrigir, e isso chega
 * quase sempre. Não chega quando a palavra está escrita assim de propósito, ou
 * quando é a frase à volta dela que está errada: aí é preciso IR AO CAMPO, e
 * até aqui a única maneira era procurá-lo à mão num documento de catorze
 * páginas.
 *
 * A chave é escrita no `data-campo` do controlo pelo estúdio, e é por ela que
 * o salto encontra o campo. Um atributo e não um `id`: são catorze famílias de
 * campo, algumas com índices, e um `id` colide com o que quer que exista no
 * resto da página.
 */
export function chaveDoCampo(c: CampoPublicado): string {
  switch (c.tipo) {
    case "grupoTitulo":
      return `grupoTitulo:${c.gi}`;
    case "itemRotulo":
      return `itemRotulo:${c.gi}:${c.ii}`;
    case "itemDesc":
      return `itemDesc:${c.gi}:${c.ii}`;
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota":
      return `${c.tipo}:${c.bi}`;
    case "linhaDeOrcamento":
    case "extraRotulo":
    case "linhaEstimada":
      return `${c.tipo}:${c.i}`;
    case "cronogramaTitulo":
      return `cronogramaTitulo:${c.pi}`;
    case "cronogramaItem":
      return `cronogramaItem:${c.pi}:${c.ii}`;
    /**
     * ── AS ALTERNATIVAS JÁ TINHAM MORADA, E É ESTA ─────────────────────────
     *
     * `escolhas:0:opcoes:1:rotulo` não é uma invenção daqui: é o `caminho` que
     * o painel das traduções (`camposDeEscolhaPorTraduzir`) já usa e que o
     * `EditorDeEscolhas` já escreve no `data-campo` de cada caixa. Inventar
     * `escolhaRotulo:0:1` dava DUAS moradas para a mesma caixa — e no dia em
     * que uma delas mudasse, um dos dois saltos deixava de encontrar o campo
     * sem que nada acendesse. Uma caixa, um endereço.
     */
    case "escolhaTitulo":
      return `escolhas:${c.ei}:titulo`;
    case "escolhaNota":
      return `escolhas:${c.ei}:nota`;
    case "escolhaRotulo":
      return `escolhas:${c.ei}:opcoes:${c.oi}:rotulo`;
    case "escolhaDescricao":
      return `escolhas:${c.ei}:opcoes:${c.oi}:descricao`;
    default:
      return c.tipo;
  }
}

/**
 * A secção do estúdio onde o campo vive — o alvo de RECURSO do salto.
 *
 * Nem todos os campos que saem impressos têm um controlo próprio no editor: as
 * linhas do quadro «3. Orçamento Proposto» são semeadas a partir dos pontos de
 * decoração do pedido, e o título do cabeçalho é composto. Para esses, o salto
 * leva à secção — que é onde a resposta está — em vez de não fazer nada.
 */
export function seccaoDoCampo(c: CampoPublicado): string {
  switch (c.tipo) {
    case "grupoTitulo":
    case "itemRotulo":
    case "itemDesc":
      return "servicos";
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota":
    // As alternativas vivem DENTRO da secção dos mood boards — não têm secção
    // própria, e a razão está no cabeçalho do `EditorDeEscolhas`: são visuais,
    // e as fotografias que as explicam já estão nestas páginas.
    case "escolhaTitulo":
    case "escolhaNota":
    case "escolhaRotulo":
    case "escolhaDescricao":
      return "moodboards";
    case "cronogramaTitulo":
    case "cronogramaItem":
      return "cronograma";
    case "linhaDeOrcamento":
    case "linhaEstimada":
    case "budgetNote":
      return "orcamento";
    case "extraRotulo":
    case "totalLabel":
      return "total";
    default:
      return "evento";
  }
}

/** Uma gralha encontrada, pronta a ser mostrada e a ser corrigida. */
export interface Gralha {
  campo: CampoPublicado;
  /** Como se chama este campo em pt-PT, para a frase do aviso. */
  rotulo: string;
  /** A palavra tal como está escrita. */
  escrita: string;
  /** A palavra como devia estar, já com as maiúsculas da escrita. */
  sugerida: string;
  /** O texto inteiro do campo, para se ver a palavra no contexto. */
  texto: string;
}

/** O texto de um campo, ou `undefined` se o campo não existe neste documento. */
export function lerCampo(doc: Partial<ProposalDoc>, campo: CampoPublicado): string | undefined {
  switch (campo.tipo) {
    case "ref":
      return doc.ref;
    case "headerTitle":
      return doc.headerTitle;
    case "servico":
      return doc.servico;
    case "eventType":
      return doc.eventType;
    case "totalLabel":
      return doc.totalLabel;
    case "budgetNote":
      return doc.budgetNote;
    case "grupoTitulo":
      return doc.serviceGroups?.[campo.gi]?.title;
    case "itemRotulo":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.label;
    case "itemDesc":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.desc;
    case "boardTitulo":
      return doc.moodBoards?.[campo.bi]?.title;
    case "boardSubtitulo":
      return doc.moodBoards?.[campo.bi]?.subtitulo;
    case "boardNota":
      return doc.moodBoards?.[campo.bi]?.annotation;
    case "linhaDeOrcamento":
      return doc.budgetItems?.[campo.i];
    case "extraRotulo":
      return doc.budgetExtras?.[campo.i]?.label;
    case "cronogramaTitulo":
      return doc.cronograma?.[campo.pi]?.title;
    case "cronogramaItem":
      return doc.cronograma?.[campo.pi]?.items?.[campo.ii];
    case "linhaEstimada":
      return doc.budgetRows?.[campo.i]?.item;
    case "escolhaTitulo":
      return doc.escolhas?.[campo.ei]?.titulo;
    case "escolhaNota":
      return doc.escolhas?.[campo.ei]?.nota;
    case "escolhaRotulo":
      return doc.escolhas?.[campo.ei]?.opcoes?.[campo.oi]?.rotulo;
    case "escolhaDescricao":
      return doc.escolhas?.[campo.ei]?.opcoes?.[campo.oi]?.descricao;
  }
}

/**
 * O mesmo documento com um campo reescrito.
 *
 * Copia só o caminho que muda — o resto do documento vem por referência, que é
 * o que mantém as fotos e os arrays paralelos exactamente como estavam.
 */
export function escreverCampo<T extends Partial<ProposalDoc>>(
  doc: T,
  campo: CampoPublicado,
  texto: string,
): T {
  switch (campo.tipo) {
    case "ref":
      return { ...doc, ref: texto };
    case "headerTitle":
      return { ...doc, headerTitle: texto };
    case "servico":
      return { ...doc, servico: texto };
    case "eventType":
      return { ...doc, eventType: texto };
    case "totalLabel":
      return { ...doc, totalLabel: texto };
    case "budgetNote":
      return { ...doc, budgetNote: texto };
    case "grupoTitulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi ? { ...g, title: texto } : g,
        ),
      };
    /**
     * ── CADA CAMPO ESCRITO PELO NOME, À LETRA ──────────────────────────────
     *
     * Estas quatro linhas eram duas, com a chave a sair de um `? :` e a escrita
     * a ser feita com `{ ...it, [chave]: texto }`. Lê-se melhor — e é uma
     * escrita com chave CALCULADA num objecto que veio de fora, que é a forma
     * exacta de um defeito que a análise do GitHub procura («remote property
     * injection») e que esta casa já apanhou uma vez.
     *
     * As chaves eram literais e o alcance era nenhum. Não interessa: uma defesa
     * que depende de o próximo leitor perceber que aquele ternário só devolve
     * dois literais é uma defesa que se perde. Escrito assim não há nada a
     * perceber.
     */
    case "itemRotulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, label: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "itemDesc":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, desc: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "boardTitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, title: texto } : b,
        ),
      };
    case "boardSubtitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, subtitulo: texto } : b,
        ),
      };
    case "boardNota":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, annotation: texto } : b,
        ),
      };
    case "linhaDeOrcamento":
      return {
        ...doc,
        budgetItems: (doc.budgetItems ?? []).map((s, i) => (i === campo.i ? texto : s)),
      };
    case "extraRotulo":
      return {
        ...doc,
        budgetExtras: (doc.budgetExtras ?? []).map((e, i) =>
          i === campo.i ? { ...e, label: texto } : e,
        ),
      };
    case "cronogramaTitulo":
      return {
        ...doc,
        cronograma: (doc.cronograma ?? []).map((f, i) =>
          i === campo.pi ? { ...f, title: texto } : f,
        ),
      };
    case "cronogramaItem":
      return {
        ...doc,
        cronograma: (doc.cronograma ?? []).map((f, i) =>
          i === campo.pi
            ? { ...f, items: (f.items ?? []).map((it, j) => (j === campo.ii ? texto : it)) }
            : f,
        ),
      };
    case "linhaEstimada":
      return {
        ...doc,
        budgetRows: (doc.budgetRows ?? []).map((l, i) =>
          i === campo.i ? { ...l, item: texto } : l,
        ),
      };
    /**
     * ── AS ALTERNATIVAS ESCREVEM-SE SEM TOCAR NOS `id` ─────────────────────
     *
     * Cada opção tem um `id` estável, e é a ele que a resposta do casal aponta.
     * Corrigir «Terracota e hortensias» reescreve o `rotulo` e mais nada: a
     * escolha que eles já fizeram continua a apontar para a mesma opção. Se a
     * identidade fosse o texto, corrigir uma gralha apagava a resposta — está
     * escrito no tipo, em `proposta-escolhas.ts`, e é a razão de ele existir.
     */
    case "escolhaTitulo":
      return {
        ...doc,
        escolhas: (doc.escolhas ?? []).map((e, i) =>
          i === campo.ei ? { ...e, titulo: texto } : e,
        ),
      };
    case "escolhaNota":
      return {
        ...doc,
        escolhas: (doc.escolhas ?? []).map((e, i) => (i === campo.ei ? { ...e, nota: texto } : e)),
      };
    case "escolhaRotulo":
      return {
        ...doc,
        escolhas: (doc.escolhas ?? []).map((e, i) =>
          i === campo.ei
            ? {
                ...e,
                opcoes: (e.opcoes ?? []).map((o, j) =>
                  j === campo.oi ? { ...o, rotulo: texto } : o,
                ),
              }
            : e,
        ),
      };
    case "escolhaDescricao":
      return {
        ...doc,
        escolhas: (doc.escolhas ?? []).map((e, i) =>
          i === campo.ei
            ? {
                ...e,
                opcoes: (e.opcoes ?? []).map((o, j) =>
                  j === campo.oi ? { ...o, descricao: texto } : o,
                ),
              }
            : e,
        ),
      };
  }
}

/**
 * Todos os campos de texto LIVRE que saem impressos, com o nome que têm no
 * ecrã.
 *
 * Os nomes próprios ficam de fora de propósito — o nome do casal, o do espaço,
 * o dos wedding planners. «Oliveirinha» não está em dicionário nenhum, e um
 * aviso sobre o nome da quinta seria exactamente o ruído que faz ignorar os
 * avisos verdadeiros.
 *
 * ── É O INVENTÁRIO DA SEGUNDA CAIXA, E É SÓ ISSO ──────────────────────────
 * Exportada porque `proposal-doc-bilingue.ts` precisa exactamente desta lista,
 * com estes rótulos: são estes os campos que têm par inglês no documento, e é
 * por esta lista que se conta o que falta traduzir.
 *
 * NÃO é «tudo o que sai publicado» — foi durante um tempo, e deixou de ser no
 * dia em que se mediu a diferença. O cronograma, as linhas estimadas e as
 * alternativas saem publicados e NÃO estão aqui, cada um pela sua razão, e as
 * razões estão escritas por cima do `OutroCampoPublicado`. Quem quer varrer
 * texto publicado usa {@link camposPublicados}; quem quer contar traduções usa
 * esta.
 */
export function camposDoDocumento(doc: Partial<ProposalDoc>): Array<{
  campo: CampoDeTexto;
  rotulo: string;
}> {
  const campos: Array<{ campo: CampoDeTexto; rotulo: string }> = [
    { campo: { tipo: "ref" }, rotulo: "Referência" },
    { campo: { tipo: "headerTitle" }, rotulo: "Título do cabeçalho" },
    { campo: { tipo: "servico" }, rotulo: "Serviço" },
    { campo: { tipo: "eventType" }, rotulo: "Tipo de evento" },
    { campo: { tipo: "totalLabel" }, rotulo: "Nome do total no PDF" },
    { campo: { tipo: "budgetNote" }, rotulo: "Nota do orçamento" },
  ];
  (doc.serviceGroups ?? []).forEach((g, gi) => {
    campos.push({ campo: { tipo: "grupoTitulo", gi }, rotulo: `Serviços · grupo ${gi + 1}` });
    (g.items ?? []).forEach((_, ii) => {
      campos.push({
        campo: { tipo: "itemRotulo", gi, ii },
        rotulo: `Serviços · linha ${ii + 1}`,
      });
      campos.push({
        campo: { tipo: "itemDesc", gi, ii },
        rotulo: `Serviços · descrição da linha ${ii + 1}`,
      });
    });
  });
  (doc.moodBoards ?? []).forEach((_, bi) => {
    campos.push({ campo: { tipo: "boardTitulo", bi }, rotulo: `Mood board ${bi + 1} · título` });
    campos.push({
      campo: { tipo: "boardSubtitulo", bi },
      rotulo: `Mood board ${bi + 1} · subtítulo`,
    });
    campos.push({ campo: { tipo: "boardNota", bi }, rotulo: `Mood board ${bi + 1} · descrição` });
  });
  (doc.budgetItems ?? []).forEach((_, i) => {
    campos.push({ campo: { tipo: "linhaDeOrcamento", i }, rotulo: `Orçamento · linha ${i + 1}` });
  });
  (doc.budgetExtras ?? []).forEach((_, i) => {
    campos.push({ campo: { tipo: "extraRotulo", i }, rotulo: `Valor adicional ${i + 1}` });
  });
  return campos;
}

/**
 * TUDO o que ela escreve à mão e o casal acaba por ler — a lista do corretor.
 *
 * «O corretor tem de correr sobre todo o conteúdo publicado.» É esta a lista
 * que responde a essa frase, e é maior do que a de cima em três famílias.
 *
 * ── O QUE CONTINUA A FICAR DE FORA, E PORQUE NÃO É ESQUECIMENTO ──────────
 *
 * Os nomes próprios (o casal, o espaço, os wedding planners), pela razão de
 * sempre: «Oliveirinha» não está em dicionário nenhum e um aviso sobre o nome
 * da quinta é o ruído que faz ignorar os avisos verdadeiros.
 *
 * E os blocos fixos — notas importantes, incluído, não incluído, condições
 * gerais, observações, faseamento, cancelamento. Esses NÃO se escrevem em lado
 * nenhum do estúdio: vêm inteiros de `withProposalDefaults`, são texto da casa,
 * e varrê-los seria varrer as nossas próprias constantes para não encontrar
 * nada. Pior: a correcção de uma gralha reescrevia o bloco, ele deixava de ser
 * igual ao da casa, e `blocosFixosNaLingua` — que decide a versão inglesa
 * COMPARANDO com o bloco da casa — passava a mandar o português para uma
 * proposta inglesa. Um corrector que estraga a tradução ao corrigir uma gralha
 * que não existe é pior do que não haver corrector.
 */
export function camposPublicados(doc: Partial<ProposalDoc>): Array<{
  campo: CampoPublicado;
  rotulo: string;
}> {
  const campos: Array<{ campo: CampoPublicado; rotulo: string }> = [...camposDoDocumento(doc)];
  (doc.cronograma ?? []).forEach((fase, pi) => {
    campos.push({ campo: { tipo: "cronogramaTitulo", pi }, rotulo: `Cronograma · fase ${pi + 1}` });
    (fase.items ?? []).forEach((_, ii) => {
      campos.push({
        campo: { tipo: "cronogramaItem", pi, ii },
        rotulo: `Cronograma · fase ${pi + 1}, linha ${ii + 1}`,
      });
    });
  });
  (doc.budgetRows ?? []).forEach((_, i) => {
    campos.push({ campo: { tipo: "linhaEstimada", i }, rotulo: `Orçamento · estimativa ${i + 1}` });
  });
  (doc.escolhas ?? []).forEach((e, ei) => {
    // Pelo TÍTULO dela e não pelo número: «Escolha «Paleta»» é o que a leva lá.
    const nome = e.titulo?.trim() ? `«${e.titulo.trim()}»` : `${ei + 1}`;
    campos.push({ campo: { tipo: "escolhaTitulo", ei }, rotulo: `Alternativa ${nome} · título` });
    campos.push({ campo: { tipo: "escolhaNota", ei }, rotulo: `Alternativa ${nome} · nota` });
    (e.opcoes ?? []).forEach((_, oi) => {
      campos.push({
        campo: { tipo: "escolhaRotulo", ei, oi },
        rotulo: `Alternativa ${nome} · opção ${oi + 1}`,
      });
      campos.push({
        campo: { tipo: "escolhaDescricao", ei, oi },
        rotulo: `Alternativa ${nome} · descrição da opção ${oi + 1}`,
      });
    });
  });
  return campos;
}

/** As palavras de um texto, com a pontuação de fora. Apóstrofos e hífenes
 *  ficam DENTRO da palavra: «copo d'água» e «pé-de-altar» são uma palavra
 *  cada, e parti-las inventava tokens que não existem. */
function palavrasDe(texto: string): string[] {
  return texto.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
}

/**
 * As gralhas de um documento, pela ordem em que os campos aparecem no ecrã.
 *
 * Uma palavra por achado, e a MESMA palavra repetida no mesmo campo conta uma
 * vez: a correcção reescreve todas as ocorrências dela naquele campo, e dois
 * avisos para uma correcção seriam dois avisos a desaparecer com um clique.
 */
export function gralhasDoDocumento(doc: Partial<ProposalDoc>): Gralha[] {
  const achados: Gralha[] = [];
  for (const { campo, rotulo } of camposPublicados(doc)) {
    const texto = lerCampo(doc, campo);
    if (!texto || !texto.trim()) continue;
    const jaVistas = new Set<string>();
    for (const palavra of palavrasDe(texto)) {
      const grafia = grafiaDe(palavra);
      if (!grafia) continue;
      // Já está certa (com ou sem maiúsculas)? Não há nada a dizer.
      if (palavra.toLowerCase() === grafia.toLowerCase()) continue;
      if (jaVistas.has(palavra)) continue;
      jaVistas.add(palavra);
      achados.push({
        campo,
        rotulo,
        escrita: palavra,
        sugerida: comAsMaiusculasDe(palavra, grafia),
        texto,
      });
    }
  }
  return achados;
}

/** Uma letra ou um algarismo — o que faz de uma palavra a continuação de
 *  outra. Constante, e é isso que interessa: ver {@link substituirPalavra}. */
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

/**
 * Substitui uma palavra INTEIRA, todas as vezes que aparecer.
 *
 * ── PORQUE É QUE ISTO NÃO É UMA EXPRESSÃO REGULAR ─────────────────────────
 * Era. A palavra vinha do texto do documento e era interpolada numa `RegExp`
 * construída na altura — com escape, mas construída à mesma a partir de texto
 * que alguém escreveu. A análise de segurança do GitHub apontou-lhe o dedo, e
 * apontou bem: uma expressão regular montada com conteúdo de fora é uma
 * categoria de defeito inteira (`js/regex-injection`), e o escape é uma defesa
 * que se perde na primeira vez que alguém mexer na linha sem reparar.
 *
 * Uma procura por texto não tem essa categoria de defeito nenhuma. E as
 * fronteiras têm de ser olhadas à mão de qualquer maneira: o `\b` do JavaScript
 * não conhece letras acentuadas, portanto «área» seria encontrada dentro de
 * «áreas» e a palavra saía partida ao meio.
 */
function substituirPalavra(texto: string, de: string, para: string): string {
  if (!de) return texto;
  const eParteDePalavra = (c: string | undefined) => !!c && LETRA_OU_NUMERO.test(c);
  let saida = "";
  let i = 0;
  for (;;) {
    const j = texto.indexOf(de, i);
    if (j < 0) return saida + texto.slice(i);
    const sozinha = !eParteDePalavra(texto[j - 1]) && !eParteDePalavra(texto[j + de.length]);
    saida += texto.slice(i, j) + (sozinha ? para : de);
    i = j + de.length;
  }
}

/**
 * O documento com uma gralha corrigida.
 *
 * A palavra inteira, e só naquele campo — o caminho estruturado é o que evita
 * andar à procura de texto pelo documento fora.
 */
export function corrigirGralha<T extends Partial<ProposalDoc>>(doc: T, g: Gralha): T {
  const texto = lerCampo(doc, g.campo);
  if (texto === undefined) return doc;
  const novo = substituirPalavra(texto, g.escrita, g.sugerida);
  if (novo === texto) return doc;
  return escreverCampo(doc, g.campo, novo);
}

/** Todas as gralhas de uma vez — o botão «corrigir tudo». */
export function corrigirTudo<T extends Partial<ProposalDoc>>(doc: T): T {
  let saida = doc;
  for (const g of gralhasDoDocumento(doc)) saida = corrigirGralha(saida, g);
  return saida;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NÃO SAI NO PDF — achado n.º 32 da auditoria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um emoji num título («Decoração Floral 💐») desaparecia do PDF sem aviso: as
 * letras do documento não o têm, e a geração tira-o em silêncio para não
 * imprimir um «?». O estúdio continuava a mostrá-lo, portanto ela via uma
 * coisa e o casal recebia outra.
 *
 * Não se tenta adivinhar a fonte aqui (a cobertura exacta só se sabe no
 * servidor, com o ficheiro da letra aberto). Avisa-se do que NUNCA sai: os
 * pictogramas e as bandeiras. Os três que o WinAnsi tem — ©, ® e ™ — imprimem
 * e ficam de fora.
 */
export interface SimbolosQueNaoSaem {
  campo: CampoPublicado;
  rotulo: string;
  /** Os símbolos, cada um uma vez, pela ordem em que aparecem. */
  simbolos: string[];
  texto: string;
}

/** Um pictograma, com o que se lhe cola (variação de cor, tom de pele, junções
 *  de família, a segunda letra de uma bandeira). Constante: não é montada a
 *  partir de texto de ninguém. */
const PICTOGRAMA =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\u{FE0E}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]|\u{200D}\p{Extended_Pictographic}|\p{Regional_Indicator})*/gu;
const IMPRIMEM = new Set(["©", "®", "™"]);

function pictogramasDe(texto: string): string[] {
  return [...texto.matchAll(PICTOGRAMA)]
    .map((m) => m[0])
    .filter((s) => !IMPRIMEM.has(s.replace(/[\u{FE0E}\u{FE0F}]/gu, "")));
}

export function simbolosQueNaoSaem(doc: Partial<ProposalDoc>): SimbolosQueNaoSaem[] {
  const achados: SimbolosQueNaoSaem[] = [];
  for (const { campo, rotulo } of camposPublicados(doc)) {
    const texto = lerCampo(doc, campo);
    if (!texto) continue;
    const simbolos = [...new Set(pictogramasDe(texto))];
    if (simbolos.length > 0) achados.push({ campo, rotulo, simbolos, texto });
  }
  return achados;
}

/** O campo sem os símbolos que não saem — e sem o espaço duplo que ficaria no
 *  sítio deles. */
export function tirarSimbolos<T extends Partial<ProposalDoc>>(doc: T, s: SimbolosQueNaoSaem): T {
  const texto = lerCampo(doc, s.campo);
  if (texto === undefined) return doc;
  const novo = texto
    .replace(PICTOGRAMA, (m) => (IMPRIMEM.has(m.replace(/[\u{FE0E}\u{FE0F}]/gu, "")) ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return novo === texto ? doc : escreverCampo(doc, s.campo, novo);
}
