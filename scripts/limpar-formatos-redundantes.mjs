/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM FICHEIRO POR TAMANHO — apagar a AVIF que repete a WebP/JPEG ao lado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até 13/11 cada fotografia da Biblioteca nascia, em cada tamanho, também em
 * AVIF, num bucket à parte: `theme-avif` (400 px), `theme-avif-micro` (96),
 * `theme-avif-medias` (1200) e, nas propostas, `proposal-avif-medias` (1200).
 * A mesma fotografia, ao mesmo tamanho, duas vezes. Desde 14/11 já não se
 * fabricam nem se lêem (`src/lib/derivadas.ts`, «E JÁ NÃO HÁ AVIF AO LADO»).
 * Este guião apaga as que ficaram.
 *
 *   node scripts/limpar-formatos-redundantes.mjs             ENSAIO: lista e soma
 *   node scripts/limpar-formatos-redundantes.mjs --lista     ensaio, com cada caminho
 *   node scripts/limpar-formatos-redundantes.mjs --apagar    apaga de facto
 *
 * Precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente. **Não os
 * escrevas na linha de comandos onde ficam no histórico** — põe-nos no
 * `.env.local` e usa `set -a; . .env.local; set +a` antes de correr.
 *
 * ── SÓ SAI O QUE TEM O IRMÃO, E NUNCA A CAPA ─────────────────────────────
 * Uma AVIF só é apagada quando o ficheiro que FICA existe de facto, com bytes,
 * no bucket irmão e com a mesma chave (`theme-avif/<t>/<x>.jpg` só sai se
 * `theme-thumbs/<t>/<x>.jpg` lá estiver). E o irmão volta a ser confirmado
 * imediatamente antes de cada lote apagado — não só na contagem do início.
 *
 * FICAM sempre, por decisão dela (27/10: «sim, avança com a capa em AVIF»):
 *   · a AVIF grande da capa da proposta online (`<x>.capa.avif`) — é o ÚNICO
 *     ficheiro desse tamanho (2000 px), não tem irmão a repetir;
 *   · a AVIF de 1200 de uma fotografia que tem essa capa grande — é a que o
 *     telemóvel recebe na capa.
 *
 * ── QUANDO CORRER ─────────────────────────────────────────────────────────
 * Só DEPOIS de o código de 14/11 estar publicado: é ele que deixa de oferecer
 * estas AVIF (sem isso, um `<source type="image/avif">` para um ficheiro
 * apagado dá 404, e o navegador NÃO recua para o `<img>`). O retrato da
 * proposta online subiu para a versão 11 no mesmo commit, por isso nenhum
 * retrato antigo é lido. Por prudência, espera-se um dia depois da
 * publicação (as listas de temas em cache levam endereços de 6 h).
 *
 * As fotografias não têm cópia destes bytes — mas estas são DERIVADAS: se uma
 * fizer falta, refaz-se a partir do original.
 */

import { pathToFileURL } from "node:url";

/** O bucket que se esvazia → o bucket que fica, com a mesma chave. */
export const PARES = [
  { redundante: "theme-avif", fica: "theme-thumbs" },
  { redundante: "theme-avif-micro", fica: "theme-micro" },
  { redundante: "theme-avif-medias", fica: "theme-medias" },
  { redundante: "proposal-avif-medias", fica: "proposal-medias" },
];

/** O sufixo da AVIF grande da capa (`SUFIXO_DA_CAPA_WEB`, `proposal-assinaturas.ts`). */
export const SUFIXO_DA_CAPA = ".capa.avif";

/**
 * O plano de um bucket redundante (puro — testado).
 *
 * @param {{ caminho: string, bytes: number }[]} objectos  o que há no bucket redundante
 * @param {Map<string, number>} irmaos  caminho → bytes, no bucket que fica
 * @returns {{ apagar: { caminho: string, bytes: number }[],
 *             ficam: { caminho: string, bytes: number, motivo: "capa" | "media-da-capa" | "sem-irmao" }[] }}
 */
export function planoDeLimpeza(objectos, irmaos) {
  const todos = new Set(objectos.map((o) => o.caminho));
  const apagar = [];
  const ficam = [];
  for (const o of objectos) {
    if (o.caminho.endsWith(SUFIXO_DA_CAPA)) {
      ficam.push({ ...o, motivo: "capa" });
    } else if (todos.has(o.caminho + SUFIXO_DA_CAPA)) {
      ficam.push({ ...o, motivo: "media-da-capa" });
    } else if ((irmaos.get(o.caminho) ?? 0) > 0) {
      apagar.push(o);
    } else {
      ficam.push({ ...o, motivo: "sem-irmao" });
    }
  }
  return { apagar, ficam };
}

/** Os MB de uma lista, com uma casa decimal. */
export function megas(lista) {
  return Math.round(lista.reduce((s, o) => s + (o.bytes || 0), 0) / 104857.6) / 10;
}

