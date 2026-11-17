/**
 * ════════════════════════════════════════════════════════════════════════════
 * A METADE IRMÃ DO `porque-falhou`: AS LEITURAS QUE NÃO ACONTECERAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `porque-falhou.ts` escreve as frases de uma GRAVAÇÃO recusada. As leituras
 * ficaram deliberadamente de fora dele, e não por esquecimento: as frases dele
 * são de gravação. «O servidor não está a aceitar gravações agora» é FALSO
 * sobre uma leitura — e uma frase falsa é pior do que nenhuma, porque manda
 * fazer o passo errado. «Nada se perdeu: repete quando a rede voltar» também
 * não serve: numa leitura não se escreveu nada, não há nada para repetir, há
 * uma página para recarregar.
 *
 * ── O QUE UMA LEITURA FALHADA TEM DE DIFERENTE ────────────────────────────
 *
 * **1. Uma leitura que não aconteceu não sabe afirmar que não há nada.**
 * É a consequência cara, e está documentada em
 * `admin/carregamento/[eventId]/Carregamento.falha.test.tsx`: com a leitura em
 * baixo, o ecrã dizia «Sem checklist. Gera-a primeiro no pedido, no
 * computador.» — a meio de uma quinta, sobre uma checklist que existe e está
 * feita. Falso, e caro: o passo que a frase manda dar (regerar) deita fora as
 * marcações de devolvido e de em falta.
 *
 * «Sem checklist», «Modelos (0)», «Agenda tranquila», «Catálogo vazio» são
 * AFIRMAÇÕES sobre os dados dela. Só se podem escrever depois de uma leitura
 * que voltou. São precisos três estados, sempre: **a ler**, **falhou** (com a
 * razão e uma saída), e **vazio a sério**.
 *
 * **2. A instrução é outra.** Numa gravação, «repete» — o gesto é dela e o
 * texto está no campo. Numa leitura, «recarrega» ou «tenta outra vez»: não há
 * gesto nenhum para repetir. E nunca «o que escreveste está guardado», porque
 * não se escreveu nada. O que há a dizer, quando é preciso dizer alguma coisa,
 * é o contrário: **isto foi uma leitura, portanto não se estragou nada** —
 * uma leitura falhada nunca é uma perda de dados, e quem está do outro lado do
 * ecrã não sabe isso.
 *
 * **3. A sessão expirada é o caso COMUM.** No `porque-falhou` é um caso entre
 * seis; aqui é o primeiro a considerar. O back office fica aberto horas — um
 * separador da manhã, uma revalidação da tarde — e o cookie caduca sozinho ou
 * porque alguém carregou em Sair noutro aparelho. A partir daí TODAS as
 * leituras respondem 401, e o ecrã enche-se de vazios a mentir. O painel de
 * reentrada (`SessaoExpirada.tsx`) já aparece por cima quando isto acontece;
 * o que esta frase faz é explicar o vazio que ficou por baixo dele.
 *
 * ── PORQUE É QUE AQUI A FRASE DO SERVIDOR GANHA TAMBÉM NOS 500 ────────────
 *
 * No `porque-falhou`, um 500 numa gravação NÃO mostra o que o servidor disse —
 * traz rastos de pilha e nomes de tabelas. Numa leitura desta casa é ao
 * contrário, e está medido: as rotas respondem coisas como «Falta correr o
 * db/schema.sql» ou «A base de dados não respondeu (faltam as tabelas?)», e
 * essa frase RESOLVE o problema sozinha, sem ninguém ir aos registos. Foi
 * assim que o ecrã Material se explicou depois de dias a aparecer vazio. Uma
 * genérica por cima dela deitava fora a única informação útil da resposta.
 *
 * A excepção é a sessão: aí a frase do servidor é sempre «Não autorizado», que
 * não diz o que fazer, e o que interessa é a instrução.
 *
 * ── O QUE ISTO DEVOLVE PARA ALÉM DA FRASE ─────────────────────────────────
 *
 * Quem chama tem um estado para desenhar, não só um texto: precisa de saber se
 * vale a pena mostrar um «Tentar de novo» (um botão que não pode funcionar é
 * pior do que nenhum) e se foi a sessão que caiu (aí quem resolve é o painel
 * de reentrada, e a lista volta sozinha a seguir). A `razao` é o discriminante
 * para quem quiser desenhar caso a caso sem ler a frase à procura de palavras.
 *
 * Módulo puro e sem React, como o irmão: é a camada onde as palavras se
 * decidem, e tem de poder ser posta à prova sem montar um ecrã.
 */

/** O que o servidor manda no corpo quando tem alguma coisa a dizer. */
export interface CorpoDeErro {
  error?: unknown;
}

