import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { comLimite, ESCRITAS_EM_SIMULTANEO } from "@/lib/concorrencia";
import { reporEstadoDoPedido } from "../anular-estado";
import { ARQUIVAR_SEM_PERGUNTAR } from "@/lib/orcamento/pedidos/regras-da-lista";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { type Avisar } from "../Toast";
import { type Anular } from "../ui/anular";
import { comPedidosSubstituidos, semPedidos } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { plural } from "@/lib/plural";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ACÇÕES EM LOTE NA LISTA DE PEDIDOS — marcar, arquivar e apagar vários
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que a barra da selecção faz a vários pedidos de uma vez, com o «Anular»
 * de cada acção e as perguntas antes do que não se desfaz.
 *
 * Saiu do corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * tal e qual, e é chamado NO MESMO SÍTIO onde o código estava: a ordem dos
 * hooks e dos efeitos do componente não muda. Os nomes ficam os de lá.
 */
/** No máximo esta lista, e o resto contado. Trinta nomes não se leem. */
const NOMES_A_MOSTRAR = 8;

/** O lote que está a correr: o que se está a fazer, e quantos já se fizeram. */
export interface LoteEmCurso {
  titulo: string;
  feito: number;
  total: number;
}

export interface EntradasAccoesEmLote {
  userName: string;
  quotes: Quote[];
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  quotesRef: RefObject<Quote[]>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  selectedRef: RefObject<Quote | null>;
  /** O pedido que o servidor devolveu, no painel: a mesma regra dos campos de
   *  sempre (o que ela não mexeu segue o servidor). */
  absorverDoServidor: (q: Quote) => void;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setLote: Dispatch<SetStateAction<LoteEmCurso | null>>;
  bulkBusy: boolean;
  contarMaisUmNoLote: () => void;
  setAApagarLote: Dispatch<SetStateAction<string[] | null>>;
  setAArquivarLote: Dispatch<SetStateAction<string[] | null>>;
  toast: Avisar;
  anular: Anular;
  depoisDeApagarVarios: (
    corpos: unknown[],
    frase: string,
    depoisDeRepor?: (repostos: number[]) => void,
  ) => void;
  revalidarPedidos: (forcar?: boolean) => Promise<void>;
}

