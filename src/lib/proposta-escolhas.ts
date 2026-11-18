import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ESCOLHAS DO CASAL — FASE 3 DA «PROPOSTA VIVA»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, no pedido da página do casal:
 *
 *   «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 *   dois estilos de corredor), eles escolhem ali. A escolha volta ao back
 *   office e aparece na ficha do evento.»
 *
 * ── AS DUAS REGRAS QUE NÃO SE NEGOCEIAM, APLICADAS AQUI ───────────────────
 *
 * **O PDF continua exactamente como está.** As alternativas são de ECRÃ: uma
 * folha A4 não tem como oferecer uma escolha, e imprimir «Opção A / Opção B»
 * num documento que o casal guarda e mostra à família só cria a dúvida de qual
 * das duas é que ficou. As escolhas vivem no documento (para viajarem com a
 * proposta, com as revisões e com as cópias) e o gerador de PDF não as desenha
 * — está declarado em `NUNCA_NO_PDF`, com a mesma nota do `headerTitle`.
 *
 * **Zero rastreio de comportamento.** Uma escolha é uma acção deliberada: o
 * casal carregou numa opção. Grava-se O QUE escolheram e QUANDO — nada sobre
 * quando abriram, quanto tempo estiveram, ou por onde passaram. Não há aqui
 * contador de vistas, nem «viram mas não escolheram»: a ausência de resposta é
 * exactamente isso, e não uma medição.
 *
 * ── ONDE VIVE CADA METADE ─────────────────────────────────────────────────
 *
 * A PERGUNTA vive no documento da proposta (`ProposalDoc.escolhas`): é ela que
 * a escreve, é ela que a revê, e uma revisão que mude as opções é uma proposta
 * nova como qualquer outra.
 *
 * A RESPOSTA vive no PEDIDO (`Quote.escolhasDoCasal`), e não na proposta. A
 * razão é a mesma que faz o link do casal seguir o pedido e não a linha (ver
 * `proposta-do-link.ts`): uma revisão de preço cria uma proposta NOVA, e a
 * escolha da paleta que o casal fez na semana passada não pode desaparecer
 * porque ela mexeu no valor da deslocação. E é no pedido que está a ficha do
 * evento, que é onde ela pediu para a ver.
 *
 * ── O QUE ACONTECE QUANDO A PERGUNTA MUDA POR BAIXO DA RESPOSTA ───────────
 *
 * Ela pode apagar uma opção depois de o casal a ter escolhido. A resposta fica
 * gravada — apagá-la seria perder a única prova de que houve conversa —, mas
 * deixa de ser uma escolha VÁLIDA: `resolverEscolhas` devolve-a marcada como
 * `"opcao-desapareceu"`, para o back office poder dizer «escolheram uma opção
 * que já não existe» em vez de mostrar um espaço em branco que se lê como
 * «ainda não responderam».
 */

/** Uma alternativa dentro de uma escolha. */
export interface OpcaoDeEscolha {
  /**
   * Identificador ESTÁVEL, e é o que faz esta funcionalidade poder existir.
   *
   * A resposta do casal aponta para aqui. Se a identidade fosse a posição na
   * lista, arrastar as duas paletas trocava a escolha deles em silêncio — e
   * ninguém daria por isso até ao dia da montagem. Se fosse o texto, corrigir
   * uma gralha no rótulo apagava a resposta.
   */
  id: string;
  rotulo: string;
  /** O {@link OpcaoDeEscolha.rotulo} em inglês. */
  rotuloEn?: string;
  descricao?: string;
  /** A {@link OpcaoDeEscolha.descricao} em inglês. */
  descricaoEn?: string;
  /**
   * Uma fotografia da pasta deste pedido, pelo caminho — o mesmo formato dos
   * mood boards. Uma paleta explica-se muito melhor com a fotografia do que
   * com o nome dela.
   */
  imagem?: string;
}

/** Uma pergunta com alternativas, escrita por ela no estúdio. */
export interface Escolha {
  /** Ver {@link OpcaoDeEscolha.id} — a mesma razão, ao nível da pergunta. */
  id: string;
  titulo: string;
  /** O {@link Escolha.titulo} em inglês. */
  tituloEn?: string;
  /** Uma linha por baixo do título: «podemos mudar até 30 dias antes». */
  nota?: string;
  /** A {@link Escolha.nota} em inglês. */
  notaEn?: string;
  opcoes: OpcaoDeEscolha[];
}

/** O que o casal respondeu a uma escolha. Vive no PEDIDO — ver o cabeçalho. */
export interface RespostaDeEscolha {
  escolhaId: string;
  opcaoId: string;
  /** ISO. É a data da acção deliberada, e a única coisa temporal gravada. */
  em: string;
}