/** O tipo de leitura falhada, para quem desenha o estado caso a caso. */
export type RazaoDeLeitura =
  /** O pedido não chegou a sair — rede em baixo, ou o `fetch` rebentou. */
  | "sem-rede"
  /** 401/403: o cookie caducou, ou alguém saiu noutro aparelho. */
  | "sessao-expirada"
  /** 404: o que se estava a ler já não existe (ou a rota mudou de sítio). */
  | "nao-existe"
  /** 408/504: o servidor demorou demasiado e o pedido foi cortado. */
  | "demorou"
  /** 429: pedidos a mais em pouco tempo. */
  | "pedidos-a-mais"
  /** 5xx: o servidor não conseguiu responder. */
  | "servidor"
  /** O resto — uma recusa que não se sabe classificar melhor. */
  | "recusa";

export interface LeituraFalhada {
  /** A frase inteira, pronta a mostrar. */
  mensagem: string;
  /** O tipo de falha, para quem desenha o estado sem ler a frase. */
  razao: RazaoDeLeitura;
  /**
   * Vale a pena voltar a pedir o mesmo?
   *
   * `false` na sessão expirada (quem resolve é a reentrada) e no que já não
   * existe — os dois casos em que pedir outra vez falha sempre. Quem chama usa
   * isto para decidir se mostra um «Tentar de novo».
   */
  valeTentarDeNovo: boolean;
  /** A sessão caiu. É o caso mais comum numa leitura. */
  sessaoExpirou: boolean;
}

/** Trinta e seis caracteres de UUID no meio de um aviso não ajudam ninguém. */
const MAX_FRASE_DO_SERVIDOR = 300;

function fraseDoServidor(corpo: unknown): string {
  const e = (corpo as CorpoDeErro | null)?.error;
  if (typeof e !== "string") return "";
  const limpo = e.trim();
  if (!limpo || limpo.length > MAX_FRASE_DO_SERVIDOR) return "";
  // As genéricas do servidor não valem mais do que as nossas — e são as mesmas
  // palavras vazias vistas do outro lado. «Não autorizado» entra na lista
  // porque é o que TODAS as rotas desta casa dizem num 401, e não diz nada a
  // quem só quer voltar a entrar.
  if (
    /^(erro interno|internal server error|erro|error|não autorizado|unauthorized|forbidden)\.?$/i.test(
      limpo,
    )
  )
    return "";
  return limpo;
}

/** Acaba a frase com ponto final, sem duplicar o que já lá está. */
const pontuar = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * A frase de uma leitura que não voltou.
 *
 * @param oQue  o que se estava a ler, nomeado e no acusativo: «os temas», «as
 *              fotos deste tema», «a lista de clientes». Entra na frase como
 *              «não deu para ler os temas» — nas leituras o verbo é sempre o
 *              mesmo, ao contrário das gravações, por isso aqui passa-se só a
 *              COISA e não a acção inteira.
 *
 *              **Cadeia vazia** quando o contexto já está no ecrã: um painel
 *              cujo título já diz «Não foi possível ler as listas» não precisa
 *              de o repetir na linha de baixo. Aí fica só a razão e o passo a
 *              dar. (É o mesmo raciocínio do `razaoDaRecusa` do irmão.)
 * @param resposta  a resposta HTTP, quando houve uma. `null` quando o pedido
 *              nem chegou a sair.
 * @param corpo o corpo JSON já lido, se deu para ler.
 */
export function porqueNaoLeu(
  oQue: string,
  resposta: { status: number } | null,
  corpo?: unknown,
): LeituraFalhada {
  // « — não deu para ler os temas», ou nada quando o ecrã já o diz.
  const nome = oQue.trim();
  const aCoisa = nome ? ` — não deu para ler ${nome}` : "";

  // ── O pedido não chegou a sair ─────────────────────────────────────────
  if (!resposta) {
    return {
      mensagem: `Sem ligação${aCoisa}. Assim que a rede voltar, recarrega: não se perdeu nada, isto era uma leitura.`,
      razao: "sem-rede",
      valeTentarDeNovo: true,
      sessaoExpirou: false,
    };
  }

  const { status } = resposta;
  const doServidor = fraseDoServidor(corpo);

  // ── A sessão caiu: o caso comum, e o único em que a frase do servidor não
  // ganha. «Não autorizado» não diz o que fazer; «volta a entrar» diz.
  if (status === 401 || status === 403) {
    return {
      mensagem: `A sessão expirou${aCoisa}. Volta a entrar e a lista aparece a seguir.`,
      razao: "sessao-expirada",
      // Pedir outra vez com a mesma sessão dá o mesmo 401. Quem resolve isto é
      // a reentrada, não um botão de «Tentar de novo».
      valeTentarDeNovo: false,
      sessaoExpirou: true,
    };
  }

  if (status === 404) {
    return {
      mensagem:
        doServidor ||
        `Isto já não existe${aCoisa}. Alguém apagou entretanto, ou o endereço mudou; recarrega a página.`,
      // Recarregar a página resolve; pedir a mesma coisa outra vez dá 404 para
      // sempre.
      razao: "nao-existe",
      valeTentarDeNovo: false,
      sessaoExpirou: false,
    };
  }

  if (status === 408 || status === 504) {
    return {
      mensagem: `O servidor demorou demasiado a responder${aCoisa}. Tenta outra vez daqui a pouco; os dados estão lá, isto era uma leitura.`,
      razao: "demorou",
      valeTentarDeNovo: true,
      sessaoExpirou: false,
    };
  }

  if (status === 429) {
    return {
      mensagem: `Pedidos a mais em pouco tempo${aCoisa}. Espera um minuto e tenta outra vez.`,
      razao: "pedidos-a-mais",
      valeTentarDeNovo: true,
      sessaoExpirou: false,
    };
  }

  if (status >= 500) {
    return {
      // Aqui a frase do servidor GANHA — ao contrário da gravação. Numa
      // leitura desta casa ela é do género «Falta correr o db/schema.sql», e
      // resolve o problema sozinha.
      mensagem:
        doServidor ||
        `O servidor não conseguiu responder (${status})${aCoisa}. Tenta outra vez daqui a pouco; nada foi apagado, isto era uma leitura.`,
      razao: "servidor",
      valeTentarDeNovo: true,
      sessaoExpirou: false,
    };
  }

  // 400, 422 e o resto. Numa GRAVAÇÃO isto é uma recusa do conteúdo e repetir
  // não muda nada; numa leitura não há conteúdo nenhum a corrigir — o que
  // resta é o número, que é o que ela cita a pedir ajuda.
  return {
    mensagem: doServidor
      ? pontuar(doServidor)
      : `O servidor recusou o pedido (${status})${aCoisa}. Recarrega a página; se continuar, dá este número a quem trata da aplicação.`,
    razao: "recusa",
    valeTentarDeNovo: true,
    sessaoExpirou: false,
  };
}

