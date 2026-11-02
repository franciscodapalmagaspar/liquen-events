/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PLACEHOLDER DESFOCADO ESTÁ LÁ — MAS VÊ-SE?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/ver-placeholder-galeria.mjs [url-base]
 *
 * DESDE 2/11 a grelha não tem desfocado nenhum (pedido dela): cada foto espera
 * sobre a cor média do mosaico e entra com `g-foto`. Com isso, `temBlur` sai
 * sempre falso e o que este guião ainda diz de útil é a opacidade e a cor de
 * fundo de cada mosaico à espera.
 *
 * Todas as sondas de placeholder desta pasta contam a MESMA coisa: quantos
 * <img> têm um 'background-image: url(data:image/...)' com o blur. Nenhuma
 * pergunta se esse blur chega aos olhos de alguém.
 *
 * A pergunta importa porque o CSS da galeria é este:
 *
 *     .g-foto        { opacity: 0; }
 *     .g-foto-pronta { opacity: 1; transition: opacity .25s; }
 *
 * e a classe 'g-foto' é posta NO MESMO <img> que leva o blur no seu
 * 'background-image'. O 'opacity' de um elemento aplica-se ao elemento INTEIRO,
 * fundo incluído. Se for isso que está a acontecer, o visitante que espera não
 * vê a fotografia desfocada: vê o '#12160f' do '.g-tile' por baixo.
 *
 * Isto mede exactamente isso, sem inferir nada do código: para cada mosaico
 * cuja fotografia ainda não carregou, lê o 'opacity' COMPUTADO do <img>, se o
 * blur está lá, e a cor de fundo do mosaico.
 */
import { chromium, devices } from "playwright";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3100";
const REDE_4G_LENTO = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const PERFIS = [
  { nome: "telemovel", contexto: { ...devices["Pixel 7"], deviceScaleFactor: 3 } },
  {
    nome: "secretaria",
    contexto: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
];

const LER = `
(() => {
  const h = window.innerHeight;
  const out = { aEsperar: [], jaCarregadas: [] };
  for (const t of document.querySelectorAll("[data-tile-idx]")) {
    const c = t.getBoundingClientRect();
    const noEcra = c.bottom > 0 && c.top < h && c.height > 0;
    const im = t.querySelector("img");
    if (!im) continue;
    const cs = getComputedStyle(im);
    const reg = {
      idx: t.getAttribute("data-tile-idx"),
      noEcra,
      carregada: !!(im.complete && im.naturalWidth > 0),
      temBlur: /data:image/.test(im.style.backgroundImage || ""),
      opacidade: cs.opacity,
      classes: im.className.split(" ").filter((x) => x.startsWith("g-")).join(" "),
      fundoDoTile: getComputedStyle(t).backgroundColor,
    };
    (reg.carregada ? out.jaCarregadas : out.aEsperar).push(reg);
  }
  return out;
})()
`;

const browser = await chromium.launch();
for (const perfil of PERFIS) {
  const ctx = await browser.newContext({ ...perfil.contexto });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", REDE_4G_LENTO);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`${BASE}/galeria`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  console.log(`\n═══ ${perfil.nome.toUpperCase()} ═══`);

  // A grelha começa abaixo da dobra nos dois perfis, por isso não basta abrir a
  // página: é preciso pô-la no ecrã para se medir o que o visitante vê nela.
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const t = document.querySelector("[data-tile-idx]");
    if (t)
      window.scrollTo({
        top: t.getBoundingClientRect().top + window.scrollY - 100,
        behavior: "instant",
      });
  });

  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(400);
    const r = await page.evaluate(LER);
    const t = await page.evaluate(() => Math.round(performance.now()));
    const noEcra = [...r.aEsperar, ...r.jaCarregadas].filter((x) => x.noEcra);
    const aEsp = noEcra.filter((x) => !x.carregada);
    const opac = noEcra.reduce((m, x) => ((m[x.opacidade] = (m[x.opacidade] || 0) + 1), m), {});
    // O que o visitante vê num mosaico: fotografia (opaca e carregada), blur
    // (opaca e ainda sem foto), ou o fundo do .g-tile (opacidade 0).
    let veFoto = 0,
      veBlur = 0,
      veFundo = 0;
    for (const x of noEcra) {
      const op = Number(x.opacidade);
      if (op < 0.05) veFundo++;
      else if (x.carregada) veFoto++;
      else if (x.temBlur) veBlur++;
      else veFundo++;
    }
    console.log(
      `  t=${String(t).padStart(5)} ms  no ecrã ${String(noEcra.length).padStart(2)} · ` +
        `à espera ${String(aEsp.length).padStart(2)} · opacidades ${JSON.stringify(opac)} · ` +
        `VÊ: foto ${veFoto} / blur ${veBlur} / fundo liso ${veFundo}`,
    );
    if (i === 13) {
      console.log("  ── mosaicos presos (foto descarregada, <img> a opacidade 0) ──");
      for (const x of noEcra.filter((y) => Number(y.opacidade) < 0.05)) {
        console.log(
          `    idx ${String(x.idx).padStart(3)}  descarregada=${x.carregada}  ` +
            `blur=${x.temBlur}  classes="${x.classes}"  fundo do tile ${x.fundoDoTile}`,
        );
      }
    }
  }
  await ctx.close();
}
await browser.close();