/**
 * Uma escolha só vale a pena mostrar com DUAS opções.
 *
 * Com uma, não é uma escolha — é uma afirmação, e um botão que só tem uma
 * resposta possível é um botão que faz o casal desconfiar do resto da página.
 * Uma escolha a meio de ser escrita (o segundo campo ainda vazio) não sai para
 * o casal, e não é um erro: é trabalho por acabar.
 */
export const MINIMO_DE_OPCOES = 2;

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A escolha está pronta para o casal a ver? */
export function escolhaPronta(e: Escolha): boolean {
  return (
    !!texto(e.titulo) &&
    e.opcoes.filter((o) => !!texto(o.rotulo)).length >= MINIMO_DE_OPCOES &&
    // Duas opções com o mesmo identificador tornam a resposta ambígua: a
    // primeira responde pelas duas. É um documento corrompido, não uma
    // escolha por acabar — mas o casal não pode ser quem descobre isso.
    new Set(e.opcoes.map((o) => o.id)).size === e.opcoes.length
  );
}

/**
 * As escolhas que SAEM para a página do casal.
 *
 * Uma só função, e usada nos dois lados: a página desenha o que isto devolve,
 * e a rota que grava a resposta valida contra o que isto devolve. Com duas
 * leituras diferentes da mesma regra, uma escolha por acabar ficava
 * inalcançável no ecrã e gravável por quem soubesse o identificador.
 */
export function escolhasParaOCasal(escolhas: Escolha[] | undefined): Escolha[] {
  return (escolhas ?? []).filter(escolhaPronta).map((e) => ({
    ...e,
    opcoes: e.opcoes.filter((o) => !!texto(o.rotulo)),
  }));
}

/** Uma opção como chega ao componente do browser: só o identificador. */
export interface OpcaoParaOEcra {
  id: string;
}
/** Uma escolha como chega ao componente do browser: só os identificadores. */
export interface EscolhaParaOEcra {
  id: string;
  opcoes: OpcaoParaOEcra[];
}

/**
 * ── O QUE ATRAVESSA PARA O BROWSER (A7-001) ───────────────────────────────
 *
 * O componente das escolhas é um Client Component: tudo o que recebe vai
 * escrito no HTML da página. Recebia as escolhas INTEIRAS — com o `imagem` de
 * cada opção, que é o caminho da fotografia no armazenamento (a pasta do
 * pedido, o nome do ficheiro). Não é segredo que abra nada, mas é a forma
 * interna da casa a passear num HTML que o casal reenvia.
 *
 * O componente só usa os identificadores: o texto chega-lhe já traduzido e a
 * fotografia por um id opaco. É isso, e só isso, que passa.
 */
export function escolhasParaOEcra(escolhas: Escolha[]): EscolhaParaOEcra[] {
  return escolhas.map((e) => ({ id: e.id, opcoes: e.opcoes.map((o) => ({ id: o.id })) }));
}

/** O texto na língua da proposta, com o português como recurso. */
export function tituloNaLingua(e: Escolha, idioma: IdiomaDaProposta): string {
  return idioma === "en" ? (texto(e.tituloEn) || e.titulo).trim() : e.titulo.trim();
}

/** A nota na língua da proposta. Vazia quando não há nota nenhuma. */
export function notaNaLingua(e: Escolha, idioma: IdiomaDaProposta): string {
  return idioma === "en" ? texto(e.notaEn) || texto(e.nota) : texto(e.nota);
}

/** O rótulo de uma opção na língua da proposta. */
export function rotuloNaLingua(o: OpcaoDeEscolha, idioma: IdiomaDaProposta): string {
  return idioma === "en" ? (texto(o.rotuloEn) || o.rotulo).trim() : o.rotulo.trim();
}

/** A descrição de uma opção na língua da proposta. */
export function descricaoNaLingua(o: OpcaoDeEscolha, idioma: IdiomaDaProposta): string {
  return idioma === "en" ? texto(o.descricaoEn) || texto(o.descricao) : texto(o.descricao);
}

/**
 * Os campos ingleses das escolhas, no mesmo formato do resto do documento.
 *
 * Existe para o painel «Por traduzir» e a tradução automática os encontrarem
 * sem saberem o que é uma escolha — é a fronteira que `proposal-doc-bilingue`
 * já define para todo o documento.
 */
