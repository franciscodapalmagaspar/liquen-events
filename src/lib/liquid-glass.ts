/**
 * ════════════════════════════════════════════════════════════════════════════
 * LIQUID GLASS — refracção a sério, e não mais um desfoque
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O motor é dela. Chegou como `liquid-glass.js`, sem dependências, a acompanhar
 * o documento que está em `docs/LIQUID-GLASS.md` — e a Parte 1 desse documento é
 * o diagnóstico do que o back office tinha:
 *
 *     backdrop-filter: blur(20px) saturate(180%);
 *
 * Isso é «frosted glass», a linguagem do iOS 7 ao 18. O `blur()` BORRA; não
 * ENTORTA. Num vidro a sério a superfície é curva junto à aresta e o fundo
 * dobra ali, e é essa dobra que o olho lê como espessura. Sem ela, o painel
 * lê-se como papel vegetal colado ao ecrã — que é exactamente o que ela viu
 * quando escreveu «nada está igual em termos de design».
 *
 * ── O QUE ESTE FICHEIRO FAZ, EM TRÊS PASSOS ──────────────────────────────
 *
 *  1. **SDF do rectângulo de cantos redondos.** Para cada ponto, a distância
 *     com sinal à fronteira — negativa dentro, zero na aresta.
 *
 *  2. **Mapa de deslocamento.** Na faixa do bisel (`−bisel < d < 0`), a normal
 *     é `∇d` normalizado e a magnitude segue o perfil. R guarda o x, G o y, com
 *     128 a significar zero. O centro fica exactamente a 128,128 — vidro limpo.
 *
 *  3. **`feDisplacementMap`** com esse mapa dentro do `backdrop-filter`, com
 *     `scale = força × 2` (o deslocamento é `scale × (canal − 0,5)`).
 *
 * ── PORQUE É QUE O MAPA SE MONTA EM NOVE PEDAÇOS ─────────────────────────
 *
 * Construí-lo píxel a píxel custa 5 ms numa barra de 900×52 e 40 ms numa folha
 * de 720×520 — inaceitável para animar. Mas o mapa de um rectângulo destes é
 * 9-`sliceable`: ao longo de uma aresta recta só varia na perpendicular, e por
 * isso esticá-lo PARALELAMENTE à aresta é exacto e não uma aproximação. Ela
 * mediu a diferença entre os dois: máxima de 1/255, média 0,10, e o custo cai
 * para ~3,5 ms independente do tamanho.
 *
 * ── SÓ O CHROMIUM É QUE FAZ ISTO, E ISSO NÃO SE ESCONDE ──────────────────
 *
 * Filtros SVG dentro de `backdrop-filter` só funcionam em motores Chromium. O
 * Safari e o Firefox ignoram a declaração INTEIRA — não degrada sozinha, some.
 * Por isso `suportado()` pergunta antes, e quem não puder leva um desfoque mais
 * forte com o rebordo especular. A instrução dela é para levar a sério: «não
 * escondas isto ao testar: abre no Safari e confirma que o alternativo é bonito
 * por si».
 *
 * ── O QUE FICOU DE FORA, E PORQUÊ ────────────────────────────────────────
 *
 * O ficheiro dela traz também um `cluster()` — vários vidros que se fundem como
 * mercúrio, por `smooth-minimum` de SDFs, que é o `GlassEffectContainer` da
 * Apple. Não está aqui porque ainda não há superfície nenhuma que se funda: a
 * Parte 7 manda aplicar **a uma superfície só** primeiro, e código que nada
 * chama é código que ninguém corrige quando se parte. O algoritmo está por
 * inteiro na Parte 4.4 do documento, para quem montar a primeira.
 */

/** Os perfis do bisel. O `bezel` é o que mais se aproxima da Apple. */
export type PerfilDoBisel = "bezel" | "lens" | "soft";

