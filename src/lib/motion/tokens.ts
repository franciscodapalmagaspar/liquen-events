/**
 * Fichas de movimento do lado JS.
 *
 * O sítio declara UMA desaceleração de assinatura — `--ease-out` no `:root` do
 * globals.css. Mas uma primitiva que escreve `el.style.transition` à mão não
 * consegue ler essa variável, por isso a curva estava copiada, caracter a
 * caracter, em cada primitiva (Reveal, AnimateIn, TiltCard, e o menu do
 * Navbar). Quatro cópias independentes de um valor que devia ser um só: nada
 * impedia que uma delas fosse afinada e as outras não, e foi exactamente assim
 * que a curva do Reveal chegou a ter no comentário um valor
 * (`cubic-bezier(0.33, 1, 0.68, 1)`) diferente do que a constante logo abaixo
 * usava.
 *
 * Este ficheiro é a cópia única do lado JS. O `tokens.coerencia.test.ts`
 * compara-a com o valor REAL lido do globals.css — se um dos dois lados for
 * afinado sozinho, o teste fica vermelho em vez de a página ficar
 * silenciosamente com duas desacelerações.
 */

/**
 * A desaceleração de assinatura. Espelha `--ease-out` do globals.css (mesmo
 * valor, verificado por teste). Arranca depressa e assenta devagar: é o que dá
 * a leitura de "peso" ao movimento do sítio.
 */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * A curva de SAÍDA. Espelha `--ease-in` do globals.css (mesmo valor, verificado
 * por teste).
 *
 * A irmã da de cima, e a que faltava. Quem sai não precisa de ser acompanhado
 * até ao fim: hesita no arranque — para se perceber o que é que está a sair — e
 * acelera a partir daí. Uma saída que trava à chegada lê-se como indecisão, e
 * uma saída na curva de ENTRADA lê-se como se a coisa ainda pudesse voltar
 * atrás.
 */
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * ── A ESCALA DOS TEMPOS ─────────────────────────────────────────────────────
 *
 * Três degraus, e a razão de serem três: o que responde ao dedo, o que move uma
 * coisa, e o que troca um ecrã. Antes disto havia seis números em uso (300,
 * 200, 500, 700, 150, 400) sem regra escrita em lado nenhum — ou seja, cada
 * componente novo escolhia à sorte, e a olho lia-se como deriva.
 *
 * Espelham os `--transition-duration-*` do `@theme` do globals.css, com teste a ligar as
 * pontas. Lá dão utilitários do Tailwind (`duration-elemento`); aqui servem
 * quem escreve `element.style.transition` à mão.
 *
 * O QUARTO tempo — a entrada de uma fotografia ao scroll — NÃO é um degrau
 * desta escala. É uma escala própria, que acompanha o tamanho da fotografia
 * (ver `PHOTO_REVEAL_*` no fim deste ficheiro), e existia antes disto.
 */
/** Responde ao dedo: toque, foco, passar o rato. */
export const DUR_MICRO_MS = 120;
/** Move uma coisa: abrir uma secção, entrar uma foto, fechar um aviso. */
export const DUR_ELEMENTO_MS = 250;
/** Troca um ecrã: mudar de passo, mudar de vista. */
export const DUR_VISTA_MS = 350;

/**
 * ── A MOLA ──────────────────────────────────────────────────────────────────
 *
 * Para o que se ARRASTA — e só para isso. Uma curva descreve um percurso com
 * princípio e fim conhecidos; uma coisa largada a meio de um gesto não tem
 * nenhum dos dois, e é por isso que uma `transition` a seguir um dedo se lê
 * sempre como atraso.
 *
 * Amortecimento alto, quase crítico: assenta e fica. A oscilação é o erro
 * clássico da mola em interfaces — parece brincadeira, e num painel onde se
 * arrastam quarenta fotografias parece que o programa não está seguro do que
 * fez.
 *
 * Sem biblioteca: ver `mola.ts`, cerca de quarenta linhas sobre
 * `requestAnimationFrame`. O `@dnd-kit` que a casa já usa trata do arrastar; o
 * que lhe falta é a assentada.
 *
 * ── Os números são MEDIDOS, e não herdados ────────────────────────────────
 *
 * A primeira proposta foi 170/26 — que é, literalmente, o preset «gentle» de
 * uma biblioteca de molas conhecida. Herdar o valor por omissão de outra pessoa
 * é exactamente o que se lê como «não foi escolhido»: medido aqui, assentava um
 * arrasto de 200 px em 717 ms, o que num painel de fotografias é uma espera.
 *
 * 400/38 assenta o mesmo arrasto em 450 ms, 40 px em 350 ms e um empurrão de
 * 8 px em 233 ms — ou seja, o tempo acompanha a distância sozinho, que é a
 * razão de se usar uma mola e não uma duração fixa.
 *
 * O amortecimento fica a 95% do crítico (o crítico, para esta rigidez, é 40):
 * o recuo depois de chegar é de centésimos de píxel — invisível — mas continua
 * a ser uma mola e não um travão. Um teste guarda as duas pontas.
 */