export function camposDeEscolhaPorTraduzir(escolhas: Escolha[] | undefined): {
  caminho: string;
  rotulo: string;
  pt: string;
}[] {
  const fora: { caminho: string; rotulo: string; pt: string }[] = [];
  (escolhas ?? []).forEach((e, i) => {
    if (texto(e.titulo) && !texto(e.tituloEn)) {
      fora.push({ caminho: `escolhas:${i}:titulo`, rotulo: `Escolha «${e.titulo}»`, pt: e.titulo });
    }
    if (texto(e.nota) && !texto(e.notaEn)) {
      fora.push({ caminho: `escolhas:${i}:nota`, rotulo: `Nota de «${e.titulo}»`, pt: e.nota! });
    }
    e.opcoes.forEach((o, j) => {
      if (texto(o.rotulo) && !texto(o.rotuloEn)) {
        fora.push({
          caminho: `escolhas:${i}:opcoes:${j}:rotulo`,
          rotulo: `Opção «${o.rotulo}»`,
          pt: o.rotulo,
        });
      }
      if (texto(o.descricao) && !texto(o.descricaoEn)) {
        fora.push({
          caminho: `escolhas:${i}:opcoes:${j}:descricao`,
          rotulo: `Descrição de «${o.rotulo}»`,
          pt: o.descricao!,
        });
      }
    });
  });
  return fora;
}

/** O estado de uma escolha, visto do back office. */
export type EstadoDaEscolha =
  | { tipo: "por-responder" }
  | { tipo: "escolhida"; opcao: OpcaoDeEscolha; em: string }
  /** Responderam, e a opção que escolheram já não está no documento. */
  | { tipo: "opcao-desapareceu"; opcaoId: string; em: string };

/**
 * Cruza as perguntas com as respostas — a leitura do back office.
 *
 * Devolve TODAS as escolhas prontas, respondidas ou não: uma lista que só
 * mostrasse as respondidas fazia «ainda não escolheram a paleta» parecer «não
 * havia paleta para escolher», e são duas conversas muito diferentes de ter ao
 * telefone.
 */
export function resolverEscolhas(
  escolhas: Escolha[] | undefined,
  respostas: RespostaDeEscolha[] | undefined,
): { escolha: Escolha; estado: EstadoDaEscolha }[] {
  const porEscolha = new Map<string, RespostaDeEscolha>();
  for (const r of respostas ?? []) {
    const atual = porEscolha.get(r.escolhaId);
    // A ÚLTIMA vale: o casal pode mudar de ideias, e mudar de ideias antes do
    // dia é o comportamento que esta funcionalidade quer permitir.
    if (!atual || (r.em ?? "") >= (atual.em ?? "")) porEscolha.set(r.escolhaId, r);
  }
  return escolhasParaOCasal(escolhas).map((escolha) => {
    const r = porEscolha.get(escolha.id);
    if (!r) return { escolha, estado: { tipo: "por-responder" } as const };
    const opcao = escolha.opcoes.find((o) => o.id === r.opcaoId);
    return {
      escolha,
      estado: opcao
        ? ({ tipo: "escolhida", opcao, em: r.em } as const)
        : ({ tipo: "opcao-desapareceu", opcaoId: r.opcaoId, em: r.em } as const),
    };
  });
}

/**
 * Grava uma resposta por cima da anterior, sem deixar duas para a mesma
 * pergunta.
 *
 * Substituir e não acrescentar: um histórico de indecisões guardado no pedido
 * seria, na prática, o registo de comportamento que ela proibiu — dava para
 * ler quantas vezes hesitaram e a que horas. Fica a decisão, e a data dela.
 */
export function comResposta(
  respostas: RespostaDeEscolha[] | undefined,
  nova: RespostaDeEscolha,
): RespostaDeEscolha[] {
  return [...(respostas ?? []).filter((r) => r.escolhaId !== nova.escolhaId), nova];
}

/**
 * Uma resposta que chegou do outro lado da rede é aceitável?
 *
 * Só o par (escolha, opção) que EXISTE numa escolha pronta. Sem isto, o corpo
 * do pedido decidia o que fica gravado na ficha do evento — e quem tem o link
 * tem o corpo.
 */
export function respostaAceitavel(
  escolhas: Escolha[] | undefined,
  escolhaId: unknown,
  opcaoId: unknown,
): boolean {
  if (typeof escolhaId !== "string" || typeof opcaoId !== "string") return false;
  const e = escolhasParaOCasal(escolhas).find((x) => x.id === escolhaId);
  return !!e && e.opcoes.some((o) => o.id === opcaoId);
}

/**
 * Um identificador novo, curto e legível.
 *
 * `crypto.randomUUID` seria mais óbvio e não serve aos dois lados: isto corre
 * no browser (o estúdio, ao acrescentar uma opção) e em Node, e o `randomUUID`
 * do browser só existe em contexto seguro. Doze caracteres de base 36 chegam
 * de sobra para distinguir opções dentro de UM documento.
 */
export function novoIdDeEscolha(aleatorio: () => number = Math.random): string {
  let s = "";
  while (s.length < 12) s += Math.floor(aleatorio() * 36 ** 6).toString(36);
  return s.slice(0, 12);
}
