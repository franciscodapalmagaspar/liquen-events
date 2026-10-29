/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DA ENTRADA — as regras, sem browser
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido dela (15/10): «quero colocar estes três vídeos na capa inicial como
 * vídeos de fundo quando se entra no site… coloca-os de forma a que fiquem
 * super fluidos, sem travar». E a 16/10: alta qualidade «para qualquer
 * dispositivo em todos os modos», sem tiras pretas, e a tocar sempre.
 *
 * O componente (`EntradaEmVideo.tsx`) faz o trabalho com os `<video>`; aqui
 * ficam só as decisões, para se poderem provar num teste sem browser:
 *   · que ficheiro vem a seguir (1 → 2 → 3 → 1…);
 *   · que versão se pede para este ecrã;
 *   · que formato este aparelho toca melhor sem travar (AV1, HEVC, H.264, VP9).
 *
 * ── OS FICHEIROS (`public/videos/entrada/v6/`) ──────────────────────────────
 *   · SEM AS TIRAS PRETAS. Os vídeos vêm gravados em formato de cinema (2:1),
 *     com 60 px pretos em cima e em baixo (120 px no 4K). Cortam-se, e o
 *     `object-cover` faz o resto: o vídeo enche a entrada sem nada à volta;
 *   · SEM OS RESTOS DE OUTRAS CENAS que vinham nas pontas dos cortes dela: o
 *     vídeo 1 começava com 0,56 s do carro com os convidados (ela: «quero que
 *     comece na floresta com a vista de cima»), o 2 com 0,72 s de outra vista
 *     aérea, e o 3 acabava com 0,36 s do casal de costas;
 *   · TRÊS VERSÕES por vídeo, cada uma para o seu ecrã:
 *       – `paisagem` 1920×960 — computador, tablet, telemóvel deitado;
 *       – `retrato` — o centro do vídeo na vertical, para o telemóvel ao alto
 *         (1080×1920 quando a fonte é 4K; 540×960 quando é 1080p). Sem isto o
 *         telemóvel ampliava o centro de um vídeo largo e via-se mal;
 *       – `grande` 2560×1280 — ecrãs grandes ou de alta densidade, e só quando
 *         a fonte é 4K (ampliar um 1080p não acrescenta nada);
 *   · H.264, sem som, `+faststart` (começa antes de acabar de descarregar), um
 *     fotograma-chave por segundo, CRF 19 com tecto de 6 Mbit/s (10 no grande):
 *     perto do original, e um débito que o 4G aguenta sem parar a carregar;
 *   · WebM/VP9 em `paisagem` e `retrato` para os poucos browsers sem H.264;
 *   · e, desde 16/10, as mesmas três versões em **HEVC** (`-hevc.mp4`, x265
 *     CRF 20) e em **AV1** (`-av1.mp4`, libaom): a mesma floresta com menos
 *     defeitos pelo mesmo peso. Só os recebe o aparelho que os descodifica no
 *     chip — ver `melhorFormato`.
 *
 *   · O VÍDEO 1 MAIS CLARO, desde 17/10 (`v5`). Ela, no telemóvel: «está muito
 *     escuro… a da parte da floresta». Medido: a parte aérea tinha metade do
 *     brilho dos outros (luma média ~56 contra ~85 no 3). Levantam-se os tons
 *     médios com uma curva (`0/0 0.10/0.16 0.30/0.47 0.6/0.78 1/1`, saturação
 *     ×1,10) — o preto e o branco ficam onde estavam, por isso não lava como
 *     um `gamma` —, e só até ao corte para a noiva (14,64 s na fonte), que já
 *     era clara. A fotografia da entrada (`entrada-floresta-clara.jpg`) é o
 *     1.º fotograma com a mesma curva, para a passagem continuar sem salto.
 *     Os vídeos 2 e 3 são os mesmos ficheiros de antes, só mudaram de pasta.
 *     O peso do 1 ficou o de antes (mais claro, o grão das sombras vê-se e
 *     pedia ~30 % mais): HEVC ao alto CRF 23 e AV1 ao alto CRF 33, a versão
 *     leve HEVC com tecto de 1,75 Mbit/s e o VP9 a CRF 36. Medido contra a
 *     versão clara mais fiel (HEVC CRF 20): SSIM 0,9875 no HEVC ao alto.
 *
 *   · AO ALTO MAIS LEVE, desde 21/10 (`v6`). O telemóvel é quem mais sofre
 *     com o peso, e o vídeo 1 ao alto pesava 14 MB em H.264 (Android) e
 *     9,6 MB em HEVC (iPhone). Refeitas só as versões `retrato`, com tecto de
 *     débito: H.264 CRF 23 até 3 Mbit/s, HEVC CRF 26 até 2,2, AV1 CRF 38 até
 *     1,6, VP9 a 1,2 e as leves a 1,4 (H.264) e 1,0 (HEVC). O vídeo 1 ao alto
 *     fica em 7,0 MB (H.264) e 5,0 MB (HEVC) — metade —, com SSIM 0,977
 *     contra o de antes: no ecrã de um telemóvel não se distingue. A
 *     `paisagem` e a `grande` são os mesmos ficheiros, só mudaram de pasta.
 *
 * A pasta tem versão (`v6`) porque os vídeos são servidos com cache de um ano:
 * um vídeo novo vai para `v7`, nunca por cima.
 */

