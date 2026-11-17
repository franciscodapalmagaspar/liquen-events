"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ThemeSummary } from "@/lib/theme-types";
import { pool } from "@/lib/concorrencia";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import { CHECK_CHUNK } from "@/lib/theme-types";
import type { Screening, Skipped } from "./tipos-da-pasta";

/**
 * A TRIAGEM DE UM LOTE ANTES DE SUBIR — o que já está no tema, o que vem
 * repetido no próprio arrasto, e o que sobe. Saiu do `ThemeFolder`
 * (`Temas.tsx`) tal e qual (júri das fases 7 e 8, ponto 3), com as três coisas
 * de que precisa passadas pelo nome.
 */
/**
 * Quantos ficheiros são lidos ao mesmo tempo para lhes calcular a impressão
 * digital.
 *
 * O `crypto.subtle.digest` não bloqueia o fio principal (o browser resolve-o
 * fora dele) e é barato ao lado do resto — MEDIDO em Chromium nesta caixa:
 * 42,9 ms numa foto de 8,1 MB (181 MB/s), contra 337 ms para PREPARAR a mesma
 * foto. O que aqui se limita não é o CPU, é a MEMÓRIA: cada ficheiro tem de
 * estar inteiro em `ArrayBuffer` para ser resumido, e um arrasto de 300 fotos
 * de 8 MB lidas de uma vez seriam 2,4 GB. Quatro em voo são ~32 MB de pico — o
 * mesmo teto de quatro que os carregamentos já usam, pela mesma razão.
 */
const FINGERPRINT_CONCURRENCY = 4;

export interface DependenciasDaTriagem {
  alive: RefObject<boolean>;
  setVerifying: Dispatch<SetStateAction<{ done: number; total: number } | null>>;
  theme: ThemeSummary;
}

/**
 * FASE 1 a 3 — quais destas fotos JÁ estão no tema.
 *
 * A ordem é o que faz a diferença de tempo, e é deliberada: o resumo é
 * calculado ANTES de preparar a imagem. MEDIDO em Chromium nesta caixa, numa
 * foto 4032×3024 de 8,1 MB: 42,9 ms para resumir contra 337 ms para
 * preparar. Nesta ordem, cada repetida apanhada poupa a preparação E o
 * upload; ao contrário, poupava só o upload.
 *
 * Num arrasto de 300 com metade repetidas: ~4,3 s de resumos (4 em voo) e
 * ~0,5 s a construir o índice do lado do servidor, contra ~16,9 s de CPU
 * poupados e ~160 MB que deixam de subir (≈67 s a 20 Mbit/s).
 *
 * NUNCA falha o carregamento. Sem `crypto.subtle` (contexto inseguro), com a
 * pasta ilegível ou com a rota em baixo, isto devolve "sobe tudo" e o
 * `upsert: false` do servidor continua a ser o guarda que não falha.
 */
export async function screenBatch(
  files: File[],
  { alive, setVerifying, theme }: DependenciasDaTriagem,
): Promise<Screening> {
  const nothingKnown: Screening = {
    keep: files,
    skipped: [],
    hashOf: new Map(),
    verified: false,
    legacy: false,
  };
  setVerifying({ done: 0, total: files.length });
  try {
    // ── 1) Impressão digital do ficheiro que está no disco dela ──────────
    const hashes = new Array<string | null>(files.length).fill(null);
    await pool(
      files.map((file, i) => ({ file, i })),
      FINGERPRINT_CONCURRENCY,
      async ({ file, i }) => {
        hashes[i] = await fingerprintBlob(file);
        if (alive.current) setVerifying((v) => (v ? { ...v, done: v.done + 1 } : v));
      },
      () => !alive.current,
    );
    if (!alive.current) return nothingKnown;
    // Nenhum resumo: este ambiente não sabe fazê-los (sem contexto seguro) e
    // a funcionalidade DESLIGA-SE — não parte, não avisa, não muda nada.
    if (hashes.every((h) => h === null)) return nothingKnown;

    const hashOf = new Map<File, string>();
    files.forEach((f, i) => {
      const h = hashes[i];
      if (h) hashOf.set(f, h);
    });

    // ── 2) Pré-verificação contra a pasta, em pedaços ────────────────────
    // Em pedaços de CHECK_CHUNK e não o lote todo: assim a primeira foto
    // começa a subir ao fim de ~0,3 s em vez de ~2 s num arrasto de 300. Do
    // segundo pedaço em diante o índice do servidor já está em memória.
    const known = new Set<string>();
    let verified = true;
    let legacy = false;
    for (let i = 0; i < files.length && alive.current; i += CHECK_CHUNK) {
      const chunk = [...new Set(hashes.slice(i, i + CHECK_CHUNK).filter((h) => h !== null))];
      if (chunk.length === 0) continue;
      try {
        const res = await fetch(`/api/temas/${theme.id}/repetidas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes: chunk }),
        });
        if (!res.ok) throw new Error("falhou");
        const data = await res.json();
        for (const h of Array.isArray(data?.known) ? data.known : []) {
          if (typeof h === "string") known.add(h);
        }
        // `read: false` = a pasta não pôde ser lida; `complete: false` = a
        // pasta é maior do que o teto. Nos dois casos não se anuncia
        // poupança nenhuma, mesmo que alguma repetida tenha sido apanhada.
        if (data?.read === false || data?.complete === false) verified = false;
        if (data?.legacy) legacy = true;
      } catch {
        // Falhar a VERIFICAR nunca pode travar o carregamento: sobe tudo, e
        // o guarda da escrita apanha o que houver.
        verified = false;
      }
    }
    if (!alive.current) return nothingKnown;

    // ── 3) Repetidas dentro do PRÓPRIO arrasto ───────────────────────────
    // A pré-verificação nunca as apanharia: ainda não estão na pasta. Sem
    // isto, largar a mesma pasta duas vezes de seguida num só gesto entrava
    // a dobrar.
    const seen = new Set<string>();
    const keep: File[] = [];
    const out: Skipped[] = [];
    files.forEach((file, i) => {
      const hash = hashes[i];
      if (hash && known.has(hash)) {
        out.push({ file, reason: "no-tema", hash });
        return;
      }
      if (hash && seen.has(hash)) {
        out.push({ file, reason: "no-lote", hash });
        return;
      }
      if (hash) seen.add(hash);
      keep.push(file);
    });

    return { keep, skipped: out, hashOf, verified, legacy };
  } finally {
    if (alive.current) setVerifying(null);
  }
}