export interface OpcoesDoVidro {
  /** A largura da faixa onde o fundo dobra, em px. */
  bezel: number;
  /**
   * Quanto dobra. **Acima de 20 o fundo deixa de se reconhecer** e o vidro passa
   * a chamar mais atenção do que o conteúdo — é o erro mais comum de quem
   * descobre o efeito, e está escrito assim na Parte 3.
   */
  strength: number;
  profile: PerfilDoBisel;
  blur: number;
  saturate: number;
  brightness: number;
  /**
   * Refazer o mapa enquanto a forma transita. Sem isto, o vidro fica com a
   * refracção da forma ANTIGA enquanto a forma nova já lá está — e é esse
   * desencontro que denuncia o truque.
   *
   * Desliga-se com `prefers-reduced-motion`: é um laço de `requestAnimationFrame`,
   * que é precisamente o que essa preferência proíbe.
   */
  live: boolean;
}

export interface Vidro {
  /** Remede e redesenha. Barato quando nada mudou de tamanho. */
  update(): void;
  /** Redesenha a cada frame durante `ms` — para acompanhar uma transformação. */
  track(ms?: number): void;
  set<K extends keyof OpcoesDoVidro>(k: K, v: OpcoesDoVidro[K]): void;
  destroy(): void;
}

const NS = "http://www.w3.org/2000/svg";

let uid = 0;
let defs: SVGDefsElement | null = null;

/** Cache de cantos por (raio, bisel, perfil, dpr). */
const tiles = new Map<string, { canvas: HTMLCanvasElement; K: number; dpr: number }>();

/**
 * O mapa é um campo suave — o `feImage` interpola — portanto não precisa da
 * resolução do ecrã; precisa de bisel suficiente. Limitar o lado maior a 600 px
 * mantém a codificação PNG abaixo de 1 ms em qualquer superfície.
 */
function mapScale(W: number, H: number, b: number): number {
  const cap = Math.min(1, 600 / Math.max(W, H));
  const piso = Math.min(1, 10 / Math.max(b, 1)); // >= 10 px de bisel
  return Math.max(cap, piso, 0.25);
}

function svgDefs(): SVGDefsElement {
  if (defs && defs.isConnected) return defs;
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("aria-hidden", "true");
  s.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none";
  defs = document.createElementNS(NS, "defs");
  s.appendChild(defs);
  document.body.appendChild(s);
  return defs;
}

/**
 * A distância com sinal à fronteira de um rectângulo `w × h` de raio `r`.
 * Negativa dentro, zero na aresta, positiva fora.
 */
export function sdf(x: number, y: number, w: number, h: number, r: number): number {
  const px = Math.abs(x - w / 2) - (w / 2 - r);
  const py = Math.abs(y - h / 2) - (h / 2 - r);
  const qx = px > 0 ? px : 0;
  const qy = py > 0 ? py : 0;
  return Math.sqrt(qx * qx + qy * qy) + Math.min(Math.max(px, py), 0) - r;
}

function profileFn(p: PerfilDoBisel): (t: number) => number {
  if (p === "lens") return (t) => Math.sqrt(Math.max(0, 1 - t * t));
  if (p === "soft") return (t) => Math.pow(1 - t, 3);
  return (t) => Math.pow(1 - t, 2.2);
}

/** Escreve um par (dx, dy) normalizado nos canais R e G, com 128 a ser zero. */
function escreverDeslocamento(d: Uint8ClampedArray, i: number, dx: number, dy: number): void {
  d[i] = (128 + dx * 127) | 0;
  d[i + 1] = (128 + dy * 127) | 0;
  d[i + 2] = 128;
  d[i + 3] = 255;
}

/**
 * Canvas de referência 2K×2K: os quatro quadrantes são exactamente os quatro
 * cantos, e a coluna/linha central é o perfil da aresta recta. Construído uma
 * vez por (raio, bisel, perfil, dpr) e guardado.
 */