/** As frases que os browsers atiram quando a rede falha — ver `erro-do-servidor.ts`. */
const FRASES_DO_BROWSER =
  /^(failed to fetch|load failed|networkerror when attempting to fetch resource\.?|network request failed|the network connection was lost\.?|the internet connection appears to be offline\.?)$/i;

/**
 * O mesmo, a partir de um `catch`.
 *
 * O padrão em todo o back office é `try { fetch } catch {}`, e lá dentro já não
 * se tem a resposta em mão. Três coisas podem estar dentro do `erro`:
 *
 *   · nada de útil (um `TypeError` do browser, a rede em baixo) → «sem rede»,
 *     que é a resposta certa para quem está a olhar;
 *   · **um estado HTTP** — o `throw new Error(String(res.status))` que meia
 *     dúzia de sítios desta casa escreve para não perder o número no caminho.
 *     É reconhecido e tratado como se a resposta estivesse aqui;
 *   · uma frase escrita nesta casa (a do servidor, já lida por quem lançou) →
 *     passa tal e qual, porque já está na língua certa e já explica.
 */
export function porqueNaoLeuDoErro(oQue: string, erro: unknown): LeituraFalhada {
  const texto = erro instanceof Error ? erro.message.trim() : "";

  // «503», «404» — o estado, guardado por quem lançou. Vale mais do que
  // qualquer palpite: dá a razão certa e a instrução certa.
  if (/^[1-5]\d\d$/.test(texto)) return porqueNaoLeu(oQue, { status: Number(texto) });

  const doBrowser = erro instanceof TypeError || !texto || FRASES_DO_BROWSER.test(texto);
  if (doBrowser) return porqueNaoLeu(oQue, null);

  // Uma FRASE escrita nesta casa passa tal e qual: já está na língua certa e
  // já explica. Uma palavra solta (`throw new Error("falhou")`, que é o que
  // meia dúzia de sítios escreve) não é uma frase para mostrar a ninguém — é
  // um sinal interno, e mostrá-la seria o mesmo que mostrar «500».
  if (/\s/.test(texto)) {
    return {
      mensagem: pontuar(texto),
      razao: "recusa",
      // Não se sabe o estado; assume-se o caso benigno, que é o comum.
      valeTentarDeNovo: true,
      sessaoExpirou: false,
    };
  }

  return {
    mensagem: `Não deu para ler ${oQue || "isto"}, e não veio explicação nenhuma. Tenta outra vez; se continuar, recarrega a página.`,
    razao: "recusa",
    valeTentarDeNovo: true,
    sessaoExpirou: false,
  };
}

/**
 * A leitura falhou, e leva consigo a RAZÃO até quem desenha o ecrã.
 *
 * Antes ia um `Error` com o texto do servidor — ou, quando ele não dizia nada,
 * com o estado em cru: `new Error("500")`. Esse "500" não morria no `catch`,
 * era o que a vista mostrava à Catarina dentro do aviso, porque o
 * `AvisoDeFalha` só sabe pôr no ecrã a mensagem que lhe dão. Um número sozinho
 * não diz o que se passou nem o que fazer a seguir.
 *
 * O que viaja agora é a `LeituraFalhada` inteira: a frase, se vale a pena
 * oferecer um «Tentar de novo» (com a sessão caída, não vale — dá o mesmo 401)
 * e se foi a sessão que caiu. Um só, para as listas (`useCachedList`) e para
 * as páginas da grelha do seletor.
 */
export class ErroDeLeitura extends Error {
  constructor(readonly falha: LeituraFalhada) {
    super(falha.mensagem);
    this.name = "ErroDeLeitura";
  }
}