export function useAccoesEmLote({
  userName,
  quotes,
  setQuotes,
  quotesRef,
  setSelected,
  selectedRef,
  absorverDoServidor,
  setSelectedIds,
  setLote,
  bulkBusy,
  contarMaisUmNoLote,
  setAApagarLote,
  setAArquivarLote,
  toast,
  anular,
  depoisDeApagarVarios,
  revalidarPedidos,
}: EntradasAccoesEmLote) {
  /**
   * Os pedidos que um lote mudou, na lista e — o aberto — no painel, com os
   * campos dele (`absorverDoServidor`). Trocar só o pedido deixava o campo do
   * estado do painel no valor antigo, e o «Guardar» seguinte desfazia o lote
   * (júri de 17/11).
   */
  function absorverVarios(porId: ReadonlyMap<string, Quote>) {
    setQuotes((prev) => comPedidosSubstituidos(prev, porId));
    const doAberto = porId.get(selectedRef.current?.id ?? "");
    if (doAberto) absorverDoServidor(doAberto);
  }
  /**
   * Apply a status to every selected pedido in one go.
   *
   * Os `ids` vêm de fora, e são sempre os que estão À VISTA (ver
   * `seleccionadosAVista`). Lidos daqui de dentro eram a selecção crua — que
   * inclui o que o filtro e a procura tiraram do ecrã.
   */
  async function applyBulkStatus(status: QuoteStatus, ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    setLote({ titulo: "A marcar os pedidos…", feito: 0, total: ids.length });
    // O estado de cada um ANTES — é para onde o «Anular» os leva de volta.
    const antes = new Map(quotes.filter((q) => ids.includes(q.id)).map((q) => [q.id, q.status]));
    try {
      // N de cada vez (revisão · 3): ver `lib/concorrencia.ts`. A contagem sobe à
      // medida que cada pedido responde.
      const results = await comLimite(ids, ESCRITAS_EM_SIMULTANEO, (id) =>
        fetch(`/api/orcamento/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
          .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
          .catch(() => null)
          .then((v) => {
            contarMaisUmNoLote();
            return v;
          }),
      );
      const updated = new Map<string, Quote>();
      results.forEach((u, i) => {
        if (u && typeof u === "object") updated.set(ids[i], { ...u, id: u.id ?? ids[i] });
      });
      if (updated.size > 0) {
        absorverVarios(updated);
      }
      const ok = updated.size;
      const failed = ids.length - ok;
      // Os que ficaram têm «Anular», mesmo que outros tenham falhado: o que
      // aconteceu tem de se poder desfazer (revisão · 3).
      if (ok > 0) {
        // «Anular» repõe cada um no estado em que estava (e desfaz o Ganho dos
        // que lá foram por este gesto). Ver `anular-estado.ts`.
        anular(`${ok} pedido${ok !== 1 ? "s" : ""} atualizado${ok !== 1 ? "s" : ""}`, async () => {
          /* Só volta quem AINDA está no estado que este gesto pôs, e tinha
             outro antes. Um «Anular» carregado depois de o pedido ter mudado
             outra vez repunha-o por cima do gesto novo — e desfazia um «Ganho»
             que já não era deste gesto (2.ª revisão · 6). */
          const agora = new Map(quotesRef.current.map((q) => [q.id, q.status] as const));
          const aRepor = [...updated.keys()].filter((id) => {
            const de = antes.get(id);
            return !!de && de !== status;
          });
          const mudaramOutraVez = aRepor.filter((id) => agora.get(id) !== status);
          const vaoVoltar = aRepor.filter((id) => agora.get(id) === status);
          const repostos = await comLimite(vaoVoltar, ESCRITAS_EM_SIMULTANEO, (id) =>
            reporEstadoDoPedido({ quoteId: id, de: antes.get(id)!, para: status, actor: userName }),
          );
          // Os que voltaram aplicam-se SEMPRE, mesmo que outros falhem
          // (2.ª revisão · 2): `comLimite` dá um resultado por item.
          const porId = new Map(
            repostos.filter((q): q is Quote => !!q).map((q) => [q.id, q] as const),
          );
          absorverVarios(porId);
          const avisos: string[] = [];
          if (mudaramOutraVez.length > 0) {
            const n = mudaramOutraVez.length;
            avisos.push(
              `${n} pedido${n !== 1 ? "s" : ""} já tinha${n !== 1 ? "m" : ""} mudado outra vez e ficou como está.`,
            );
          }
          if (porId.size < vaoVoltar.length) {
            avisos.push(
              `${porId.size} de ${vaoVoltar.length} voltaram. Tenta outra vez no painel de cada pedido.`,
            );
          }
          if (avisos.length > 0) throw new Error(avisos.join(" "));
        });
      }
      if (failed > 0) {
        toast(
          `${failed} pedido${failed !== 1 ? "s" : ""} não mudaram e ficam selecionados. Verifica a ligação e tenta outra vez.`,
          "error",
        );
      }
      // Só saem da selecção os que mudaram: os que falharam ficam lá para ela
      // tentar outra vez com um toque (revisão · 3).
      esquecerDaSeleccao([...updated.keys()]);
    } finally {
      setLote(null);
    }
  }

  /**
   * ── ARQUIVAR E RESTAURAR EM LOTE (BO 4) ────────────────────────────────────
   *
   * O mesmo gesto do «Arquivar pedido» do painel, a N pedidos de uma vez: o
   * mesmo `PATCH { archived }`, o mesmo contador do lote (`EmCurso`, a subir a
   * cada um que responde), e o «Anular» da casa, que devolve ao estado de
   * antes só os que mudaram.
   *
   * Revisão · 3: até 10, sem pergunta — o «Anular» chega. Acima de 10 pergunta
   * primeiro, com o número («Arquivar 37 pedidos?»), porque um ⌘A num ecrã de
   * cinquenta tira cinquenta pedidos da frente de uma vez. As escritas vão
   * `ESCRITAS_EM_SIMULTANEO` de cada vez; se algumas falham, só essas ficam
   * selecionadas, e as que ficaram têm o seu «Anular».
   */
  function pedirParaArquivar(arquivar: boolean, ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    if (arquivar && ids.length > ARQUIVAR_SEM_PERGUNTAR) {
      setAArquivarLote(ids);
      return;
    }
    void applyBulkArchive(arquivar, ids);
  }

  async function applyBulkArchive(arquivar: boolean, ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    setLote({
      titulo: arquivar ? "A arquivar os pedidos…" : "A restaurar os pedidos…",
      feito: 0,
      total: ids.length,
    });
    const mudar = (id: string, archived: boolean) =>
      fetch(`/api/orcamento/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
        .catch(() => null);
    try {
      const results = await comLimite(ids, ESCRITAS_EM_SIMULTANEO, (id) =>
        mudar(id, arquivar).then((v) => {
          contarMaisUmNoLote();
          return v;
        }),
      );
      const updated = new Map<string, Quote>();
      results.forEach((u, i) => {
        if (u && typeof u === "object") updated.set(ids[i], { ...u, id: u.id ?? ids[i] });
      });
      if (updated.size > 0) {
        absorverVarios(updated);
      }
      const ok = updated.size;
      const failed = ids.length - ok;
      const feito = arquivar ? "arquivado" : "restaurado";
      if (ok > 0) {
        anular(`${plural(ok, `pedido ${feito}`, `pedidos ${feito}s`)}.`, async () => {
          const voltaram = await comLimite([...updated.keys()], ESCRITAS_EM_SIMULTANEO, (id) =>
            mudar(id, !arquivar),
          );
          const porId = new Map(
            voltaram
              .filter((q): q is Quote => !!q && typeof q.id === "string")
              .map((q) => [q.id, q]),
          );
          absorverVarios(porId);
          if (porId.size < updated.size) {
            throw new Error(
              `${porId.size} de ${updated.size} voltaram. Tenta outra vez no painel de cada pedido.`,
            );
          }
        });
      }
      if (failed > 0) {
        toast(
          `${failed} pedido${failed !== 1 ? "s" : ""} não ${arquivar ? "foram arquivados" : "foram restaurados"} e ficam selecionados. Verifica a ligação e tenta outra vez.`,
          "error",
        );
      }
      esquecerDaSeleccao([...updated.keys()]);
    } finally {
      setLote(null);
    }
  }

  /** Tira do lote os pedidos sobre que se acabou de agir, e só esses: o resto
   *  da selecção é dela e não se apaga por causa de um gesto sobre outros. */
  function esquecerDaSeleccao(ids: string[]) {
    const feitos = new Set(ids);
    setSelectedIds((prev) => new Set([...prev].filter((id) => !feitos.has(id))));
  }

  // Apaga cada pedido seleccionado — vão 30 dias para a Reciclagem, com um só
  // «Anular» para todos (R3b). One confirm covers the whole batch; each id is
  // DELETEd, then the successful ones are dropped from local state and the
  // selection is cleared. Os `ids` são os que estão À VISTA — ver
  // `applyBulkStatus`.
  function deleteSelected(ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    // A pergunta NOMEIA-OS. «Apagar 12 pedidos?» é um número que não se
    // consegue verificar: quem o lê não sabe se a selecção é a que pensa que
    // é, e a única maneira de saber era cancelar e contar à mão.
    setAApagarLote(ids);
  }

  /** Os nomes dos pedidos seleccionados, cortados a `NOMES_A_MOSTRAR`. */
  function nomesDoLote(ids: string[] | null): string[] {
    if (!ids || ids.length === 0) return [];
    const porId = new Map(quotes.map((q) => [q.id, q]));
    const nomes = ids.map((id) => porId.get(id)?.name ?? id);
    if (nomes.length <= NOMES_A_MOSTRAR) return nomes;
    return [...nomes.slice(0, NOMES_A_MOSTRAR), `… e mais ${nomes.length - NOMES_A_MOSTRAR}`];
  }

  async function apagarMesmo(ids: string[]) {
    setAApagarLote(null);
    setLote({ titulo: "A apagar os pedidos…", feito: 0, total: ids.length });
    try {
      // N de cada vez, como as outras escritas em lote (`lib/concorrencia.ts`).
      const results = await comLimite(ids, ESCRITAS_EM_SIMULTANEO, (id) =>
        fetch(`/api/orcamento/${id}`, { method: "DELETE" })
          .then(async (r) => (r.ok ? { id, corpo: await r.json().catch(() => null) } : null))
          .catch(() => null)
          .then((v) => {
            contarMaisUmNoLote();
            return v;
          }),
      );
      const apagados = results.filter((x): x is { id: string; corpo: unknown } => x !== null);
      const removed = new Set(apagados.map((x) => x.id));
      if (removed.size > 0) {
        setQuotes((prev) => semPedidos(prev, removed));
        setSelected((prev) => (prev && removed.has(prev.id) ? null : prev));
      }
      const ok = removed.size;
      const failed = ids.length - ok;
      if (failed === 0) {
        depoisDeApagarVarios(
          apagados.map((x) => x.corpo),
          `${ok} pedido${ok !== 1 ? "s" : ""} apagado${ok !== 1 ? "s" : ""}.`,
          () => void revalidarPedidos(true),
        );
      } else {
        toast(`${ok} apagado(s), ${failed} falhou(ram)`, "error");
      }
      esquecerDaSeleccao(ids);
    } finally {
      setLote(null);
    }
  }
  return {
    nomesDoLote,
    apagarMesmo,
    applyBulkArchive,
    applyBulkStatus,
    pedirParaArquivar,
    deleteSelected,
  };
}