function refTile(r: number, b: number, prof: PerfilDoBisel, dpr: number) {
  const key = `${r}|${b}|${prof}|${dpr}`;
  const hit = tiles.get(key);
  if (hit) return hit;

  const K = Math.ceil(Math.max(r, b) + 2);
  const S = K * 2;
  const SD = Math.round(S * dpr);
  const c = document.createElement("canvas");
  c.width = SD;
  c.height = SD;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(SD, SD);
  const d = img.data;
  const f = profileFn(prof);

  for (let y = 0; y < SD; y++) {
    for (let x = 0; x < SD; x++) {
      const i = (y * SD + x) * 4;
      const fx = (x + 0.5) / dpr;
      const fy = (y + 0.5) / dpr;
      const dd = sdf(fx, fy, S, S, r);
      let dx = 0;
      let dy = 0;
      if (dd < 0 && dd > -b) {
        const gx = sdf(fx + 0.5, fy, S, S, r) - sdf(fx - 0.5, fy, S, S, r);
        const gy = sdf(fx, fy + 0.5, S, S, r) - sdf(fx, fy - 0.5, S, S, r);
        const gl = Math.hypot(gx, gy) || 1;
        const m = f(-dd / b);
        dx = (gx / gl) * m;
        dy = (gy / gl) * m;
      }
      escreverDeslocamento(d, i, dx, dy);
    }
  }

  ctx.putImageData(img, 0, 0);
  const t = { canvas: c, K, dpr };
  tiles.set(key, t);
  return t;
}

/** O mapa píxel a píxel. Só para superfícies pequenas demais para os nove pedaços. */
function directMap(
  W: number,
  H: number,
  r: number,
  b: number,
  prof: PerfilDoBisel,
  dpr: number,
): string {
  const Wd = Math.max(1, Math.round(W * dpr));
  const Hd = Math.max(1, Math.round(H * dpr));
  const c = document.createElement("canvas");
  c.width = Wd;
  c.height = Hd;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(Wd, Hd);
  const d = img.data;
  const f = profileFn(prof);

  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const i = (y * Wd + x) * 4;
      const fx = (x + 0.5) / dpr;
      const fy = (y + 0.5) / dpr;
      const dd = sdf(fx, fy, W, H, r);
      let dx = 0;
      let dy = 0;
      if (dd < 0 && dd > -b) {
        const gx = sdf(fx + 0.5, fy, W, H, r) - sdf(fx - 0.5, fy, W, H, r);
        const gy = sdf(fx, fy + 0.5, W, H, r) - sdf(fx, fy - 0.5, W, H, r);
        const gl = Math.hypot(gx, gy) || 1;
        const m = f(-dd / b);
        dx = (gx / gl) * m;
        dy = (gy / gl) * m;
      }
      escreverDeslocamento(d, i, dx, dy);
    }
  }

  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * O mapa `W×H`, montado a partir do canto de referência: quatro cantos e quatro
 * tiras esticadas. Esticar uma aresta recta é EXACTO — o mapa só varia na
 * perpendicular.
 */
export function buildMap(
  W: number,
  H: number,
  r: number,
  b: number,
  prof: PerfilDoBisel = "bezel",
): string {
  r = Math.max(0, Math.min(r, W / 2, H / 2));
  const dpr = mapScale(W, H, Math.min(b, W / 2, H / 2));
  b = Math.max(1, Math.min(b, W / 2, H / 2));
  const Wd = Math.max(1, Math.round(W * dpr));
  const Hd = Math.max(1, Math.round(H * dpr));

  const out = document.createElement("canvas");
  out.width = Wd;
  out.height = Hd;
  const g = out.getContext("2d")!;
  // O fundo é vidro limpo: 128,128 é deslocamento zero.
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, Wd, Hd);

  const t = refTile(r, b, prof, dpr);
  const K = t.K;
  const Kd = Math.round(K * dpr);
  const src = t.canvas;

  // Pequena demais para ter arestas rectas: os nove pedaços não têm o que esticar.
  if (W < 2 * K || H < 2 * K) return directMap(W, H, r, b, prof, dpr);

  g.imageSmoothingEnabled = false;
  // Os quatro cantos.
  g.drawImage(src, 0, 0, Kd, Kd, 0, 0, Kd, Kd);
  g.drawImage(src, Kd, 0, Kd, Kd, Wd - Kd, 0, Kd, Kd);
  g.drawImage(src, 0, Kd, Kd, Kd, 0, Hd - Kd, Kd, Kd);
  g.drawImage(src, Kd, Kd, Kd, Kd, Wd - Kd, Hd - Kd, Kd, Kd);
  // As quatro arestas: 1 px de origem esticado ao longo do lado.
  const span = Wd - 2 * Kd;
  const spanY = Hd - 2 * Kd;
  if (span > 0) {
    g.drawImage(src, Kd, 0, 1, Kd, Kd, 0, span, Kd);
    g.drawImage(src, Kd, Kd, 1, Kd, Kd, Hd - Kd, span, Kd);
  }
  if (spanY > 0) {
    g.drawImage(src, 0, Kd, Kd, 1, 0, Kd, Kd, spanY);
    g.drawImage(src, Kd, Kd, Kd, 1, Wd - Kd, Kd, Kd, spanY);
  }
  return out.toDataURL();
}