export const MOLA = {
  /** A força com que puxa para o sítio. */
  rigidez: 400,
  /** O travão — é isto que impede a oscilação. */
  amortecimento: 38,
  massa: 1,
} as const;

/**
 * Duração de UMA entrada ao scroll. Vale para todas as revelações do mesmo
 * gesto — `Reveal`, `AnimateIn` e a `.cl-reveal` da parede de logótipos já
 * partilhavam este número, cada uma escrita à parte; agora partilham a ficha.
 */
export const REVEAL_MS = 750;

/** O mesmo, em segundos (a API do `Reveal` fala em segundos, como o GSAP falava). */
export const REVEAL_S = REVEAL_MS / 1000;

/**
 * Intervalo entre elementos consecutivos de uma cascata, em segundos. 90 ms lê-se
 * como "composto" sem obrigar a esperar: uma cascata de 4 elementos fica
 * resolvida em 0,27 s + a duração da entrada.
 */
export const STAGGER_S = 0.09;

/** O mesmo passo, em milissegundos (a API do `AnimateIn` fala em ms). */
export const STAGGER_MS = STAGGER_S * 1000;

/**
 * TECTO da cascata de blocos. A partir do 5.º elemento o atraso deixa de
 * acumular.
 *
 * Sem tecto, uma cascata é uma multiplicação: quem chega ao fim de uma lista
 * longa espera pelo produto. A parede de logótipos é a prova — 19 logótipos a
 * 42 ms dão 756 ms de rasto, e o último só fica legível ~1,5 s depois de a
 * secção entrar. Com tecto, o rasto de QUALQUER cascata é no máximo
 * `STAGGER_CAP × STAGGER_MS` = 360 ms, seja de 5 elementos ou de 50.
 *
 * O padrão não é novo: o `LegalDocView` já fazia `Math.min(i, 4) * 40`. Estava
 * escrito uma vez, num sítio, e em mais lado nenhum.
 */
export const STAGGER_CAP = 4;

/** Atraso do i-ésimo BLOCO de uma cascata, com o tecto já aplicado. */
export function staggerMs(i: number): number {
  return Math.min(i, STAGGER_CAP) * STAGGER_MS;
}

/**
 * Passo entre PALAVRAS (a animação `word-rise` dos títulos).
 *
 * Deliberadamente mais curto que o passo de blocos, e isto não é deriva: as
 * palavras são pequenas, contíguas e leem-se como UMA frase a levantar-se. Ao
 * passo de bloco (90 ms) uma frase de dez palavras demoraria quase um segundo a
 * acabar de chegar e passaria a ler-se como dez coisas separadas.
 *
 * 50 ms é o valor que o sítio usa em produção (`/sobre`). O `TitleReveal` tinha
 * um valor por omissão diferente (60 ms) que nunca chegou a ser usado, e o
 * `KineticHeading` — componente órfão, zero utilizações, apagado a 31/10 —
 * trazia um terceiro (90 ms). Três valores por omissão para o mesmo gesto, um só em uso.
 */
export const WORD_STAGGER_MS = 50;

/** Tecto da cascata de palavras. Um título longo deixa de castigar quem o lê. */
export const WORD_STAGGER_CAP = 6;

/** Atraso da i-ésima PALAVRA, com o tecto já aplicado. */
export function wordStaggerMs(i: number, step: number = WORD_STAGGER_MS): number {
  return Math.min(i, WORD_STAGGER_CAP) * step;
}

/**
 * Onde é que a cascata de palavras de `texto` ACABA — o instante em que uma
 * frase seguinte pode arrancar sem colidir nem deixar buraco.
 *
 * Existe por causa de um acoplamento real: no `/sobre` a segunda metade da
 * frase arrancava com `statementLead.split(/\s+/).length * 50 + 80`, ou seja
 * com o passo (50) escrito à mão uma TERCEIRA vez, fora do componente. Mudar o
 * `step` de um dos `<TitleReveal>` dessincronizava as duas metades em silêncio.
 * Agora quem sabe contar palavras é quem sabe o passo.
 *
 * Enquanto o tecto não morde, devolve exactamente o mesmo número que a conta
 * antiga (`n × passo + intervalo`) — é uma reorganização, não uma afinação.
 */
