import { type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  type ThemeImage,
  type ThemeSummary,
  CHECK_CHUNK,
  type ThemeDuplicate,
} from "@/lib/theme-types";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import { prepareImageWithThumb } from "../image-prep";
import { bibliotecaAlteradaEmLote } from "../biblioteca-alterada";
import { revokeUrl } from "./FotoDaGrelha";
import { pool } from "@/lib/concorrencia";
import { Failure, Pending, Screening, Skipped } from "./tipos-da-pasta";
import { plural } from "@/lib/plural";
import { UPLOAD_CONCURRENCY, FINGERPRINT_CONCURRENCY, PREVIEW_EAGER } from "./tectos-da-pasta";
import { type Avisar } from "../Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MANDAR FOTOS PARA A PASTA — escolher, verificar e enviar aos lotes
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ver o que já lá está (o resumo de cada ficheiro), mandar o resto aos
 * lotes, e contar o que entrou, o que falhou e o que se saltou.
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasEnvioDeFotos {
  theme: ThemeSummary;
  toast: Avisar;
  setImages: Dispatch<SetStateAction<ThemeImage[]>>;
  setTotal: Dispatch<SetStateAction<number | null>>;
  setUploadingCount: Dispatch<SetStateAction<number>>;
  setProgress: Dispatch<SetStateAction<{ done: number; total: number } | null>>;
  setFailed: Dispatch<SetStateAction<Failure[]>>;
  setSkipped: Dispatch<SetStateAction<Skipped[]>>;
  setLegacyPhotos: Dispatch<SetStateAction<boolean>>;
  setPartialCheck: Dispatch<SetStateAction<boolean>>;
  setVerifying: Dispatch<SetStateAction<{ done: number; total: number } | null>>;
  setPending: Dispatch<SetStateAction<Pending[]>>;
  setLocalSrc: Dispatch<SetStateAction<Map<string, string>>>;
  alive: RefObject<boolean>;
  trackUrl: (file: File) => string | undefined;
}