/**
 * Este motor precisa de filtros SVG dentro do `backdrop-filter`, e isso é
 * Chromium e mais nada. No servidor não há `CSS` nenhum para perguntar.
 */
export function suportado(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return CSS.supports("backdrop-filter", "url(#a)");
}

const PADRAO: OpcoesDoVidro = {
  bezel: 16,
  strength: 14,
  profile: "bezel",
  blur: 2,
  saturate: 1.5,
  brightness: 1.02,
  live: true,
};

/**
 * Põe vidro num elemento. Devolve o comando para o mexer e o para o desfazer —
 * e o segundo não é opcional: um `<Glass>` que desmonta sem `destroy()` deixa um
 * `<filter>` pendurado no `<defs>` por cada vez que a vista abriu.
 */
export function attach(el: HTMLElement, opts?: Partial<OpcoesDoVidro>): Vidro {
  const o: OpcoesDoVidro = { ...PADRAO, ...opts };

  if (!suportado()) {
    // Safari e Firefox. Desfoque mais forte, que continua a ser melhor do que o
    // que lá estava — e o rebordo especular faz o resto, em CSS.
    el.style.backdropFilter = `blur(${o.blur + 10}px) saturate(${o.saturate + 0.2})`;
    el.style.setProperty("-webkit-backdrop-filter", `blur(${o.blur + 10}px)`);
    el.dataset.lgFallback = "true";
    return {
      update() {},
      track() {},
      set() {},
      destroy() {
        el.style.backdropFilter = "";
        el.style.removeProperty("-webkit-backdrop-filter");
        delete el.dataset.lgFallback;
      },
    };
  }

  const id = `lg${++uid}`;
  const f = document.createElementNS(NS, "filter");
  f.setAttribute("id", id);
  f.setAttribute("filterUnits", "userSpaceOnUse");
  f.setAttribute("color-interpolation-filters", "sRGB");
  const fe = document.createElementNS(NS, "feImage");
  fe.setAttribute("result", "map");
  fe.setAttribute("preserveAspectRatio", "none");
  const fd = document.createElementNS(NS, "feDisplacementMap");
  fd.setAttribute("in", "SourceGraphic");
  fd.setAttribute("in2", "map");
  fd.setAttribute("xChannelSelector", "R");
  fd.setAttribute("yChannelSelector", "G");
  f.append(fe, fd);
  svgDefs().appendChild(f);

  let lw = -1;
  let lh = -1;
  let lr = -1;
  let queued = false;

  function paint() {
    queued = false;
    const rc = el.getBoundingClientRect();
    const w = Math.round(rc.width);
    const h = Math.round(rc.height);
    if (!w || !h) return;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    // Nada mudou de forma: refazer o mapa era queimar 3 ms por frame para nada.
    if (w === lw && h === lh && r === lr) return;
    lw = w;
    lh = h;
    lr = r;
    f.setAttribute("x", "0");
    f.setAttribute("y", "0");
    f.setAttribute("width", String(w));
    f.setAttribute("height", String(h));
    fe.setAttribute("x", "0");
    fe.setAttribute("y", "0");
    fe.setAttribute("width", String(w));
    fe.setAttribute("height", String(h));
    fe.setAttribute("href", buildMap(w, h, r, o.bezel, o.profile));
    fd.setAttribute("scale", String(o.strength * 2));
    el.style.backdropFilter = `url(#${id}) blur(${o.blur}px) saturate(${o.saturate}) brightness(${o.brightness})`;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  paint();

  /**
   * Enquanto a forma se transforma, o mapa acompanha frame a frame: é isto que
   * faz o vidro parecer líquido em vez de uma imagem parada.
   */
  let raf = 0;
  function track(ms?: number) {
    cancelAnimationFrame(raf);
    const fim = performance.now() + (ms || 700);
    (function loop() {
      paint();
      if (performance.now() < fim) raf = requestAnimationFrame(loop);
    })();
  }

  /* Só as transições DO PRÓPRIO vidro: o `transitionrun` borbulha, e o
     `hover` de cada botão lá dentro arrancava 900 ms de remedições a uma
     superfície que não mudou de forma. */
  const aoTransitar = (e: Event) => {
    if (e.target === el) track(900);
  };
  const aoAcabar = (e: Event) => {
    if (e.target === el) paint();
  };
  if (o.live) {
    el.addEventListener("transitionrun", aoTransitar);
    el.addEventListener("transitionend", aoAcabar);
  }

  return {
    update: paint,
    track,
    set(k, v) {
      o[k] = v;
      lw = -1; // força o redesenho: a forma é a mesma, o material é que mudou
      paint();
    },
    destroy() {
      ro.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener("transitionrun", aoTransitar);
      el.removeEventListener("transitionend", aoAcabar);
      f.remove();
      el.style.backdropFilter = "";
    },
  };
}

export interface OpcoesDoReflexo {
  /**
   * Quem leva reflexo, dentro do âmbito — ou `null` para ser o PRÓPRIO âmbito.
   *
   * O `null` não é um atalho: `querySelectorAll` só olha para DESCENDENTES, e
   * por isso `el.querySelectorAll(":scope")` devolve uma lista vazia. Uma
   * superfície de vidro única — uma barra, um cartão — pedia o reflexo com essa
   * expressão, não recebia erro nenhum, e ficava simplesmente sem ele. É a
   * armadilha exacta que este `null` fecha.
   */
  selector: string | null;
  /** A que distância o ponteiro ainda acende a superfície, em px. */
  radius: number;
}

/**
 * O reflexo especular que segue o ponteiro — o que faz o vidro parecer vivo.
 *
 * Uma borda branca de 1 px uniforme lê-se como CAIXA. O reflexo da Apple tem
 * lado: forte de onde vem a luz, apagado do lado oposto, e muda quando o
 * elemento se move. No iOS acompanha o giroscópio; no macOS é fixo relativo à
 * janela. Na web, ligá-lo ao ponteiro é a tradução honesta.
 *
 * Escreve `--lg-angle` e `--lg-lux`; quem desenha o rebordo lê-os no CSS.
 * Devolve o desligar.
 */
export function specular(scope: HTMLElement, opts?: Partial<OpcoesDoReflexo>): () => void {
  const o: OpcoesDoReflexo = { selector: ".lg", radius: 420, ...opts };
  const alvos = (): HTMLElement[] =>
    o.selector === null ? [scope] : [...scope.querySelectorAll<HTMLElement>(o.selector)];
  function onMove(e: PointerEvent) {
    alvos().forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const perto = Math.max(0, 1 - dist / (o.radius + Math.max(r.width, r.height)));
      el.style.setProperty("--lg-angle", `${ang.toFixed(1)}deg`);
      el.style.setProperty("--lg-lux", (0.35 + perto * 0.65).toFixed(3));
    });
  }
  scope.addEventListener("pointermove", onMove);
  return () => scope.removeEventListener("pointermove", onMove);
}
