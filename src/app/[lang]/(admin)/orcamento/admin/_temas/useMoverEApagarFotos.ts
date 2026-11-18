import { type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { type ThemeCopyOutcome } from "../ThemeCopyDialog";
import { THEME_COPY_CHUNK } from "@/lib/theme-types";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { bibliotecaAlterada } from "../biblioteca-alterada";
import { fraseDeMovimentoFalhado, fraseDoMovimento, fraseDoRegresso } from "@/lib/temas-arrasto";
import { pool } from "@/lib/concorrencia";
import { reinsertAt } from "@/lib/temas/listas-de-fotos";
import { plural } from "@/lib/plural";
import { DELETE_CONCURRENCY } from "./tectos-da-pasta";
import { type Avisar } from "../Toast";
import { type Anular } from "../ui/anular";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIRAR FOTOS DA PASTA — remover, copiar e mover para outro tema
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Remover fotos (com o «Anular»), aplicar o resultado de uma cópia ou de um
 * movimento para outro tema, e desfazer um movimento.
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasMoverEApagarFotos {
  theme: ThemeSummary;
  onCopiedTo: (destId: string, added: number) => void;
  toast: Avisar;
  anular: Anular;
  depoisDeApagarVarios: (
    corpos: unknown[],
    frase: string,
    depoisDeRepor?: (repostos: number[]) => void,
  ) => void;
  images: ThemeImage[];
  setImages: Dispatch<SetStateAction<ThemeImage[]>>;
  setTotal: Dispatch<SetStateAction<number | null>>;
  setCopyOpen: Dispatch<SetStateAction<boolean>>;
  setCopyReport: Dispatch<SetStateAction<ThemeCopyOutcome | null>>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setCoverPath: Dispatch<SetStateAction<string | undefined>>;
  alive: RefObject<boolean>;
  setAMover: Dispatch<SetStateAction<{ feito: number; total: number } | null>>;
  setAnuncio: Dispatch<SetStateAction<string>>;
  setRecarga: Dispatch<SetStateAction<number>>;
  anchor: RefObject<number | null>;
}

export function useMoverEApagarFotos({
  theme,
  onCopiedTo,
  toast,
  anular,
  depoisDeApagarVarios,
  images,
  setImages,
  setTotal,
  setCopyOpen,
  setCopyReport,
  setSelected,
  setCoverPath,
  alive,
  setAMover,
  setAnuncio,
  setRecarga,
  anchor,
}: EntradasMoverEApagarFotos) {
  /** Remove um conjunto de fotos. Uma só confirmação para o conjunto todo, e
   *  as que o servidor recusar voltam ao sítio onde estavam. */
  async function removeImages(targets: ThemeImage[], aoProgredir?: (feitas: number) => void) {
    if (targets.length === 0) return;
    const positions = new Map(images.map((im, i) => [im.path, i]));
    const gone = new Set(targets.map((t) => t.path));
    setImages((prev) => prev.filter((i) => !gone.has(i.path)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of gone) next.delete(p);
      return next;
    });
    anchor.current = null;
    setTotal((t) => (t === null ? null : Math.max(0, t - targets.length)));
    bibliotecaAlterada();

    const errors: ThemeImage[] = [];
    // As que saíram, e o que o servidor disse de cada uma: é daí que vem a
    // entrada da Reciclagem para o «Anular».
    const saidas: { im: ThemeImage; corpo: unknown }[] = [];
    /**
     * A primeira recusa que trouxe RESPOSTA — é ela que classifica a frase.
     *
     * As remoções vão em paralelo (ver `pool`) e não há uma resposta só para
     * ler. Fica-se pela primeira: numa remoção em bloco o motivo é sempre o
     * mesmo para todas (a sessão caiu, o servidor está em baixo), e é a
     * diferença entre mandar voltar a entrar e mandar esperar. `null` quer
     * dizer que nenhuma chegou a responder — a rede em baixo.
     */
    let primeiraRecusa: Response | null = null;
    // As remoções correm com concorrência: a contagem é de quantas JÁ
    // RESPONDERAM, e conta tanto as que foram como as que falharam — a barra
    // retrata a espera, não o sucesso (o que falhou tem o seu próprio aviso).
    let respondidas = 0;
    await pool(targets, DELETE_CONCURRENCY, async (im) => {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?path=${encodeURIComponent(im.path)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          primeiraRecusa ??= res;
          throw new Error("falhou");
        }
        saidas.push({ im, corpo: await res.json().catch(() => null) });
      } catch {
        errors.push(im);
      } finally {
        respondidas += 1;
        aoProgredir?.(respondidas);
      }
    });
    if (!alive.current) return;
    if (errors.length > 0) {
      // Repor SÓ as fotos cuja remoção falhou, no sítio onde estavam. Repor a
      // lista inteira deitava fora as que um lote a decorrer tivesse
      // entretanto acrescentado.
      setImages((prev) => reinsertAt(prev, errors, positions));
      setTotal((t) => (t === null ? null : t + errors.length));
      // E a frase diz que elas VOLTARAM. A remoção é optimista: as fotos saem
      // da grelha no instante do clique e reaparecem no lugar delas quando o
      // servidor recusa. Com «Não foi possível remover 3 fotos» ela via três
      // fotos ressuscitar sem perceber que era o aviso a acontecer.
      const uma = errors.length === 1;
      const oQue = `remover ${plural(errors.length, "foto", "fotos")} de "${theme.name}"`;
      const falha = primeiraRecusa ? porqueFalhou(oQue, primeiraRecusa) : porqueRebentou(oQue);
      toast(
        `${falha.mensagem} ${uma ? "Voltou" : "Voltaram"} ao sítio onde ${
          uma ? "estava" : "estavam"
        }.`,
        "error",
      );
    } else {
      // TAMBÉM QUANDO É UMA SÓ. O `targets.length > 1` que aqui estava não era
      // uma decisão — era o resto de uma frase escrita a pensar no bloco, e
      // deixava o gesto mais comum de todos mudo.
      //
      // O buraco na grelha não serve de resposta: a remoção é OTIMISTA, a
      // célula sai no instante do clique e o servidor só responde depois. Quem
      // prova a diferença é o ramo de cima — quando ele recusa, a foto volta ao
      // sítio onde estava. Sem esta frase, ver a foto sair não distingue «foi
      // removida» de «ainda vai a caminho».
      //
      // E com «Anular» (R3b): as fotos ficam 30 dias na Reciclagem, e as que
      // voltarem regressam ao sítio onde estavam na grelha.
      depoisDeApagarVarios(
        saidas.map((x) => x.corpo),
        `${plural(targets.length, "foto removida", "fotos removidas")}.`,
        (repostos) => {
          if (!alive.current) return;
          const voltaram = repostos.map((i) => saidas[i].im);
          setImages((prev) => reinsertAt(prev, voltaram, positions));
          setTotal((t) => (t === null ? null : t + voltaram.length));
          bibliotecaAlterada();
        },
      );
    }
  }

  /**
   * O que fazer com a grelha depois de levar fotos para outro tema.
   *
   * SEM REMOÇÃO OTIMISTA, ao contrário do `removeImages`: aqui já houve barra
   * de progresso a explicar a espera, por isso a grelha só perde as fotos que o
   * servidor CONFIRMOU — e assim não é preciso código de reversão nenhum (o
   * `reinsertAt` não entra nisto).
   *
   * As que falharam e as que já lá estavam ficam SELECIONADAS: é o padrão que o
   * `ThemePicker` já usa ("o que falhou volta a ser a seleção"), e evita que
   * repetir a operação obrigue a escolher tudo de novo.
   */
  function applyCopyOutcome(r: ThemeCopyOutcome) {
    setCopyOpen(false);
    if (r.copied.length > 0) onCopiedTo(r.destId, r.copied.length);
    if (r.mode === "mover" && r.copied.length > 0) {
      const gone = new Set(r.copied);
      setImages((prev) => prev.filter((im) => !gone.has(im.path)));
      setTotal((t) => (t === null ? null : Math.max(0, t - r.copied.length)));
      // A capa que saiu deixa de o ser: o servidor já a limpou na origem.
      setCoverPath((c) => (c && gone.has(c) ? undefined : c));
      anchor.current = null;
    }
    // O que continua aqui: o que falhou, o que já lá estava, e — quando ela
    // carregou em "Parar" — o que nem chegou a ser tentado. As três coisas têm
    // o mesmo remédio (voltar a mandar), por isso ficam todas selecionadas.
    const stuck = new Set([...r.failed, ...r.existing, ...r.untouched]);
    setSelected((prev) => new Set([...prev].filter((p) => stuck.has(p))));

    // O cartão vermelho fica no ecrã enquanto houver fotos por levar; um
    // número em que ela precisa de agir não pode desaparecer como um aviso.
    setCopyReport(r.failed.length > 0 || r.stopped ? r : null);
    if (r.failed.length > 0 || r.stopped) return;

    const verbo = r.mode === "copiar" ? "copiadas" : "movidas";
    const cauda = r.existing.length > 0 ? ` — ${r.existing.length} já lá estavam.` : ".";
    toast(
      r.copied.length === 0
        ? `Estas fotos já estavam todas em "${r.destName}".`
        : `${plural(r.copied.length, `foto ${verbo.slice(0, -1)}`, `fotos ${verbo}`)} para "${r.destName}"${cauda}`,
      "success",
    );
    // Sem miniatura, o tema de destino passa a puxar ORIGINAIS (medido: 164 MB
    // por página de 60, contra 1,78 MB). Se acontecer em massa ela tem de saber
    // porquê — senão vê o tema a arrastar-se e não faz ideia da razão.
    if (r.thumbsMissing > 0) {
      toast(
        `${plural(r.thumbsMissing, "foto chegou", "fotos chegaram")} a "${r.destName}" sem miniatura. Abre esse tema e usa "Gerar miniaturas em falta".`,
        "info",
      );
    }
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LARGAR UM LOTE NUM TEMA DA COLUNA — FASE 08
   * ══════════════════════════════════════════════════════════════════════
   *
   * «Arrastar para um tema da lista lateral… dentro do mesmo tema reordena;
   * para outro tema MOVE… sempre com Anular.» (Parte 4 do
   * `docs/APPLE-TEMAS.md`.)
   *
   * ── PORQUE É QUE ISTO NÃO É UM SEGUNDO «COPIAR PARA…» ─────────────────
   *
   * Porque é o MESMO. O pedido que sai daqui é o que o `ThemeCopyDialog` já
   * fazia — `POST /api/temas/{origem}/imagens/copiar` com `modo: "mover"`, em
   * pedaços de `THEME_COPY_CHUNK` —, e o que chega de volta entra no
   * `applyCopyOutcome`, que já sabe tirar da grelha só o que o servidor
   * confirmou, corrigir a capa que saiu e deixar seleccionado o que ficou
   * para trás. O arrasto é uma segunda PORTA para a operação, não uma segunda
   * operação: é exactamente a alternativa obrigatória da Parte 4, lida ao
   * contrário («Mover para… faz o mesmo sem arrastar»).
   *
   * O que é próprio do arrasto, e só dele, são as três coisas que este método
   * acrescenta: a contagem enquanto espera, o anúncio em `role="status"`, e o
   * «Anular» dentro do aviso.
   */
  async function moverParaTema(destino: ThemeSummary, paths: string[]) {
    if (paths.length === 0 || destino.id === theme.id) return;
    setAMover({ feito: 0, total: paths.length });
    const copied: { from: string; to: string }[] = [];
    const existing: string[] = [];
    const failed: string[] = [];
    let thumbsMissing = 0;
    for (let i = 0; i < paths.length; i += THEME_COPY_CHUNK) {
      const chunk = paths.slice(i, i + THEME_COPY_CHUNK);
      try {
        const res = await fetch(`/api/temas/${theme.id}/imagens/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk, destino: destino.id, modo: "mover" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(res.status));
        for (const c of Array.isArray(data?.copied) ? data.copied : []) {
          if (typeof c?.from === "string" && typeof c?.to === "string") copied.push(c);
        }
        existing.push(...(Array.isArray(data?.existing) ? data.existing : []));
        failed.push(...(Array.isArray(data?.failed) ? data.failed : []));
        thumbsMissing += typeof data?.thumbsMissing === "number" ? data.thumbsMissing : 0;
      } catch {
        // O pedaço que falha inteiro conta como falha das suas fotos: elas
        // continuam aqui, e o `applyCopyOutcome` deixa-as seleccionadas para
        // se poder repetir sem as escolher de novo.
        failed.push(...chunk);
      }
      if (!alive.current) return;
      setAMover({ feito: Math.min(i + THEME_COPY_CHUNK, paths.length), total: paths.length });
    }
    if (!alive.current) return;
    setAMover(null);
    applyCopyOutcome({
      mode: "mover",
      destId: destino.id,
      destName: destino.name,
      copied: copied.map((c) => c.from),
      existing,
      failed,
      untouched: [],
      thumbsMissing,
      stopped: false,
    });
    if (copied.length === 0) {
      setAnuncio(fraseDeMovimentoFalhado(paths.length, destino.name));
      return;
    }
    setAnuncio(fraseDoMovimento(copied.length, destino.name));
    /* ── E NENHUMA ACÇÃO A UM GESTO SEM ANULAR ──────────────────────────
       Parte 9, e o critério 6 do documento. Um arrasto é o gesto mais fácil
       de fazer sem querer que este ecrã tem — o ponteiro passa por cima da
       coluna a caminho de outra coisa — e mover quarenta fotografias para o
       tema errado sem saída era a versão em ponto grande do `×` a um clique
       que o ponto 19 mandou tirar. */
    //
    // O «Anular» é o da casa (10 s, `ui/anular.ts`). O `anularMovimento` diz o
    // resultado à sua maneira — quantas voltaram, e onde ficaram as outras —,
    // por isso devolve `false` e não aparece um «Anulado.» por cima.
    anular(fraseDoMovimento(copied.length, destino.name), async () => {
      await anularMovimento(destino, copied);
      return false;
    });
  }

  /**
   * Desfaz um arrasto: as fotografias voltam do destino para aqui.
   *
   * O caminho é o mesmo ao contrário — um `mover` a partir do tema de destino,
   * com os caminhos NOVOS (o `to` que o servidor devolveu). E a seguir a pasta
   * relê a primeira página em vez de repor de memória: ver a nota do `recarga`
   * — o que volta tem caminhos e URLs assinados novos, e o objecto que estava
   * na grelha já não descreve nenhum ficheiro.
   */
  async function anularMovimento(destino: ThemeSummary, movidas: { from: string; to: string }[]) {
    const paths = movidas.map((m) => m.to);
    setAMover({ feito: 0, total: paths.length });
    let devolvidas = 0;
    for (let i = 0; i < paths.length; i += THEME_COPY_CHUNK) {
      const chunk = paths.slice(i, i + THEME_COPY_CHUNK);
      try {
        const res = await fetch(`/api/temas/${destino.id}/imagens/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk, destino: theme.id, modo: "mover" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(res.status));
        devolvidas += Array.isArray(data?.copied) ? data.copied.length : 0;
      } catch {
        // Fica dito no fim, com o número certo: anular metade é uma coisa que
        // ela tem de ver, não uma que se cale.
      }
      if (!alive.current) return;
      setAMover({ feito: Math.min(i + THEME_COPY_CHUNK, paths.length), total: paths.length });
    }
    if (!alive.current) return;
    setAMover(null);
    // O cartão do destino perde o que devolveu (o `onCopiedTo` soma, e um
    // número negativo subtrai — ver a prop). O desta pasta corrige-se sozinho
    // quando a recarga trouxer o total novo.
    if (devolvidas > 0) onCopiedTo(destino.id, -devolvidas);
    bibliotecaAlterada();
    setRecarga((n) => n + 1);
    setAnuncio(fraseDoRegresso(devolvidas, theme.name));
    toast(
      devolvidas === paths.length
        ? fraseDoRegresso(devolvidas, theme.name)
        : `${fraseDoRegresso(devolvidas, theme.name)} As restantes ficaram em «${destino.name}».`,
      devolvidas === paths.length ? "success" : "error",
    );
  }
  return { removeImages, moverParaTema, applyCopyOutcome };
}
