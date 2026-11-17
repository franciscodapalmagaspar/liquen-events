"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { pool } from "@/lib/concorrencia";
import { plural } from "@/lib/plural";
import type { ThemeDuplicate, ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { bibliotecaAlteradaEmLote } from "../biblioteca-alterada";
import { prepareImageWithThumb } from "../image-prep";
import type { useToast } from "../Toast";
import { revokeUrl } from "./FotoDaGrelha";
import { MAX_DROP_FILES, expandDropEntries, isImageFile } from "./largar-pastas";
import type { Failure, Pending, Screening, Skipped } from "./tipos-da-pasta";
import { screenBatch } from "./triagem-do-lote";

/**
 * ENVIAR FOTOS PARA UMA PASTA — escolher, largar, subir em lotes, repetir as
 * que falharam e acrescentar as repetidas à mesma. Saiu do `ThemeFolder`
 * (`Temas.tsx`) tal e qual (júri das fases 7 e 8, ponto 3): funções sem
 * efeitos nem hooks, que leem e escrevem o estado da pasta pelo que recebem.
 * A triagem antes de subir vive em `triagem-do-lote.ts`.
 */
/**
 * Quantos carregamentos em voo ao mesmo tempo.
 *
 * Quatro, e não mais: cada pedido leva um JPEG de ~3 MB, por isso o gargalo é
 * o canal de SUBIDA (uma ligação doméstica sobe ~10–20 Mbit/s). Mais ligações
 * não somam largura de banda — repartem a mesma —, e cada uma paga o seu pico
 * de memória (a bitmap descodificada + os canvas). Quatro, e não menos:
 * preparar a foto seguinte (descodificar + redimensionar + codificar) é
 * trabalho de CPU no fio principal, e é durante essa preparação que as outras
 * três mantêm o canal cheio. O browser abre ~6 ligações por servidor em
 * HTTP/1.1; deixar duas de fora mantém a grelha e as miniaturas a responder
 * enquanto um lote de 300 fotos sobe.
 */
const UPLOAD_CONCURRENCY = 4;

/** Quantas fotos do lote entram na grelha já com a imagem local à vista.
 *  Mostrar as 300 de uma vez obrigava o navegador a descodificar 300 fotos de
 *  12 MP para desenhar quadrados de 150 px; as restantes ganham a
 *  pré-visualização quando a sua miniatura é gerada (que é logo a seguir). */
const PREVIEW_EAGER = 12;

type Def<T> = Dispatch<SetStateAction<T>>;

/** O estado da pasta que o envio lê e escreve (todo ele é do `ThemeFolder`). */
export interface DependenciasDoEnvio {
  alive: RefObject<boolean>;
  theme: ThemeSummary;
  toast: ReturnType<typeof useToast>["toast"];
  trackUrl: (file: File) => string | undefined;
  setImages: Def<ThemeImage[]>;
  setTotal: Def<number | null>;
  failed: Failure[];
  setFailed: Def<Failure[]>;
  skipped: Skipped[];
  setSkipped: Def<Skipped[]>;
  setPending: Def<Pending[]>;
  setLocalSrc: Def<Map<string, string>>;
  setLegacyPhotos: Def<boolean>;
  setPartialCheck: Def<boolean>;
  setProgress: Def<{ done: number; total: number } | null>;
  setUploadingCount: Def<number>;
  setVerifying: Def<{ done: number; total: number } | null>;
}

export function useEnvioDeFotos({
  alive,
  failed,
  setFailed,
  setImages,
  setLegacyPhotos,
  setLocalSrc,
  setPartialCheck,
  setPending,
  setProgress,
  setSkipped,
  setTotal,
  setUploadingCount,
  setVerifying,
  skipped,
  theme,
  toast,
  trackUrl,
}: DependenciasDoEnvio) {
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
        : await screenBatch(files, { alive, setVerifying, theme });
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

  return { upload, retryFailed, addSkippedAnyway, pick, handleDrop };
}
