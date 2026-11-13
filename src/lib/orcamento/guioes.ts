import type { TimelineItem } from "./types";
import {
  analisarODia,
  BURACO_MINIMO_MIN,
  chaveDoResponsavel,
  duracaoDe,
  estaNoDia,
  porExtenso,
  type AnaliseDoDia,
} from "./guiao-do-dia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS GUIÕES TODOS, E NÃO UM DE CADA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `guiao-do-dia.ts` responde a «isto cabe?» sobre UM dia. Este ficheiro
 * responde à pergunta de cima, que é outra e é a da segunda-feira de manhã:
 * **«dos eventos que aí vêm, quais é que já têm guião e quais é que têm um
 * problema?»**
 *
 * Até aqui não havia forma de a fazer. O guião vivia dentro da zona de produção
 * de um evento; para saber se o casamento de daqui a três semanas tinha guião
 * era preciso abrir o pedido, descer até à Produção e ver. Vinte eventos, vinte
 * aberturas — e a resposta esquecia-se pelo caminho.
 *
 * Como o resto do motor: funções puras, sem React e sem relógio próprio. O
 * relógio entra por argumento (`agora`), para se poder pôr à prova um Sábado
 * de Junho sem esperar por ele.
 */

/**
 * Um evento com o seu guião, como a lista o precisa.
 *
 * É o que a rota `/api/guioes` devolve por evento — e traz os MOMENTOS, não um
 * resumo já cozinhado. A conta faz-se no cliente pela mesma razão por que o
 * `EventTimeline` a faz: é a MESMA função (`analisarODia`), e um resumo
 * calculado no servidor era uma segunda implementação da mesma pergunta, a
 * divergir em silêncio no dia em que uma das duas fosse afinada.
 *
 * O custo é o tamanho: uns 60 bytes por momento, uma dúzia de momentos por
 * evento. Trinta eventos dão ~20 KB — menos do que a lista de pedidos que o
 * back office já carrega.
 */
export interface ResumoDeGuiao {
  /** O id do pedido — é por ele que se abre o guião e se imprime a folha. */
  id: string;
  /** O nome do cliente. */
  cliente: string;
  /** A etiqueta do evento («Casamento», «Batizado da Matilde»). */
  evento: string;
  /** «aaaa-mm-dd». Um evento sem data não entra nesta lista — ver `ordenarGuioes`. */
  data: string;
  local: string;
  /**
   * Se a proposta deste evento já foi dada como aceite.
   *
   * É por ele que a lista mostra, por omissão, só o que já é trabalho — e é
   * por ele que ela pode escolher ver o resto. Ver a nota longa na rota.
   */
  aceite: boolean;
  momentos: TimelineItem[];
  /**
   * O mapa de mesas do evento, em números — `null` quando ainda não há mapa.
   * Opcional porque só o `/api/guioes` o calcula; quem monta resumos à mão
   * (testes, o Guiões) não precisa dele.
   */
  mesas?: { mesas: number; sentados: number; pessoas: number } | null;
}

/**
 * O que há a dizer sobre um guião, num relance.
 *
 * ── PORQUE É QUE ISTO É UMA LISTA E NÃO UM ESTADO ─────────────────────────
 *
 * A primeira versão devolvia um estado só — «tem guião», «tem buracos», «tem
 * sobreposições» — e obrigava a escolher qual deles ganhava quando um guião
 * tinha as três coisas. Escolher é perder: um dia com um choque de responsável
 * E três horas por marcar tem dois problemas, e o segundo não desaparece por o
 * primeiro ser mais grave.
 *
 * Cada sinal traz a CONTAGEM e a FRASE. A contagem é o que o ecrã põe na
 * pastilha; a frase é o nome acessível dela, porque uma pastilha que diga só
 * «2» não diz nada a quem ouve o ecrã — e porque a regra desta casa é que a cor
 * nunca é o único portador de significado.
 */
export type TipoDeSinal =
  | "sem-guiao"
  | "choque"
  | "sobreposicao"
  | "buraco"
  | "sem-duracao"
  | "pronto";

