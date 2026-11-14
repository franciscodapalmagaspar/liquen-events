/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECOLHA DOS PDF ANTIGOS PARA O ARQUIVO DESMONTADO — ensaio por omissão
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `docs/ARQUIVO-DE-PDFS.md`, fase 2. Para cada PDF já guardado em
 * `proposal-pdfs`: descarrega-o, desmonta-o, PROVA que a remontagem dá o mesmo
 * sha256, e (só com `--aplicar`) guarda o desmontado ao lado, no balde
 * `proposal-pdfs-arquivo`. Usa as MESMAS funções do servidor
 * (`src/lib/arquivo-de-pdfs/guardar.ts`): a regra é uma só.
 *
 *   node scripts/arquivo-de-pdfs.mjs              ensaio: mede e prova, NÃO escreve
 *   node scripts/arquivo-de-pdfs.mjs --detalhe    o mesmo, com uma linha por PDF
 *   node scripts/arquivo-de-pdfs.mjs --aplicar    guarda (pára no tecto de 20 MB)
 *
 * Precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente. Não os
 * escrevas na linha de comandos — põe-nos no `.env.local` e usa
 * `set -a; . .env.local; set +a` antes de correr.
 *
 * ── O QUE NUNCA FAZ ───────────────────────────────────────────────────────
 * Não apaga NADA: nem originais, nem imagens, nem esqueletos. Não substitui um
 * ficheiro que já exista. Repetir é seguro (o que já está guardado salta).
 *
 * ── O CUSTO ───────────────────────────────────────────────────────────────
 * Descarrega cada PDF uma vez (a 14/11: 65 PDF, ~138 MB de saída, de 5 GB por
 * mês no plano gratuito). Desmontar e provar: ~25 ms e ~40 ms de processador
 * por PDF de 2 MB, aqui, no computador de quem corre — não na Vercel.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Os módulos do servidor importam sem extensão (`./desmontar`), como o Next
// quer; o Node precisa do `.ts`. Só para os caminhos relativos.
registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (
      /^\.\.?\//.test(especificador) &&
      !/\.[cm]?[jt]s$/.test(especificador) &&
      contexto.parentURL
    ) {
      const candidato = new URL(`${especificador}.ts`, contexto.parentURL);
      if (existsSync(fileURLToPath(candidato))) return seguinte(candidato.href, contexto);
    }
    return seguinte(especificador, contexto);
  },
});

const raiz = new URL("../", import.meta.url);
const { guardarDesmontado, medirOcupacao, TECTO_BYTES } = await import(
  pathToFileURL(fileURLToPath(new URL("src/lib/arquivo-de-pdfs/guardar.ts", raiz))).href
);
const { BUCKET_DO_ARQUIVO } = await import(
  pathToFileURL(fileURLToPath(new URL("src/lib/arquivo-de-pdfs/protegidos.ts", raiz))).href
);

const aplicar = process.argv.includes("--aplicar");
const detalhe = process.argv.includes("--detalhe");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}
const sb = createClient(url, chave, { auth: { persistSession: false } });
const BALDE = "proposal-pdfs";
const MB = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

console.log(`Projecto: ${new URL(url).host}`);
console.log(
  aplicar
    ? "MODO: APLICAR (escreve no arquivo; não apaga nada)"
    : "MODO: ensaio (não escreve nada)",
);

// ── O balde do arquivo ─────────────────────────────────────────────────────
const { data: balde } = await sb.storage.getBucket(BUCKET_DO_ARQUIVO);
if (!balde && aplicar) {
  console.error(
    `O balde «${BUCKET_DO_ARQUIVO}» não existe. Cria-o (privado) no Supabase e volta a correr.`,
  );
  process.exit(1);
}
const ocupacao = balde
  ? await medirOcupacao(sb)
  : { bytes: 0, imagens: new Set(), esqueletos: new Set() };
if (!ocupacao) {
  console.error("Não deu para medir o balde do arquivo.");
  process.exit(1);
}
const antes = ocupacao.bytes;