export const PASTA_DOS_VIDEOS = "/videos/entrada/v6";

/** Quantos vídeos há. */
export const NUMERO_DE_VIDEOS = 3;

/** Que vídeos têm versão `grande` (as fontes em 4K). Desde 16/10: os três. */
export const TEM_GRANDE: readonly boolean[] = [true, true, true];

export type Variante = "paisagem" | "retrato" | "grande";
/**
 * `mp4` é o H.264 (o de sempre); `hevc` e `av1` são MP4 com codecs mais novos
 * — a mesma imagem com menos defeitos pelo mesmo peso; `webm` é o VP9.
 */
export type Formato = "mp4" | "webm" | "hevc" | "av1";

/** Quanto dura a passagem de um vídeo para o seguinte (só opacidade). */
export const PASSAGEM_MS = 800;

/** A partir de quantos píxeis reais de largura vale a pena a versão grande. */
const LARGURA_DO_GRANDE = 2200;

/**
 * O `type` de cada formato e versão, para o `canPlayType`, as `<source>` e a
 * pergunta ao aparelho. O nível do codec é o dos ficheiros (lido no cabeçalho
 * de cada um): a versão grande pede um nível acima, e um aparelho que só
 * descodifica até ao nível da paisagem não deve perder a paisagem por isso.
 */
export function tipoDoFormato(formato: Formato, variante: Variante = "paisagem"): string {
  const grande = variante === "grande";
  switch (formato) {
    case "hevc": // Main, nível 4 (paisagem e retrato) ou 5 (grande)
      return `video/mp4; codecs="hvc1.1.6.L${grande ? 150 : 120}.90"`;
    case "av1": // Main, 8 bits, nível 4.0 ou 5.0
      return `video/mp4; codecs="av01.0.${grande ? 12 : "08"}M.08"`;
    case "mp4":
      return 'video/mp4; codecs="avc1.640028"';
    case "webm":
      return 'video/webm; codecs="vp9"';
  }
}

/**
 * O formato que este browser toca, só pelo `canPlayType`. **H.264 primeiro**:
 * é o que todos os browsers correntes têm, e é descodificado pelo chip — é por
 * isso que corre sem travar. O WebM (VP9) é a rede para os poucos que não têm
 * H.264: o Chromium de código aberto (o dos testes) e alguns Linux.
 *
 * O HEVC e o AV1 NÃO se escolhem por aqui: o `canPlayType` diz «sim» a um
 * formato que o aparelho descodifica no processador (o AV1 no Chrome, em
 * qualquer telemóvel), e aí o vídeo travava. Esses só entram pelo
 * {@link melhorFormato}, que pergunta se o chip os descodifica.
 */
export function formatoQueToca(podeTocar: (tipo: string) => string): Formato | null {
  if (podeTocar(tipoDoFormato("mp4"))) return "mp4";
  if (podeTocar(tipoDoFormato("webm"))) return "webm";
  return null;
}

/** As medidas de cada versão, para perguntar ao aparelho se as toca bem. */
export const MEDIDAS: Record<Variante, { largura: number; altura: number; debito: number }> = {
  paisagem: { largura: 1920, altura: 960, debito: 6_000_000 },
  retrato: { largura: 1080, altura: 1920, debito: 3_000_000 },
  grande: { largura: 2560, altura: 1280, debito: 8_000_000 },
};
export const FOTOGRAMAS_POR_SEGUNDO = 25;