export interface SinalDoGuiao {
  tipo: TipoDeSinal;
  /** Quantos. Um em `sem-guiao` e em `pronto`, que não se contam. */
  quantos: number;
  /** A frase inteira, para o nome acessível e para quem lê a lista ao telefone. */
  frase: string;
}

/**
 * A gravidade, para a lista poder pôr à frente o que arde.
 *
 * Três degraus e não cinco: um choque de responsável é um ERRO que chega ao dia
 * do evento com duas pessoas à espera uma da outra; um buraco ou um guião por
 * fazer é trabalho por acabar; o resto é informação. Pintar tudo com a mesma
 * urgência era ensiná-la a ignorar a urgência.
 */
export type Gravidade = "erro" | "por-fazer" | "informacao";

export const GRAVIDADE_DO_SINAL: Record<TipoDeSinal, Gravidade> = {
  choque: "erro",
  "sem-guiao": "por-fazer",
  buraco: "por-fazer",
  "sem-duracao": "por-fazer",
  sobreposicao: "informacao",
  pronto: "informacao",
};

const ORDEM_DA_GRAVIDADE: Record<Gravidade, number> = {
  erro: 0,
  "por-fazer": 1,
  informacao: 2,
};

/**
 * Os sinais de um guião, do mais grave para o menos.
 *
 * ── E OS BURACOS INCERTOS NÃO CONTAM, PELA MESMA RAZÃO DE SEMPRE ─────────
 *
 * Uma sobra a seguir a um momento SEM duração tanto pode ser tempo livre como
 * pode ser a montagem a decorrer sem ninguém lhe ter dito quanto tempo leva. O
 * `EventTimeline` já se recusa a chamar-lhe buraco (ver `buracosCertos` lá), e
 * esta lista tem de dizer o mesmo sobre o mesmo dia: uma pastilha «3 buracos»
 * numa lista, ao lado de um ecrã que não nomeia buraco nenhum, é o ecrã a
 * discordar de si próprio.
 *
 * O que os incertos dão é o sinal `sem-duracao`, que diz a verdade: o dia ainda
 * não tem forma, e é por isso que não se pode afirmar mais nada.
 */
export function sinaisDoGuiao(momentos: readonly TimelineItem[]): SinalDoGuiao[] {
  if (momentos.length === 0) {
    return [{ tipo: "sem-guiao", quantos: 1, frase: "Sem timeline" }];
  }

  const dia = analisarODia(momentos);
  const buracosCertos = dia.buracos.filter((b) => !b.anteriorSemDuracao);
  const semDuracao = momentos.filter((i) => duracaoDe(i) === 0);

  const sinais: SinalDoGuiao[] = [];

  if (dia.choques.length > 0) {
    sinais.push({
      tipo: "choque",
      quantos: dia.choques.length,
      frase:
        dia.choques.length === 1
          ? "Uma pessoa em dois sítios ao mesmo tempo"
          : `${dia.choques.length} momentos com a mesma pessoa em dois sítios ao mesmo tempo`,
    });
  }
  if (buracosCertos.length > 0) {
    const maior = Math.max(...buracosCertos.map((b) => b.minutos));
    sinais.push({
      tipo: "buraco",
      quantos: buracosCertos.length,
      frase:
        buracosCertos.length === 1
          ? `${porExtenso(maior)} sem nada marcado`
          : `${buracosCertos.length} vazios, o maior de ${porExtenso(maior)}`,
    });
  }
  if (semDuracao.length > 0) {
    sinais.push({
      tipo: "sem-duracao",
      quantos: semDuracao.length,
      frase:
        semDuracao.length === momentos.length
          ? "Nenhum momento tem duração — o dia ainda não tem forma"
          : `${semDuracao.length} ${semDuracao.length === 1 ? "momento" : "momentos"} sem duração`,
    });
  }
  if (dia.sobreposicoes.length > 0) {
    sinais.push({
      tipo: "sobreposicao",
      quantos: dia.sobreposicoes.length,
      frase:
        dia.sobreposicoes.length === 1
          ? "Duas coisas ao mesmo tempo, com pessoas diferentes"
          : `${dia.sobreposicoes.length} pares a correr ao mesmo tempo, com pessoas diferentes`,
    });
  }

  if (sinais.length === 0) {
    sinais.push({
      tipo: "pronto",
      quantos: 1,
      frase: `Timeline pronta — ${momentos.length} ${momentos.length === 1 ? "momento" : "momentos"}`,
    });
  }

  return sinais.sort(
    (a, b) =>
      ORDEM_DA_GRAVIDADE[GRAVIDADE_DO_SINAL[a.tipo]] -
      ORDEM_DA_GRAVIDADE[GRAVIDADE_DO_SINAL[b.tipo]],
  );
}