// ── Os selos: o PDF que seguiu e o aceite, por proposta ────────────────────
const [{ data: propostas }, { data: contratos }] = await Promise.all([
  sb.from("proposals").select("id, pdf_sha256"),
  sb.from("contracts").select("proposal_id, proposta_pdf_sha256"),
]);
const selados = new Set(
  [
    ...(propostas ?? []).map((p) => p.pdf_sha256),
    ...(contratos ?? []).map((c) => c.proposta_pdf_sha256),
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase()),
);

// ── Os PDF guardados ───────────────────────────────────────────────────────
const { data: raizDoBalde, error: erroRaiz } = await sb.storage
  .from(BALDE)
  .list("", { limit: 1000 });
if (erroRaiz || !raizDoBalde) {
  console.error("Não deu para listar proposal-pdfs:", erroRaiz?.message);
  process.exit(1);
}
const ficheiros = [];
for (const pasta of raizDoBalde.filter((e) => !e.id).map((e) => e.name)) {
  const { data } = await sb.storage.from(BALDE).list(pasta, { limit: 1000 });
  for (const f of data ?? []) {
    if (f.id && f.name.endsWith(".pdf")) ficheiros.push({ pasta, nome: f.name });
  }
}

const registo = { info: () => {}, warn: (m, d) => detalhe && console.warn(`  ! ${m}`, d ?? "") };
const contagem = {};
let original = 0;
let acrescentado = 0;
let comSelo = 0;
let provaram = 0;
const falharam = [];
for (const [i, f] of ficheiros.entries()) {
  const { data, error } = await sb.storage.from(BALDE).download(`${f.pasta}/${f.nome}`);
  if (error || !data) {
    falharam.push(`${f.pasta}/${f.nome} (não desceu)`);
    continue;
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const resumo = sha256(bytes);
  if (selados.has(resumo)) comSelo++;
  const r = await guardarDesmontado(sb, registo, f.pasta, f.nome.replace(/\.pdf$/, ""), bytes, {
    ocupacao,
    ensaio: !aplicar,
    // No ensaio mede-se TUDO; a escrever, pára no tecto.
    tecto: aplicar ? TECTO_BYTES : Number.POSITIVE_INFINITY,
  });
  contagem[r.estado] = (contagem[r.estado] ?? 0) + 1;
  original += bytes.length;
  if (r.estado === "guardado" || r.estado === "ja-estava") provaram++;
  else if (r.estado === "prova-falhou") falharam.push(`${f.pasta}/${f.nome} (prova)`);
  if (r.estado === "guardado") acrescentado += r.bytesNovos;
  if (detalhe) {
    console.log(
      `${String(i + 1).padStart(3)} ${f.pasta}/${f.nome.slice(0, 12)}… ${MB(bytes.length)} ` +
        `→ ${r.estado}, ${r.imagens} imagens (${r.imagensJaGuardadas} já guardadas), +${MB(r.bytesNovos)}`,
    );
  }
  if (aplicar && r.estado === "tecto") {
    console.log("Chegou ao tecto de 20 MB: parou aqui. Nada foi apagado.");
    break;
  }
}

const depois = ocupacao.bytes;
console.log("");
console.log(
  `PDF em ${BALDE}: ${ficheiros.length} (${MB(original)}); ${comSelo} batem com um selo (enviado/aceite).`,
);
console.log(`Provaram (remontagem = sha256 do original): ${provaram} de ${ficheiros.length}.`);
if (falharam.length) console.log(`Falharam: ${falharam.length}\n  ${falharam.join("\n  ")}`);
console.log(`Estados: ${JSON.stringify(contagem)}`);
console.log(
  `O arquivo desmontado ${aplicar ? "ficou com" : "ficaria com"}: ${MB(depois)} (antes: ${MB(antes)}; +${MB(acrescentado)}).`,
);
console.log(
  `Espaço a MAIS agora (os originais ficam): ${MB(depois - antes)} — tecto ${MB(TECTO_BYTES)}.`,
);
if (!aplicar && depois > TECTO_BYTES) {
  console.log(`  → passa do tecto: com --aplicar, pára aos ${MB(TECTO_BYTES)}.`);
}
console.log(
  `Se um dia os originais saíssem (fase 3, com autorização): ${MB(original)} → ${MB(depois)}, ` +
    `poupança de ${MB(original - depois)} (${original ? Math.round((1 - depois / original) * 100) : 0} %).`,
);
