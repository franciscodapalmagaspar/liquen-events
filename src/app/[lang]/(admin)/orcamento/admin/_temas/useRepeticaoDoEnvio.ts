import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { type AccaoDoAviso } from "../Toast";
import { MAX_DROP_FILES, expandDropEntries, isImageFile } from "./largar-pastas";
import { Failure, Skipped } from "./tipos-da-pasta";
import { plural } from "@/lib/plural";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPETIR E LARGAR — o que não entrou, e as pastas largadas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Voltar a mandar o que falhou, acrescentar o que se saltou por já lá
 * estar, escolher ficheiros e largar pastas inteiras na pasta do tema.
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasRepeticaoDoEnvio {
  toast: (message: string, kind?: "success" | "error" | "info", accao?: AccaoDoAviso) => void;
  failed: Failure[];
  setFailed: Dispatch<SetStateAction<Failure[]>>;
  skipped: Skipped[];
  setSkipped: Dispatch<SetStateAction<Skipped[]>>;
  alive: RefObject<boolean>;
  upload: (files: File[], force?: { hashOf: Map<File, string> }) => Promise<void>;
}

export function useRepeticaoDoEnvio({
  toast,
  failed,
  setFailed,
  skipped,
  setSkipped,
  alive,
  upload,
}: EntradasRepeticaoDoEnvio) {
  /** Repete as que falharam. Os ficheiros ficaram guardados — não é preciso
   *  voltar a abrir a pasta no computador nem lembrar-se de quais foram. */
  function retryFailed() {
    const again = failed.map((f) => f.file);
    if (again.length === 0) return;
    setFailed([]);
    upload(again);
  }

  /**
   * "ADICIONAR MESMO ASSIM" — a marcha-atrás de um clique.
   *
   * Sobe as saltadas com `force`, e o servidor guarda-as com `<resumo>-<4 hex>`.
   * O sufixo é a razão pela qual o analisador de nomes o descarta: uma cópia
   * forçada CONTINUA a contar como "esta foto está no tema" para o arrasto
   * seguinte, em vez de abrir um buraco permanente no índice.
   *
   * É por LOTE, no relatório — nunca uma pergunta por foto. E é a recuperação
   * de todos os modos de falha do índice, que é por isso que o relatório tem de
   * ser accionável e não decorativo.
   */
  function addSkippedAnyway() {
    if (skipped.length === 0) return;
    // Os resumos já foram calculados na verificação — não se voltam a ler os
    // ficheiros, e vão com as fotos para o nome forçado os preservar.
    const hashOf = new Map<File, string>();
    for (const s of skipped) if (s.hash) hashOf.set(s.file, s.hash);
    const again = skipped.map((s) => s.file);
    setSkipped([]);
    upload(again, { hashOf });
  }

  function pick(list: FileList | File[] | null) {
    if (!list) return;
    const all = Array.from(list);
    const files = all.filter(isImageFile);
    const skipped = all.length - files.length;
    if (files.length === 0) {
      if (skipped > 0) toast("Nenhum dos ficheiros é uma imagem.", "error");
      return;
    }
    if (skipped > 0) {
      toast(
        `${plural(skipped, "ficheiro ignorado", "ficheiros ignorados")} — não são imagens.`,
        "info",
      );
    }
    upload(files);
  }

  /** O drop já com as `entries` lidas de forma síncrona pelo handler. */
  async function handleDrop(entries: FileSystemEntry[], files: File[]) {
    // Sem pastas pelo meio, `dataTransfer.files` já traz tudo — e traz mais
    // depressa do que percorrer a árvore entrada a entrada.
    if (entries.length === 0 || !entries.some((e) => e.isDirectory)) {
      pick(files);
      return;
    }
    toast("A ler a pasta…", "info");
    const { files: found, capped } = await expandDropEntries(entries);
    if (!alive.current) return;
    if (capped) {
      toast(
        `Foram lidas as primeiras ${MAX_DROP_FILES} fotos da pasta. Carrega as restantes num segundo arrasto.`,
        "info",
      );
    }
    pick(found);
  }
  return { pick, retryFailed, addSkippedAnyway, handleDrop };
}