/** O sinal que manda — o mais grave. Nunca é `undefined`: há sempre um. */
export function sinalPrincipal(sinais: readonly SinalDoGuiao[]): SinalDoGuiao {
  return sinais[0] ?? { tipo: "sem-guiao", quantos: 1, frase: "Sem timeline" };
}

/** Um guião com a sua leitura já feita — o que a lista desenha. */
export interface GuiaoNaLista extends ResumoDeGuiao {
  dia: AnaliseDoDia;
  sinais: SinalDoGuiao[];
  /** Dias até ao evento. Negativo depois de ele passar, zero no próprio dia. */
  faltamDias: number;
  /** O guião está a correr AGORA (o dia do evento, ou a madrugada seguinte). */
  hoje: boolean;
}

/** «aaaa-mm-dd» de uma data local — a mesma forma com que os eventos são gravados. */
export function diaDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Dias inteiros entre duas datas «aaaa-mm-dd». Positivo quando `ate` é no futuro. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T12:00:00`);
  const b = Date.parse(`${ate}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Os guiões pela ordem em que ela precisa deles.
 *
 * **Os que aí vêm primeiro, do mais próximo para o mais longe; os que já
 * passaram no fim, do mais recente para o mais antigo.**
 *
 * Não é a ordem de uma agenda, que seria cronológica de ponta a ponta e punha
 * o casamento de 2024 no topo. É a ordem do TRABALHO: o que se prepara está à
 * frente, e o que já aconteceu fica atrás mas não desaparece — a folha do dia
 * de um evento passado ainda se imprime, e o guião do ano passado é a melhor
 * matéria-prima para um modelo.
 *
 * O próprio dia do evento conta como futuro (`faltamDias === 0`), e conta até
 * ao fim: é precisamente durante o evento que este ecrã mais serve.
 */
export function ordenarGuioes(guioes: readonly ResumoDeGuiao[], agora: Date): GuiaoNaLista[] {
  const hoje = diaDe(agora);
  const preparados = guioes
    .filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.data))
    .map((g): GuiaoNaLista => {
      const momentos = g.momentos ?? [];
      return {
        ...g,
        momentos,
        dia: analisarODia(momentos),
        sinais: sinaisDoGuiao(momentos),
        faltamDias: diasEntre(hoje, g.data),
        hoje: estaNoDia(g.data, agora),
      };
    });

  const futuros = preparados
    .filter((g) => g.faltamDias >= 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  const passados = preparados
    .filter((g) => g.faltamDias < 0)
    .sort((a, b) => b.data.localeCompare(a.data));
  return [...futuros, ...passados];
}

/**
 * ── A JANELA COMUM: PORQUE É QUE AS RÉGUAS DA LISTA PARTILHAM A ESCALA ────
 *
 * Cada linha da lista traz uma régua do dia em miniatura. Se cada uma tivesse
 * a sua própria escala — do seu início ao seu fim —, todas mediriam o mesmo
 * comprimento e a comparação entre elas seria FALSA: um evento de quatro horas
 * desenhava-se tão largo como um de dezanove, e a lista deixava de responder à
 * pergunta que a faz existir («qual destes dias está cheio?»).
 *
 * Com uma janela comum, o dia mais longo enche a régua e os outros ficam
 * proporcionalmente mais curtos — que é o que os olhos leem sem legenda
 * nenhuma.
 *
 * O chão de doze horas existe para o caso de a lista ter um evento só, e curto:
 * sem ele, um único almoço de três horas enchia a régua de bordo a bordo e
 * parecia um dia inteiro ocupado.
 */