export function useEnvioDeFotos({
  theme,
  toast,
  setImages,
  setTotal,
  setUploadingCount,
  setProgress,
  setFailed,
  setSkipped,
  setLegacyPhotos,
  setPartialCheck,
  setVerifying,
  setPending,
  setLocalSrc,
  alive,
  trackUrl,
}: EntradasEnvioDeFotos) {
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
  async function screenBatch(files: File[]): Promise<Screening> {
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

  /**
   * Carrega um lote de fotos, SALTANDO as que já estão no tema.
   *
   * `force` é o "Adicionar mesmo assim": salta a verificação toda e manda o
   * servidor guardar com um sufixo. É a marcha-atrás de um clique — e a
   * recuperação de todos os modos de falha do índice (memo velho noutra
   * instância do servidor, resumo errado, colisão).
   */
  async function upload(files: File[], force?: { hashOf: Map<File, string> }) {
    if (files.length === 0) return;
    // O contador entra JÁ: a fase de verificação também é trabalho em curso, e
    // fechar o separador a meio dela perde o arrasto todo.
    setUploadingCount((n) => n + 1);
    try {
      const screened: Screening = force
        ? // A FORÇAR, os resumos já são conhecidos e VÃO na mesma: sem eles o
          // servidor cunharia um UUID e a foto forçada deixava de contar como
          // "está no tema" — um buraco permanente no índice, por cada clique
          // em "Adicionar mesmo assim".
          { keep: files, skipped: [], hashOf: force.hashOf, verified: false, legacy: false }
        : await screenBatch(files);
      if (!alive.current) return;
      if (screened.legacy) setLegacyPhotos(true);
      if (!force) setPartialCheck(!screened.verified);
      if (screened.skipped.length > 0) setSkipped((prev) => [...prev, ...screened.skipped]);
      if (screened.keep.length === 0) {
        // SEM ISTO ela vê uma barra a andar e nada a acontecer, e conclui que
        // o site está avariado.
        toast(
          `Estas ${files.length} fotos já estavam todas em "${theme.name}". Não foi adicionada nenhuma.`,
          "info",
        );
        return;
      }
      await sendBatch(screened.keep, screened.hashOf, Boolean(force), screened.skipped.length);
    } finally {
      if (alive.current) setUploadingCount((n) => Math.max(0, n - 1));
    }
  }

  /**
   * Envia o lote com até `UPLOAD_CONCURRENCY` em voo.
   *
   * Um ficheiro por pedido: o limite de corpo do alojamento (~4,5 MB) rebenta
   * com um lote inteiro de fotos de telemóvel. Cada pedido leva o original
   * preparado, a sua miniatura (`thumbs`, na mesma ordem) e o `hashes` — como
   * vai um só ficheiro de cada vez, "a mesma ordem" é trivialmente respeitada.
   *
   * Nada aqui deita fora o lote: cada falha é apanhada, guardada COM o
   * ficheiro (para se poder repetir sem voltar a escolher nada) e o lote
   * continua.
   */
  async function sendBatch(
    files: File[],
    hashOf: Map<File, string>,
    force: boolean,
    /** Quantas já foram saltadas antes de chegar aqui — entra na mensagem. */
    preSkipped: number,
  ) {
    // Os totais somam-se: dois lotes a decorrer mostram um só "47 de 312".
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + files.length }));
    let added = 0;
    const errors: Failure[] = [];
    /** As que o SERVIDOR recusou por já lá estarem — a corrida apanhada pelo
     *  `upsert: false`, e a foto antiga apanhada pelo eTag. Contam-se aqui, e
     *  não na previsão, para o relatório dizer o que ACONTECEU. */
    const serverSkipped: Skipped[] = [];

    // AS FOTOS ENTRAM NA GRELHA AGORA, do ficheiro que está no computador —
    // não daqui a três segundos, quando o servidor responder. As primeiras
    // levam já o URL de objeto; as outras recebem-no quando lhes chegar a vez
    // de serem preparadas (aí já é a MINIATURA, que é barata de desenhar).
    const batch = files.map((file, i) => ({
      file,
      item: {
        id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        src: i < PREVIEW_EAGER ? trackUrl(file) : undefined,
      } as Pending,
    }));
    setPending((prev) => [...batch.map((b) => b.item), ...prev]);

    /** Tira a célula provisória da grelha. `keepUrl` fica com o URL de objeto
     *  (passou a ser a imagem da foto verdadeira); senão é revogado aqui. */
    const dropPending = (item: Pending, keepUrl: boolean) => {
      setPending((prev) => prev.filter((p) => p.id !== item.id));
      if (!keepUrl) revokeUrl(item.src);
    };

    try {
      await pool(
        batch,
        UPLOAD_CONCURRENCY,
        async ({ file: f, item }) => {
          try {
            // Preset "cover" e não "board": uma foto da biblioteca tem DOIS
            // destinos possíveis — uma célula de mood board ou uma imagem de
            // CAPA, impressa em grande. Guardá-la com 1600 px degradava-a para
            // sempre (o original nunca mais existe). A miniatura sai da MESMA
            // descodificação, para um lote de 300 fotos não custar o dobro.
            const { file, thumb, micro, mid, lqip, cor } = await prepareImageWithThumb(f, "cover");
            // A miniatura acabada de fazer é a melhor pré-visualização que há:
            // 400 px, ~25 KB, e já está em memória. As células que ainda não
            // tinham imagem ganham-na aqui; as que já tinham ficam com a que
            // têm (trocar era piscar por nada).
            if (!item.src) {
              const preview = trackUrl(thumb ?? file);
              if (preview) {
                item.src = preview;
                if (alive.current) {
                  setPending((prev) =>
                    prev.map((p) => (p.id === item.id ? { ...p, src: preview } : p)),
                  );
                }
              }
            }
            const form = new FormData();
            form.append("files", file);
            if (thumb) form.append("thumbs", thumb);
            // A de 1200 px — a que a PÁGINA DO CASAL mostra. Sai da mesma
            // descodificação que fez a miniatura, portanto não custa tempo
            // nenhum. Sem ela, esta fotografia só a ganha quando ALGUÉM OLHAR
            // para ela numa proposta — com o servidor a fabricá-la enquanto o
            // casal espera.
            if (mid) form.append("medias", mid);
            // A micro de 96 px, para as tiras do cartão de tema. Vai no mesmo
            // pedido — já está feita, do mesmo canvas.
            if (micro) form.append("micros", micro);
            // O LQIP viaja no MESMO pedido que a foto — é trabalho do
            // carregamento, e o carregamento já está a falar com o servidor.
            // Emparelhado pela ORDEM, como o `thumbs` e o `hashes`.
            if (lqip) form.append("lqips", lqip);
            // A cor dominante, pela mesma boleia e pela mesma razão: é aqui
            // que a fotografia existe em bruto e sem origem cruzada (ver
            // `corDe` em `image-worker.ts`). Emparelhada pela ORDEM.
            if (cor) form.append("cores", cor);
            // O resumo do ficheiro ORIGINAL (não do preparado): é ele que vira
            // o nome no Storage e torna a garantia de "não repetir" atómica.
            const hash = hashOf.get(f);
            if (hash) form.append("hashes", hash);
            if (force) form.append("force", "1");
            const res = await fetch(`/api/temas/${theme.id}/imagens`, {
              method: "POST",
              body: form,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `Falha ao carregar "${f.name}".`);
            // O servidor recusou-a por já lá estar. NÃO é um erro: sai da
            // grelha em silêncio e entra no painel neutro das repetidas.
            const dup: ThemeDuplicate | undefined = data?.duplicates?.[0];
            if (dup) {
              dropPending(item, false);
              serverSkipped.push({ file: f, reason: "no-tema", ...(hash ? { hash } : {}) });
              return;
            }
            const im: ThemeImage | undefined = data?.images?.[0];
            if (!im?.path) throw new Error(`Falha ao carregar "${f.name}".`);
            if (!alive.current) return;
            // A célula provisória dá lugar à foto verdadeira SEM piscar: o URL
            // de objeto passa a ser a imagem desta foto na grelha, por isso não
            // se vai buscar ao Storage uma miniatura que já cá está.
            if (item.src) setLocalSrc((prev) => new Map(prev).set(im.path, item.src as string));
            dropPending(item, Boolean(item.src));
            // Cada foto entra na grelha assim que chega. Juntar o lote todo e no
            // fim fazer `[...lote, ...images]` lia um `images` velho: dois lotes
            // em paralelo perdiam fotos e uma foto removida entretanto voltava.
            setImages((prev) => (prev.some((x) => x.path === im.path) ? prev : [im, ...prev]));
            setTotal((t) => (t === null ? null : t + 1));
            // Um aviso por LOTE, não por foto (revisão de 14/11, menor n.º 5).
            bibliotecaAlteradaEmLote();
            added += 1;
          } catch (e) {
            // A foto não subiu: a célula provisória sai (a caixa vermelha do
            // "tentar novamente" é que passa a contar a história) e o URL de
            // objeto é libertado.
            dropPending(item, false);
            errors.push({
              file: f,
              message: e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`,
            });
          } finally {
            if (alive.current) setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        },
        () => !alive.current,
      );
      if (!alive.current) return;
      // O RELATÓRIO É CONSTRUÍDO DO QUE ACONTECEU, não do que a verificação
      // previu: assim uma corrida apanhada pelo 409, uma repetida antiga
      // apanhada pelo eTag e uma repetida prevista contam todas da mesma
      // maneira, e o número que ela lê é sempre verdadeiro.
      if (serverSkipped.length > 0) setSkipped((prev) => [...prev, ...serverSkipped]);
      const jaLaEstavam = preSkipped + serverSkipped.length;
      const cauda =
        jaLaEstavam > 0
          ? ` ${jaLaEstavam} já ${jaLaEstavam === 1 ? "estava" : "estavam"} no tema.`
          : "";
      if (errors.length > 0) {
        setFailed((prev) => [...prev, ...errors]);
        toast(
          errors.length === files.length
            ? `Nenhuma foto subiu. ${errors[0].message}`
            : `${added} de ${files.length} carregadas — ${plural(errors.length, "falhou", "falharam")}.`,
          "error",
        );
      } else if (added === 0 && jaLaEstavam > 0) {
        toast(`Nada a adicionar —${cauda}`, "info");
      } else {
        toast(
          `${plural(added, "foto adicionada", "fotos adicionadas")} a "${theme.name}".${cauda}`,
          "success",
        );
      }
    } finally {
      if (alive.current) {
        // Só o último lote apaga o contador: `done === total` só acontece
        // quando já não falta nenhum ficheiro de nenhum dos lotes.
        setProgress((p) => (p && p.done >= p.total ? null : p));
      }
    }
  }
  return { upload };
}