/** A resposta do `navigator.mediaCapabilities.decodingInfo`, só o que conta. */
export interface Capacidade {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}
export type PerguntarAoAparelho = (formato: Formato, variante: Variante) => Promise<Capacidade>;

/**
 * ── O MELHOR FORMATO PARA ESTE APARELHO ─────────────────────────────────────
 * Ela (16/10): «qualidade extraordinária em qualquer dispositivo, com qualquer
 * modo», e sempre fluido. Medido com a mesma floresta, ao mesmo peso
 * (~6 Mbit/s), em SSIM: H.264 0,9832 · HEVC 0,9861 · AV1 0,9882 — o AV1 tem
 * ~30 % menos defeitos que o H.264, o HEVC ~17 %.
 *
 * Mas a qualidade só vale se o vídeo correr sem travar. Por isso pergunta-se
 * ao próprio aparelho (`mediaCapabilities.decodingInfo`) se toca cada um
 * **no chip** (`powerEfficient`) e **sem perder fotogramas** (`smooth`):
 *   1. AV1, se o chip o descodifica e corre liso (iPhone 15 Pro e seguintes,
 *      Macs M3, telemóveis Android recentes, placas gráficas recentes);
 *   2. HEVC, se o chip o descodifica (todos os iPhones, iPads e Macs dos
 *      últimos anos; Windows e Android com o chip para isso);
 *   3. H.264 — o de sempre, que todos descodificam no chip;
 *   4. VP9 — a rede para os browsers sem H.264.
 * Sem a pergunta (browsers antigos), fica o `formatoQueToca`.
 */
export async function melhorFormato(
  podeTocar: (tipo: string) => string,
  perguntar: PerguntarAoAparelho | null,
  variante: Variante,
  webkit = false,
): Promise<Formato | null> {
  const base = formatoQueToca(podeTocar);
  // No WebKit (iPhone, Safari, o Instagram) é o HEVC, sem perguntar: é o
  // formato da casa da Apple, descodificado no chip em todos os iPhones; o
  // AV1 no WebKit é recente. O registo do iPhone dela (17/10) mostrou que a
  // pergunta deixava passar o AV1 — e as imagens presas apareceram com ele.
  if (webkit && podeTocar(tipoDoFormato("hevc", variante))) return "hevc";
  if (!perguntar) return base;
  for (const f of ["av1", "hevc"] as const) {
    if (!podeTocar(tipoDoFormato(f, variante))) continue;
    try {
      const c = await perguntar(f, variante);
      if (c.supported && c.smooth && c.powerEfficient) return f;
    } catch {
      // O aparelho não soube responder: não se arrisca.
    }
  }
  return base;
}

/**
 * ── A VERSÃO GRANDE SÓ SE O CHIP A TOCA ─────────────────────────────────────
 * Ela (29/10): «o site no PC está a travar mesmo imenso, principalmente na
 * parte do vídeo». Num ecrã com muitos píxeis reais (um portátil retina, um
 * monitor 4K) o {@link varianteParaOEcra} escolhe a versão de 2560 px — mais
 * 70 % de píxeis por fotograma do que a de 1920. Um computador que a descodifica
 * no processador, e não no chip, perde fotogramas: é o «travar».
 *
 * Por isso a grande só entra quando o próprio aparelho diz, para o formato já
 * escolhido, que a toca **no chip e sem perder fotogramas**. Sem resposta (um
 * browser sem a pergunta, ou uma resposta que não chega), fica a de 1920: a
 * nitidez a mais nunca vale um fotograma perdido.
 */
export async function grandeVale(
  perguntar: PerguntarAoAparelho | null,
  formato: Formato,
): Promise<boolean> {
  if (!perguntar || formato === "webm") return false; // o WebM não tem grande
  try {
    const c = await perguntar(formato, "grande");
    return c.supported && c.smooth && c.powerEfficient;
  } catch {
    return false;
  }
}