export const JANELA_MINIMA_MIN = 12 * 60;

export interface JanelaDoDia {
  inicio: number;
  fim: number;
}

export function janelaComum(guioes: readonly { dia: AnaliseDoDia }[]): JanelaDoDia {
  const comForma = guioes.filter((g) => g.dia.inicio !== null && g.dia.fim !== null);
  if (comForma.length === 0) return { inicio: 8 * 60, fim: 8 * 60 + JANELA_MINIMA_MIN };
  const inicio = Math.min(...comForma.map((g) => g.dia.inicio as number));
  const fimBruto = Math.max(...comForma.map((g) => g.dia.fim as number));
  return { inicio, fim: Math.max(fimBruto, inicio + JANELA_MINIMA_MIN) };
}

/**
 * Onde um minuto cai dentro da janela, de 0 a 1.
 *
 * Presa aos limites: um momento fora da janela (não acontece com a
 * `janelaComum`, acontece com uma janela fixa) desenhava-se fora da régua e
 * saía do cartão.
 */
export function fracaoNaJanela(minuto: number, janela: JanelaDoDia): number {
  const largura = janela.fim - janela.inicio;
  if (largura <= 0) return 0;
  return Math.min(1, Math.max(0, (minuto - janela.inicio) / largura));
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CARRIS — É ASSIM QUE UMA SOBREPOSIÇÃO SE VÊ EM VEZ DE SE LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Numa régua horizontal, dois momentos que corram ao mesmo tempo ocupam o mesmo
 * intervalo de píxeis. Desenhados no mesmo carril, o segundo tapa o primeiro e
 * a régua MENTE: mostra um dia limpo onde há duas coisas em cima uma da outra.
 * Era exactamente o defeito que a régua existe para não ter — o pedido diz que
 * «os buracos e as sobreposições vêem-se na régua, não só num aviso de texto».
 *
 * A regra é a de qualquer calendário: cada bloco vai para o PRIMEIRO carril
 * onde já não bate em nada. Um dia sem sobreposições fica com um carril só (uma
 * fita fina); um dia com a montagem e o catering em paralelo abre um segundo,
 * e a altura da régua diz, sem uma palavra, que ali há duas coisas a acontecer.
 *
 * Guloso e por ordem de início — que é o algoritmo certo para intervalos e não
 * uma aproximação: com os blocos ordenados, o número de carris que ele usa é o
 * máximo de blocos simultâneos, que é o mínimo possível.
 *
 * Os momentos SEM hora ficam de fora: não têm sítio na régua, e inventar-lhes
 * um era desenhá-los às 00:00.
 */
export interface BlocoEmCarril {
  bloco: { inicio: number; fim: number; duracao: number; item: TimelineItem };
  carril: number;
}

export function emCarris(
  blocos: readonly {
    inicio: number;
    fim: number;
    duracao: number;
    temHora: boolean;
    item: TimelineItem;
  }[],
): { blocos: BlocoEmCarril[]; carris: number } {
  const comForma = blocos.filter((b) => b.temHora).sort((a, b) => a.inicio - b.inicio);
  /** Onde acaba o último bloco de cada carril. */
  const fins: number[] = [];
  const postos: BlocoEmCarril[] = [];

  for (const b of comForma) {
    // Um instante mede zero e caberia sempre no carril de cima, por cima do
    // bloco que o contém. Dá-se-lhe um minuto de largura só para esta decisão:
    // é o mesmo minuto que o `oQueVemASeguir` lhe dá para ele poder «estar a
    // decorrer», e é o que faz um brinde no meio do jantar abrir um carril em
    // vez de desaparecer dentro dele.
    const fimParaOCarril = b.duracao === 0 ? b.inicio + 1 : b.fim;
    let carril = fins.findIndex((fim) => fim <= b.inicio);
    if (carril === -1) {
      carril = fins.length;
      fins.push(fimParaOCarril);
    } else {
      fins[carril] = fimParaOCarril;
    }
    postos.push({ bloco: b, carril });
  }

  return { blocos: postos, carris: Math.max(1, fins.length) };
}

/**
 * Os vazios da régua — o tempo entre o fim de tudo o que já passou e o começo
 * do que vem a seguir.
 *
 * É a MESMA fronteira que o `analisarODia` usa para a `RelacaoAnterior` (o
 * ponto mais longe a que o dia chegou, e não o fim do último bloco lido), e tem
 * de ser: um vazio desenhado onde a prosa não nomeia nenhum é o ecrã a
 * discordar de si próprio sobre o mesmo intervalo.
 *
 * Só os vazios que valem a pena dizer (`BURACO_MINIMO_MIN`) e só os CERTOS — o
 * momento anterior tem duração, portanto sabe-se mesmo onde acaba. A régua não
 * afirma com píxeis o que a prosa se recusa a afirmar com palavras.
 */
export function vaziosDaRegua(dia: AnaliseDoDia): { inicio: number; fim: number }[] {
  const vazios: { inicio: number; fim: number }[] = [];
  for (const bloco of dia.blocos) {
    const antes = bloco.antes;
    if (!antes || antes.tipo !== "buraco") continue;
    if (antes.minutos < BURACO_MINIMO_MIN) continue;
    if (duracaoDe(antes.com) === 0) continue;
    vazios.push({ inicio: bloco.inicio - antes.minutos, fim: bloco.inicio });
  }
  return vazios;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COLUNAS DA GRELHA — UMA POR QUEM FAZ, NO MESMO DIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta, nas palavras dela: **«Olhas para as 14:00 e vês, lado a lado, o
 * que cada um está a fazer nesse momento. É a pergunta do dia do evento: quem
 * está onde, e quem está livre para a próxima coisa.»**
 *
 * A régua deitada responde a «este dia está cheio?»; a régua vertical do
 * `EventTimeline` responde a «isto cabe?» e é onde se edita. Nenhuma das duas
 * responde a esta, porque as duas misturam as pessoas na mesma pista: com a Ana
 * e o Rui no mesmo carril, ler «quem está livre às 14:00» obriga a percorrer o
 * dia inteiro a ler nomes. Uma coluna por pessoa transforma essa leitura numa
 * linha horizontal — que é exactamente o que a fotografia do horário
 * universitário faz com as salas.
 *
 * ── A CHAVE É A DO MOTOR, E TEM DE SER ────────────────────────────────────
 *
 * `chaveDoResponsavel` (sem espaços, sem maiúsculas, sem acentos). Com o
 * `owner` em cru, «Ana» e «ana » abriam duas colunas enquanto o motor — que usa
 * a chave — dizia que era a mesma pessoa em dois sítios ao mesmo tempo. O mesmo
 * ecrã a contradizer-se sobre quantas pessoas há no dia.
 *
 * O NOME que se escreve na coluna é a primeira grafia do dia, e não a chave: a
 * chave é para comparar, não para ler — ninguém quer ver «ana silva» no topo de
 * uma coluna onde escreveu «Ana Silva».
 *
 * ── OS CARRIS SÃO OS MESMOS, POR COLUNA ───────────────────────────────────
 *
 * Dentro de uma coluna, duas coisas ao mesmo tempo são — por definição — a
 * MESMA pessoa em dois sítios, que é o erro que o motor já detecta. Postas uma
 * por cima da outra, a segunda tapava a primeira e a grelha escondia
 * precisamente o que existe para mostrar. Vão para carris (`emCarris`, o mesmo
 * do `ReguaDoDia`), lado a lado e mais estreitas — como na fotografia dela.
 *
 * Um INSTANTE dentro de uma montagem também abre carril (o `emCarris` dá-lhe um
 * minuto só para esta decisão) e NÃO é um choque: a intersecção de um ponto com
 * um intervalo mede zero minutos, e é essa linha do motor que faz um guião
 * antigo abrir calado. A grelha herda isso de graça.
 */

/** A chave da coluna dos momentos que ainda não têm responsável. */
export const SEM_RESPONSAVEL = "";

/** O nome escrito no topo dessa coluna. */
export const ROTULO_SEM_RESPONSAVEL = "Sem responsável";

export interface ColunaDeResponsavel {
  /** A chave comparável — `SEM_RESPONSAVEL` na coluna de quem não tem nome. */
  chave: string;
  /** O nome tal como ela o escreveu, na primeira grafia que aparece no dia. */
  nome: string;
  /** Os momentos desta pessoa, cada um no carril que lhe coube. */
  blocos: BlocoEmCarril[];
  /** Quantos carris esta coluna precisa. Nunca menos de um. */
  carris: number;
  /** O minuto a que o dia desta pessoa começa — é por ele que as colunas se ordenam. */
  inicio: number;
}

/**
 * As colunas do dia, pela ordem em que se lêem.
 *
 * ── A ORDEM: QUEM COMEÇA PRIMEIRO FICA À ESQUERDA ─────────────────────────
 *
 * Não é alfabética. A grelha lê-se de cima para baixo (o dia) e da esquerda
 * para a direita (as pessoas), e com as colunas ordenadas pela hora a que cada
 * um entra ao serviço a grelha ganha uma diagonal: quem monta de manhã à
 * esquerda, quem só chega para a cerimónia à direita. Alfabético punha o «Zé da
 * carrinha» das 07:00 no fim e obrigava a procurar o princípio do dia.
 *
 * Empate desfeito pelo nome, para a ordem não depender da ordem de chegada dos
 * dados: duas pessoas que comecem às 09:00 têm de ficar sempre na mesma ordem
 * entre dois carregamentos, senão as colunas trocam de sítio sozinhas.
 *
 * ── E OS MOMENTOS SEM RESPONSÁVEL VÃO PARA O FIM ──────────────────────────
 *
 * Têm coluna PRÓPRIA, e não uma repetição em todas nem uma faixa a atravessar a
 * grelha. Repetir em todas mentia (aquele momento não é de toda a gente); uma
 * faixa de largura inteira dizia que era de toda a gente, que é a mesma mentira
 * deitada. Uma coluna própria diz a verdade e diz-a pela forma: aquela coluna
 * cheia é o trabalho que ainda não tem dono, e a grelha mostra-o sem uma linha
 * de prosa.
 *
 * Fica em ÚLTIMO — e é a decisão que a largura de 390 px obriga a tomar: ao
 * princípio empurrava uma pessoa a sério para fora do primeiro ecrã do
 * telemóvel, e a primeira coluna é a que ela lê sem rolar nada.
 *
 * Os momentos sem hora legível ficam de fora, como no `emCarris`: não têm sítio
 * na régua e inventar-lhes um era desenhá-los às 00:00. Quem chama tem de os
 * contar e dizê-lo — ver a `GrelhaDoDia`.
 */
export function colunasPorResponsavel(
  blocos: readonly {
    inicio: number;
    fim: number;
    duracao: number;
    temHora: boolean;
    item: TimelineItem;
  }[],
): ColunaDeResponsavel[] {
  type Bloco = (typeof blocos)[number];
  const porChave = new Map<string, { nome: string; blocos: Bloco[] }>();

  for (const b of blocos) {
    if (!b.temHora) continue;
    const chave = chaveDoResponsavel(b.item.owner);
    const existente = porChave.get(chave);
    if (existente) {
      existente.blocos.push(b);
      continue;
    }
    porChave.set(chave, {
      nome: chave === SEM_RESPONSAVEL ? ROTULO_SEM_RESPONSAVEL : (b.item.owner ?? "").trim(),
      blocos: [b],
    });
  }

  const colunas: ColunaDeResponsavel[] = [];
  for (const [chave, { nome, blocos: seus }] of porChave) {
    const { blocos: postos, carris } = emCarris(seus);
    colunas.push({
      chave,
      nome,
      blocos: postos,
      carris,
      inicio: Math.min(...seus.map((b) => b.inicio)),
    });
  }

  return colunas.sort((a, b) => {
    if (a.chave === SEM_RESPONSAVEL) return 1;
    if (b.chave === SEM_RESPONSAVEL) return -1;
    if (a.inicio !== b.inicio) return a.inicio - b.inicio;
    return a.nome.localeCompare(b.nome, "pt-PT");
  });
}