const PAGINA = 1000;

/** Todos os ficheiros de um bucket (pastas de um nível, como as derivadas). */
async function listarTudo(sb, bucket) {
  const out = [];
  const pastas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await sb.storage.from(bucket).list("", { limit: PAGINA, offset });
    if (error) {
      // Um bucket que não existe não tem nada a limpar.
      if (/not.?found/i.test(error.message)) return out;
      throw new Error(`${bucket}: ${error.message}`);
    }
    for (const e of data ?? []) {
      if (e.id) out.push({ caminho: e.name, bytes: Number(e.metadata?.size) || 0 });
      else pastas.push(e.name);
    }
    if ((data ?? []).length < PAGINA) break;
  }
  for (const pasta of pastas) out.push(...(await listarPasta(sb, bucket, pasta)));
  return out;
}

async function listarPasta(sb, bucket, pasta) {
  const out = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await sb.storage.from(bucket).list(pasta, { limit: PAGINA, offset });
    if (error) throw new Error(`${bucket}/${pasta}: ${error.message}`);
    for (const e of data ?? []) {
      if (e.id) out.push({ caminho: `${pasta}/${e.name}`, bytes: Number(e.metadata?.size) || 0 });
    }
    if ((data ?? []).length < PAGINA) return out;
  }
}

/** Os irmãos das pastas que interessam, e só dessas. */
async function irmaosDe(sb, bucket, caminhos) {
  const pastas = [
    ...new Set(caminhos.map((c) => (c.includes("/") ? c.slice(0, c.indexOf("/")) : ""))),
  ];
  const mapa = new Map();
  for (const pasta of pastas) {
    const lista = pasta ? await listarPasta(sb, bucket, pasta) : [];
    for (const o of lista) mapa.set(o.caminho, o.bytes);
  }
  return mapa;
}

async function principal() {
  const URL_SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const APAGAR = process.argv.includes("--apagar");
  const LISTA = process.argv.includes("--lista");
  if (!URL_SB || !KEY) {
    console.error(
      "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Põe-nos no .env.local e corre:  set -a; . .env.local; set +a; node scripts/limpar-formatos-redundantes.mjs",
    );
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } });

  console.log(
    APAGAR ? "A APAGAR (não é ensaio)." : "ENSAIO — nada é apagado. Para apagar: --apagar",
  );
  console.log(`Projecto: ${new URL(URL_SB).host}\n`);

  let totalApagar = [];
  for (const { redundante, fica } of PARES) {
    const objectos = await listarTudo(sb, redundante);
    const irmaos = await irmaosDe(
      sb,
      fica,
      objectos.map((o) => o.caminho),
    );
    const { apagar, ficam } = planoDeLimpeza(objectos, irmaos);
    const por = (m) => ficam.filter((f) => f.motivo === m);
    console.log(
      `${redundante.padEnd(22)} ${String(objectos.length).padStart(5)} ficheiros  ` +
        `sai ${String(apagar.length).padStart(5)} (${megas(apagar)} MB)  ` +
        `fica: capa ${por("capa").length}, 1200 da capa ${por("media-da-capa").length}, ` +
        `sem irmão em ${fica} ${por("sem-irmao").length} (${megas(ficam)} MB)`,
    );
    if (LISTA) for (const o of apagar) console.log(`   - ${redundante}/${o.caminho}`);
    totalApagar = totalApagar.concat(apagar.map((o) => ({ ...o, redundante, fica })));
  }
  console.log(`\nTotal a sair: ${totalApagar.length} ficheiros, ${megas(totalApagar)} MB.`);
  if (!APAGAR) return;

  let apagados = [];
  for (const { redundante, fica } of PARES) {
    const doBucket = totalApagar.filter((o) => o.redundante === redundante);
    for (let i = 0; i < doBucket.length; i += 100) {
      const lote = doBucket.slice(i, i + 100);
      // O irmão confirma-se OUTRA VEZ, agora — entre a contagem e isto pode ter
      // corrido uma limpeza, uma fusão de temas ou um «mover fotografias».
      const agora = await irmaosDe(
        sb,
        fica,
        lote.map((o) => o.caminho),
      );
      const seguros = lote.filter((o) => (agora.get(o.caminho) ?? 0) > 0).map((o) => o.caminho);
      if (seguros.length === 0) continue;
      const { error } = await sb.storage.from(redundante).remove(seguros);
      if (error) {
        console.error(`${redundante}: ${error.message} — parado aqui. Repetir retoma.`);
        process.exit(1);
      }
      apagados = apagados.concat(lote.filter((o) => seguros.includes(o.caminho)));
      console.log(`${redundante}: ${apagados.length} apagados até agora (${megas(apagados)} MB)`);
    }
  }
  console.log(`\nApagados: ${apagados.length} ficheiros, ${megas(apagados)} MB.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