/** {@link varianteParaOEcra}, mas a grande passa a paisagem se o aparelho não a confirmou. */
export function varianteConfirmada(e: Ecra, i: number, grandeConfirmada: boolean): Variante {
  const v = varianteParaOEcra(e, i);
  return v === "grande" && !grandeConfirmada ? "paisagem" : v;
}

/**
 * ── NO COMPUTADOR, UM TAKE À FRENTE E SEM CÓPIAS NA MEMÓRIA ─────────────────
 * O que o iPhone precisa (o ficheiro inteiro na memória, `blob:`, os três
 * takes carregados — ver o cabeçalho de `EntradaEmVideo`) custa caro num
 * computador, e não lhe resolve nada: lá a rede é estável e o ficheiro tem
 * cache de um ano. MEDIDO (29/10, 1920×1080, o site publicado): ler os vídeos
 * para a memória gastou ~0,6 s no fio principal — o mesmo que desenha a
 * página —, com três vídeos de 1920 carregados ao mesmo tempo.
 *
 * No computador o seguinte toca da rede (a cache do browser) e só se prepara
 * um de cada vez, o que vem a seguir. «Computador» é rato (ou trackpad) e um
 * ecrã largo: um iPad com teclado continua no caminho do iPhone.
 */
export function eComputador(ponteiroFino: boolean, largura: number): boolean {
  return ponteiroFino && largura >= 1024;
}

/** A pergunta ao aparelho, feita com o `navigator.mediaCapabilities`. */
export function perguntaDoNavegador(): PerguntarAoAparelho | null {
  const mc = typeof navigator !== "undefined" ? navigator.mediaCapabilities : undefined;
  if (!mc?.decodingInfo) return null;
  return (formato, variante) => {
    const m = MEDIDAS[variante];
    return mc.decodingInfo({
      type: "file",
      video: {
        contentType: tipoDoFormato(formato, variante),
        width: m.largura,
        height: m.altura,
        bitrate: m.debito,
        framerate: FOTOGRAMAS_POR_SEGUNDO,
      },
    });
  };
}

/** De que formato é o ficheiro que o browser escolheu (o `currentSrc`). */
export function formatoDoEndereco(endereco: string): Formato | null {
  if (/-hevc\.mp4$/.test(endereco)) return "hevc";
  if (/-av1\.mp4$/.test(endereco)) return "av1";
  if (/\.webm$/.test(endereco)) return "webm";
  if (/\.mp4$/.test(endereco)) return "mp4";
  return null;
}

export interface Ecra {
  largura: number;
  altura: number;
  /** `devicePixelRatio`. */
  densidade: number;
}

/**
 * A versão para este ecrã: ao alto → `retrato`; deitado e com muitos píxeis
 * reais → `grande` (se este vídeo a tiver); o resto → `paisagem`.
 */
export function varianteParaOEcra(e: Ecra, i: number): Variante {
  if (e.altura > e.largura) return "retrato";
  const temGrande = TEM_GRANDE[i % NUMERO_DE_VIDEOS] ?? false;
  if (temGrande && e.largura * (e.densidade || 1) >= LARGURA_DO_GRANDE) return "grande";
  return "paisagem";
}

/**
 * O endereço de um vídeo (`i` começa em 0). O WebM não tem versão grande.
 * O HEVC e o AV1 são MP4 com o codec no nome: `entrada-1-paisagem-hevc.mp4`.
 */