export const SENTENCE_GAP_MS = 80;

export function wordCascadeEndMs(texto: string, step: number = WORD_STAGGER_MS): number {
  const n = texto.trim().split(/\s+/).filter(Boolean).length;
  if (n === 0) return 0;
  return (Math.min(n - 1, WORD_STAGGER_CAP) + 1) * step + SENTENCE_GAP_MS;
}

/**
 * ── Revelação de FOTOGRAFIA ─────────────────────────────────────────────────
 *
 * É UM gesto, não quatro: `<Reveal variant="zoom">` — a foto assenta de
 * `scale(1.08)` até ao repouso enquanto desvanece para dentro. Transform +
 * opacity apenas, portanto composto na GPU; substituiu de propósito o `mask`
 * (uma limpeza por `clip-path`, que repinta a cada quadro) em todos os sítios
 * onde havia fotografias grandes.
 *
 * O que faltava não era o gesto — era a ESCALA. Os três tempos abaixo já
 * existiam no sítio, escolhidos um a um, e à primeira vista leem-se como
 * deriva. Não são: acompanham o TAMANHO da fotografia. Ao mesmo `scale(1.08)`,
 * uma foto de sangria inteira percorre muitas mais centenas de píxeis do que um
 * mosaico de 160 px — dar-lhes o mesmo tempo faria a grande parecer apressada e
 * a pequena arrastada. O que estava errado era a escala não estar escrita em
 * lado nenhum, e por isso cada foto nova inventar um número.
 */
/** Sangria inteira, 100svh (capítulos da página inicial). */
export const PHOTO_REVEAL_FULL_S = 1.15;
/** Retrato / meia página (`/sobre`). */
export const PHOTO_REVEAL_LARGE_S = 0.9;
/** Mosaico e tiles pequenos — o mesmo tempo de qualquer outra entrada. */
export const PHOTO_REVEAL_TILE_S = REVEAL_S;

/**
 * ── A MOLA DA CHEGADA ───────────────────────────────────────────────────────
 *
 * A SEGUNDA mola, e a razão de ser segunda está na primeira: a `MOLA` aqui em
 * cima é para o que se ARRASTA, e por isso tem o amortecimento a 95% do crítico
 * — assenta e fica, com um recuo de centésimos de píxel. Num painel onde se
 * arrastam quarenta fotografias, uma que oscilasse parecia que o programa não
 * estava seguro do que tinha feito.
 *
 * Uma CHEGADA é o problema oposto. Uma caixa que o utilizador convocou — uma
 * folha do telemóvel, um diálogo — não está a obedecer a um dedo: está a
 * apresentar-se. E uma coisa que pára exactamente onde devia, à primeira, lê-se
 * como um fotograma final que apareceu; uma que passa ligeiramente do sítio e
 * assenta lê-se como um objecto que CHEGOU. É a diferença que se sente num
 * telefone da Apple ao abrir uma folha.
 *
 * ── OS NÚMEROS, E A CONTA ─────────────────────────────────────────────────
 *
 *   rigidez 2000, massa 1    →  ωn = √(2000/1) = 44,72 rad/s
 *   amortecimento 51         →  ζ  = 51 / (2·√(2000·1)) = 0,570
 *   ωd = ωn·√(1−ζ²) = 36,74 rad/s
 *
 * Daí saem, por conta e não por gosto:
 *
 *   · **ultrapassagem de 11,1%** — e(−πζ/√(1−ζ²)). Num percurso de 18 px são
 *     2,0 px para lá do sítio, e o recuo seguinte é de 0,25 px. Vê-se como
 *     assentamento, não como saltinho.
 *   · **o pico aos 86 ms** — π/ωd. Ou seja o gesto já CHEGOU a meio da
 *     animação; o que vem depois é a assentar.
 *   · **assenta a 1% aos 181 ms** — −ln(0,01)/(ζ·ωn), e a 0,2% aos 240.
 *
 * ── E PORQUE É QUE ESTA MOLA É TÃO DURA: FOI MEDIDA A CUSTAR ─────────────
 *
 * A primeira versão era 900/34, que assenta em 360 ms — e 360 ms foi o que
 * este vocabulário teve de devolver. MEDIDO, A/B na mesma compilação, diálogo
 * a abrir a 1440×900 com o CPU travado 6×, mediana de sete repetições:
 *
 *     percurso só (10/18 px, 240 ms)               20 fotogramas perdidos
 *     percurso + escala 0,97 (240 ms)              22
 *     percurso + mola de 360 ms (sem escala)       35   ← o custo está aqui
 *     percurso + escala + mola de 360 ms           28
 *     (e o que lá estava antes, 4 px, 240 ms)      30
 *
 * Ou seja: a DISTÂNCIA e a ESCALA são de graça — o percurso maior até saiu
 * melhor do que o que lá estava. O que custava era a caixa ficar 120 ms a mais
 * com uma camada composta viva, num ecrã com quatro vezes a área do telemóvel.
 * A regra da casa não hesita: a fluidez ganha à espectacularidade, sempre.
 *
 * A mola não foi deitada fora — foi ENDURECIDA até assentar dentro dos 240 ms
 * que o resto do vocabulário já usava. É a mesma mola: ωn multiplicado por 1,5
 * (rigidez ×2,25, amortecimento ×1,5) mantém o ζ e portanto mantém a FORMA —
 * a mesma ultrapassagem de 11%, o mesmo recuo, tudo em dois terços do tempo. E
 * o vocabulário fica com UMA duração para o que aparece, em vez de duas.
 *
 * A `MOLA` do arrasto, com ζ = 0,95, dá uma ultrapassagem de 0,007% — sete
 * centésimos de milésimo. Usá-la aqui era escrever «mola» e não ter mola
 * nenhuma; foi medido antes de se acrescentar esta.
 */