export function enderecoDoVideo(i: number, variante: Variante, formato: Formato = "mp4"): string {
  const n = i % NUMERO_DE_VIDEOS;
  let v = variante;
  if (v === "grande" && (formato === "webm" || !TEM_GRANDE[n])) v = "paisagem";
  const fim = formato === "hevc" || formato === "av1" ? `-${formato}.mp4` : `.${formato}`;
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-${v}${fim}`;
}

/** O vídeo que vem a seguir pela ordem dos ficheiros: 1 → 2 → 3 → 1. */
export function proximoVideo(i: number): number {
  return (i + 1) % NUMERO_DE_VIDEOS;
}

/** Baralha `lista` (Fisher–Yates) com o `sorteio` dado (0 ≤ x < 1). */
function baralhar(lista: number[], sorteio: () => number): number[] {
  const l = [...lista];
  for (let k = l.length - 1; k > 0; k--) {
    const j = Math.floor(sorteio() * (k + 1));
    [l[k], l[j]] = [l[j], l[k]];
  }
  return l;
}

/**
 * ── A ORDEM VAI MUDANDO ────────────────────────────────────────────────────
 * Ela (16/10): «vai alterando os vídeos para não estarem sempre com a mesma
 * ordem». A primeira volta começa no take de entrada (ver `escolherPrimeiro`),
 * e os outros vêm por uma ordem sorteada. As voltas seguintes são sorteadas
 * inteiras, com uma regra: nunca o mesmo vídeo duas vezes seguidas na passagem
 * de uma volta para a outra.
 */
export function primeiraVolta(primeiro = 0, sorteio: () => number = Math.random): number[] {
  const resto = Array.from({ length: NUMERO_DE_VIDEOS }, (_, k) => k).filter((k) => k !== primeiro);
  return [primeiro, ...baralhar(resto, sorteio)];
}

/**
 * O take da PRIMEIRA visita de sempre: a floresta com o carro. É também o que
 * entra como imagem animada quando o aparelho recusa o vídeo (ver
 * `imagensAnimadas`), e a fotografia da capa é o seu primeiro fotograma.
 */
export const TAKE_DE_ENTRADA = 0;

/** Onde o browser guarda o take com que a pessoa entrou da última vez. */
export const CHAVE_DO_ULTIMO = "liquen-entrada-ultimo";

/**
 * ── O TAKE DE ENTRADA VAI TROCANDO DE VISITA PARA VISITA ───────────────────
 * Ela (16/10, à noite): «coloca outra vez aquela mudança para não estar sempre
 * a aparecer o mesmo vídeo da floresta no início, vai trocando». Volta a
 * alternância que o «sempre a floresta» (#241) tinha tirado — com o pedido dela
 * de antes («pelo menos a primeira vez que se entra no site seja sempre o
 * vídeo da floresta»): a primeira visita de sempre abre na floresta; a partir
 * daí, cada entrada abre num take sorteado que NUNCA é o da entrada anterior.
 *
 * `ultimo` é o que ficou guardado no browser (`null` na primeira visita).
 * O guião que corre no HTML (`EntradaEmVideo.tsx`) faz a mesma conta.
 */
export function escolherPrimeiro(
  ultimo: number | null,
  sorteio: () => number = Math.random,
): number {
  if (ultimo === null || !Number.isInteger(ultimo) || ultimo < 0 || ultimo >= NUMERO_DE_VIDEOS) {
    return TAKE_DE_ENTRADA;
  }
  let n = Math.floor(sorteio() * (NUMERO_DE_VIDEOS - 1));
  if (n >= ultimo) n++;
  return Math.min(n, NUMERO_DE_VIDEOS - 1);
}

/**
 * Quantos segundos antes do fim do take à vista se prepara o seguinte para
 * tocar (descodificar o 1.º fotograma). Já descarregado, é local e leva uma
 * fracção de segundo; fazê-lo cedo de mais punha dois vídeos a descodificar
 * ao mesmo tempo durante o take inteiro.
 */
export const AQUECER_ANTES_S = 3;

/**
 * ── OS SEGUINTES ESPERAM QUE O DE ENTRADA ANDE (decisão dela, 22/10) ───────
 * A auditoria de 22/10, num telemóvel ao alto: nos primeiros 10 s a entrada
 * descarregava ~5,8 MB de vídeo — 3,4 MB do take de entrada e ~2,4 MB dos
 * seguintes, pedidos inteiros para a memória (`blob:`) logo que o de entrada
 * chegava. MEDIDO no Chromium a 12 Mbit/s (390×844): o de entrada fica à
 * vista aos ~2,0 s e os seguintes eram pedidos aos 4,1–5,2 s, ainda com o de
 * entrada nos primeiros dois ou três segundos e a página a acabar de se
 * montar (a fotografia, as letras, o JavaScript). Ela aceitou: «quero fazer
 * isso tudo».
 *
 * O download inteiro antes da vez fica — foi o pedido dela de 16/10, para o
 * vídeo nunca parar. Muda só QUANDO começa: depois de o de entrada ter andado
 * `SEGUINTES_DEPOIS_DE_S` à vista (o tempo do próprio vídeo, não o do
 * relógio: se ele encravar, a conta pára com ele), e num instante em que o
 * browser esteja desocupado (`requestIdleCallback`, no máximo `OCIOSO_MAX_MS`).
 *
 * 5 s porque a passagem para o seguinte começa a 1,5 s do fim e o seguinte é
 * preparado (o 1.º fotograma descodificado) a `AQUECER_ANTES_S` do fim: no take
 * da floresta (18,4 s) ficam 10,4 s para o seguinte (o 2 ou o 3) chegar
 * inteiro — ao alto, 0,6 ou 1,8 MB em WebM, 1,1 ou 3,4 MB em HEVC, 1,8 ou
 * 4,6 MB em H.264. A 4 Mbit/s o maior leva ~9 s; a 12 Mbit/s, ~3 s. Uma rede
 * mais lenta do que isso não passa por esta espera (ver `criarMotor`): é a
 * versão leve, ou o aparelho diz que a ligação é lenta, e fica tudo como era.
 * E se, ainda assim, o seguinte não chegar a tempo, o de entrada REPETE-SE
 * (ver `passar`) — nunca pára.
 */
export const SEGUINTES_DEPOIS_DE_S = 5;

/** O máximo que se espera por um instante desocupado do browser (o `timeout` do `requestIdleCallback`). */
export const OCIOSO_MAX_MS = 1000;

/**
 * A margem que o prazo deixa ao seguinte: do fim do take de entrada para
 * trás, o tempo de o descarregar inteiro numa rede razoável (~7 s), mais
 * `AQUECER_ANTES_S` e o 1,5 s da passagem, arredondado para cima.
 */
export const MARGEM_DOS_SEGUINTES_S = 12;

/**
 * O PRAZO dos seguintes, em ms, contado de quando o take de entrada fica à
 * vista a andar: aconteça o que acontecer (o de entrada encravado, a página
 * fora do ecrã e o vídeo parado, um browser sem `requestIdleCallback` que
 * nunca fica livre), os seguintes começam a descarregar no máximo aqui.
 *
 * É a duração do de entrada menos `MARGEM_DOS_SEGUINTES_S`: a floresta
 * (18,4 s) dá 6,4 s; os takes de 11,6 s e de 4,2 s dão 0 — esses são curtos
 * de mais para esperar, e começam logo, como antes de 22/10. Sem duração
 * conhecida, 0 também: na dúvida, o comportamento de antes.
 */
export function prazoDosSeguintesMs(duracaoDoDeEntrada: number): number {
  if (!Number.isFinite(duracaoDoDeEntrada) || duracaoDoDeEntrada <= 0) return 0;
  return Math.max(0, Math.round((duracaoDoDeEntrada - MARGEM_DOS_SEGUINTES_S) * 1000));
}

/** O máximo que a cortina espera pelo vídeo, além do seu próprio tempo. */
export const CORTINA_ESPERA_MAX_MS = 2500;

/** Uma volta nova, que não começa pelo `ultimo` que tocou. */
export function novaVolta(ultimo: number, sorteio: () => number = Math.random): number[] {
  const ordem = baralhar(
    Array.from({ length: NUMERO_DE_VIDEOS }, (_, k) => k),
    sorteio,
  );
  if (ordem[0] === ultimo && ordem.length > 1) {
    const j = 1 + Math.floor(sorteio() * (ordem.length - 1));
    [ordem[0], ordem[j]] = [ordem[j], ordem[0]];
  }
  return ordem;
}

/**
 * Quanto tempo ANTES da passagem o seguinte recebe ordem de tocar.
 *
 * Ela (16/10): «às vezes pára e não tem que parar» — no telemóvel com dados,
 * com Wi-Fi, e no computador. MEDIDO com um medidor de fotogramas (90 s, CPU
 * ÷4, redes de 4 a 20 Mbit/s, ao alto e no computador): TODAS as paragens
 * eram na passagem. O seguinte recebia `play()` a 0,8 s do fim e só começava
 * a subir quando o descodificador lhe dava o 1.º fotograma — 0,1 a 0,3 s
 * depois (mais, no iPhone, a acordar o descodificador de HEVC). O que saía
 * chegava ao fim antes de a subida acabar, e ficava 200 a 300 ms parado no
 * último fotograma, à vista por baixo do que entrava.
 *
 * Com esta folga, o seguinte arranca 1,5 s antes do fim: quando começa a
 * subir já está a andar, e acaba de subir antes de o outro acabar.
 */
export const ARRANQUE_S = 0.7;

/**
 * Se já é altura de começar a passagem para o vídeo seguinte: quando faltar
 * o tempo da passagem, mais a folga do arranque (`ARRANQUE_S`), para o fim.
 * Assim o seguinte já está inteiro à vista no instante em que este acaba, e
 * nunca se vê o último fotograma parado nem preto.
 */
export function eHoraDePassar(tempo: number, duracao: number): boolean {
  if (!Number.isFinite(duracao) || duracao <= 0) return false;
  return tempo >= duracao - PASSAGEM_MS / 1000 - ARRANQUE_S;
}

/**
 * Quanto dura a subida do seguinte quando ele arrancou tarde: o que falta ao
 * que sai, com um pouco de margem, e nunca menos de 200 ms. Uma subida mais
 * curta não se nota; um fotograma parado por baixo, nota-se.
 */
export function duracaoDaSubida(faltaAoQueSaiS: number): number {
  if (!Number.isFinite(faltaAoQueSaiS)) return PASSAGEM_MS;
  return Math.round(Math.min(PASSAGEM_MS, Math.max(200, faltaAoQueSaiS * 1000 * 0.9)));
}

/**
 * Quanto tempo o vídeo à vista pode ficar sem avançar antes de o vigia agir.
 * Eram 2,5 s: uma paragem inteira à vista antes de alguém fazer alguma coisa.
 */
export const ENCRAVADO_MS = 1200;

/**
 * Quanto tempo o vídeo à vista pode ficar SEM DADOS (o evento `waiting`, a
 * rede não chegou) antes de se passar a um take que já está na memória do
 * aparelho. Esperar pela rede era ficar parado o tempo que ela levasse.
 */
export const SALTAR_SEM_DADOS_MS = 400;

/**
 * ── UMA PASSAGEM NUNCA FICA PRESA ─────────────────────────────────────────
 * Ela (16/10, iPhone, sem poupança de energia): «o vídeo pára» — ao mudar de
 * vídeo e depois de algum tempo, e fica parado de vez. A passagem esperava
 * pelo seguinte sem prazo: se ele nunca arrancasse (o iPhone largou o
 * descodificador ou os dados dele, um `play()` pendurado, um erro no
 * ficheiro), o que sai chegava ao fim e ficava no último fotograma para
 * sempre. Agora, se o seguinte não andar até este tempo depois de o que sai
 * chegar ao fim, a passagem desiste: o que está à vista volta a tocar (em
 * repetição) e o seguinte é refeito do zero para a volta seguinte. Curto de
 * propósito: o seguinte já teve o último 1,5 s do que sai para arrancar, e
 * cada milissegundo daqui é um fotograma parado à vista.
 */
export const PASSAGEM_PRESA_MS = 400;

/**
 * ── A IMAGEM PRESA (O RELÓGIO ANDA, AS IMAGENS NÃO) ──────────────────────
 * Ela (17/10, iPhone): «o vídeo está a andar e depois no meio pára». O registo
 * anónimo mostrou-o em TODOS os iPhones (Safari, Instagram, Chrome): ~1,1 s
 * depois de uma passagem, o vídeo à vista deixa de pintar imagens durante 8 a
 * 10 s — até ao fim do take —, com o relógio a andar, sem pausa e com o
 * ficheiro inteiro na memória. O vigia só olhava para o relógio, que andava, e
 * não fazia nada. Agora conta também os fotogramas pintados
 * (`requestVideoFrameCallback`): sem nenhum durante este tempo, a imagem está
 * presa e o motor destrava-a (ver `criarMotor`). A 25 imagens por segundo são
 * 15 fotogramas seguidos sem nada — nunca acontece num vídeo que anda.
 */
export const IMAGEM_PRESA_MS = 600;

/** O salto para a frente do 1.º degrau do destravar (ver `IMAGEM_PRESA_MS`): 2 fotogramas a 25 por segundo. */
export const SALTO_DE_DESTRAVAR_S = 0.08;

/**
 * Depois de uma passagem, o que saiu acaba sozinho, escondido, se lhe faltar
 * até isto — em vez de o pausar e de lhe pôr o tempo a 0 (o registo do iPhone
 * dela, 17/10: era aí que a imagem do que está à vista prendia).
 */
export const DEIXAR_ACABAR_S = 1.5;

/** Com o aparelho a recusar (poupança de energia), de quanto em quanto se volta a tentar, em silêncio. */
export const TENTAR_DE_NOVO_MS = 3000;

/**
 * ── A VERSÃO LEVE, SÓ PARA ARRANCAR NUMA REDE FRACA ───────────────────────
 * O take de entrada é o único que toca da rede (os seguintes tocam da memória
 * do aparelho). Ao alto, a versão normal pede 4 a 6 Mbit/s; um 4G a perder
 * sinal desce abaixo disso e o vídeo esgota o que tem. A versão leve
 * (`retrato-leve`, ~2 Mbit/s, ~40 % do peso) foi MEDIDA contra o 4K de origem:
 * SSIM 0,983 (HEVC) e 0,981 (H.264), contra 0,989 da normal — num ecrã de
 * telemóvel não se distingue. Só se usa para ARRANCAR quando a rede é fraca;
 * a volta seguinte toca a normal, da memória.
 */
export function enderecoLeve(i: number, formato: "hevc" | "mp4"): string {
  const n = i % NUMERO_DE_VIDEOS;
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-retrato-leve${formato === "hevc" ? "-hevc" : ""}.mp4`;
}

/**
 * ── A FLORESTA COMO IMAGEM ANIMADA (QUANDO O APARELHO RECUSA O VÍDEO) ─────
 * Ela (16/10), num iPhone com a poupança de energia ligada: «quero que mal
 * entremos no site o vídeo corra… sem aparecer botões… nem essas fotos no
 * início». Com a poupança ligada o iPhone recusa QUALQUER vídeo que arranque
 * sem um toque — é uma regra do sistema, para todos os sítios. Imagens
 * animadas, não: por isso, recusado, a floresta entra como imagem animada.
 *
 * Duas, por ordem: o MP4 dentro de um `<img>` (só o Safari/iPhone o toca, e é
 * o de melhor qualidade), e, se esse falhar ou o browser não for o Safari, um
 * WebP animado (todos os browsers de hoje, iPhone incluído desde o iOS 14).
 */
export function enderecoAnimada(i: number, variante: "retrato" | "paisagem"): string {
  const n = i % NUMERO_DE_VIDEOS;
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-${variante}-animada.webp`;
}

/** O tecto de peso de cada WebP animado (o teste dos ficheiros prende-o). */
export const ANIMADA_MAX_BYTES = 6 * 1024 * 1024;

/** As imagens animadas do take `i`, ao alto e deitado (ver `enderecoAnimada`). */
export interface Animadas {
  mp4: [alto: string, deitado: string];
  webp: [alto: string, deitado: string];
}
export function imagensAnimadas(i: number): Animadas {
  return {
    mp4: [enderecoLeve(i, "mp4"), enderecoDoVideo(i, "paisagem", "mp4")],
    webp: [enderecoAnimada(i, "retrato"), enderecoAnimada(i, "paisagem")],
  };
}

/** O que o `navigator.connection` diz (só existe em alguns browsers). */
export interface Ligacao {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

/**
 * A ligação diz-se lenta para a versão normal? (Android/Chrome; o iPhone não
 * tem `navigator.connection` — aí conta a medição do `eRedeLenta`.)
 */
export function ligacaoLenta(l: Ligacao | null | undefined): boolean {
  if (!l) return false;
  if (l.saveData) return true;
  if (l.effectiveType && /(^|-)(2g|3g)$/.test(l.effectiveType)) return true;
  return typeof l.downlink === "number" && l.downlink > 0 && l.downlink < 5;
}

/**
 * Medido no arranque: a rede está a trazer o vídeo mais devagar do que ele se
 * vê? `segundosChegados` é o fim do que já chegou (`buffered`), `ms` o tempo
 * desde que se pediu. Só se decide depois de 1,2 s (antes disso a latência
 * engana), e com menos de 1,3 s de vídeo por cada segundo de espera a versão
 * normal não aguentaria sem parar.
 */
export const MEDIR_REDE_MS = 1200;
export function eRedeLenta(segundosChegados: number, ms: number): boolean {
  if (!(ms >= MEDIR_REDE_MS)) return false;
  return segundosChegados < (ms / 1000) * 1.3;
}