export const MOLA_CHEGADA = {
  /** A força com que puxa para o sítio. */
  rigidez: 2000,
  /** O travão. Mais fraco do que o do arrasto de propósito: é o que deixa passar. */
  amortecimento: 51,
  massa: 1,
} as const;

/**
 * Quanto dura uma chegada com mola — e é, de propósito, o MESMO número da
 * `.bo-entrada` de toda a gente. Ver acima a medição que o obrigou a sê-lo.
 */
export const CHEGADA_MS = 240;

/** Quantos degraus tem o `linear()` que o CSS lê. */
export const CHEGADA_PASSOS = 30;

/**
 * A MOLA ESCRITA EM CSS — e porque é que isto não é uma terceira curva.
 *
 * Uma `cubic-bezier` não sabe ultrapassar sem que alguém escolha à mão um ponto
 * de controlo fora do intervalo, e isso seria mesmo uma curva nova, inventada
 * ao olho, a competir com as duas que a casa escolheu. O `linear()` não é isso:
 * é a resposta da `MOLA_CHEGADA` aqui em cima, AMOSTRADA. Os números não se
 * escolhem — calculam-se a partir da rigidez e do amortecimento, e mudar a mola
 * muda-os a todos de uma vez.
 *
 * x(t) = 1 − e^(−ζ·ωn·t)·(cos(ωd·t) + (ζ·ωn/ωd)·sin(ωd·t))
 *
 * Normaliza-se por x(D) para o último degrau ser exactamente 1: uma curva de
 * animação que não acabe em 1 deixa o elemento a dois décimos de píxel do sítio
 * para sempre.
 *
 * O `tokens.coerencia.test.ts` regenera esta cadeia e compara-a, caracter a
 * caracter, com a que está no `globals.css` — pelo mesmo motivo por que já o
 * faz com as duas curvas: dois sítios, um valor.
 */
export function molaEmLinear(
  mola: { rigidez: number; amortecimento: number; massa: number } = MOLA_CHEGADA,
  duracaoMs: number = CHEGADA_MS,
  passos: number = CHEGADA_PASSOS,
): string {
  const wn = Math.sqrt(mola.rigidez / mola.massa);
  const z = mola.amortecimento / (2 * Math.sqrt(mola.rigidez * mola.massa));
  const wd = wn * Math.sqrt(1 - z * z);
  const x = (t: number) =>
    1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + ((z * wn) / wd) * Math.sin(wd * t));
  const fim = x(duracaoMs / 1000);
  const pontos: number[] = [];
  for (let i = 0; i <= passos; i++) {
    pontos.push(Number((x(((duracaoMs / 1000) * i) / passos) / fim).toFixed(4)));
  }
  return `linear(${pontos.join(", ")})`;
}
