"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { dominiosConhecidos, sugerirEmail } from "@/lib/dominio-parecido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS AVISOS DO PAINEL DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Ganho» sem nenhuma proposta enviada, o último e-mail devolvido, e o domínio
 * que parece mal escrito. São três perguntas que o painel faz ao pedido aberto
 * e que só mudam o que se DIZ — nenhuma trava nada. Viviam no corpo do
 * `AdminClient`; saíram tal e qual, pela mesma ordem (fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`).
 *
 * As duas respostas do servidor passam por uma leitura com forma (`nuncaSeguiu`,
 * `enderecoDevolvido`) em vez de se confiar no `any` do `r.json()`.
 */

/** `GET …/proposta-doc`: nenhuma proposta deste pedido chegou ao cliente? */
export function nuncaSeguiu(resposta: unknown): boolean {
  if (typeof resposta !== "object" || resposta === null) return false;
  const { acceptUrl }: { acceptUrl?: unknown } = resposta;
  return acceptUrl == null;
}

/** `GET …/entrega`: o endereço para onde o e-mail voltou, se voltou. */
export function enderecoDevolvido(resposta: unknown): string | null {
  if (typeof resposta !== "object" || resposta === null) return null;
  const { estado, endereco }: { estado?: unknown; endereco?: unknown } = resposta;
  return estado === "devolvido" && typeof endereco === "string" && endereco ? endereco : null;
}

interface Entrada {
  selected: Quote | null;
  setEditStatus: Dispatch<SetStateAction<QuoteStatus>>;
  editEmail: string;
  quotes: Quote[];
}

export function useAvisosDoPedido({ selected, setEditStatus, editEmail, quotes }: Entrada) {
  /**
   * Achado n.º 19 da auditoria: pôr um pedido em «Ganho» à mão criava um
   * contrato ligado a uma proposta que nunca tinha chegado ao cliente — sem
   * nada no ecrã a dizê-lo. Ao escolher «Ganho», pergunta-se ao servidor se
   * alguma proposta deste pedido seguiu (`acceptUrl` do GET do envio); se não,
   * fica o aviso por baixo do seletor. Não trava: pode ter sido aceite de boca.
   */
  const [ganhoSemProposta, setGanhoSemProposta] = useState<string | null>(null);
  const escolherEstado = (novo: QuoteStatus) => {
    setEditStatus(novo);
    setGanhoSemProposta(null);
    if (novo !== "aceite" || !selected || selected.status === "aceite") return;
    const id = selected.id;
    void fetch(`/api/orcamento/${id}/proposta-doc`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (nuncaSeguiu(j)) setGanhoSemProposta(id);
      })
      .catch(() => {
        /* sem resposta não se inventa um aviso */
      });
  };
  /**
   * «Querias dizer …@adecco.com?» (9/11): a proposta da Adecco foi para
   * «addecco.com» e voltou. Os domínios dos OUTROS pedidos e os de correio
   * comuns dizem que domínio se queria escrever. Só sugere — ver
   * `lib/dominio-parecido.ts`.
   */
  /**
   * O ÚLTIMO EMAIL AO CLIENTE VOLTOU PARA TRÁS? (9/11 — ela: «o sistema tem que
   * perceber logo se o e-mail existe ou não», depois de a proposta da Adecco ir
   * para «addecco.com»). Pergunta-se uma vez ao abrir o pedido; o servidor só
   * lê a caixa da Líquen se houve um envio nos últimos dias (ver
   * `lib/email-devolvido.ts`).
   */
  const [devolucao, setDevolucao] = useState<{ quoteId: string; endereco: string } | null>(null);
  const idDoAberto = selected?.id ?? null;
  // Só pergunta quando o histórico mostra mexidas nos últimos 7 dias (um envio
  // muda o estado do pedido): um pedido parado não custa um pedido à Vercel.
  const mexidoHaPouco = useMemo(() => {
    const limite = Date.now() - 7 * 86_400_000;
    return (selected?.activityLog ?? []).some(
      (e) =>
        (e.kind === "status_change" || e.kind === "proposal_sent" || e.kind === "message_sent") &&
        Date.parse(e.at) >= limite,
    );
  }, [selected?.activityLog]);
  useEffect(() => {
    if (!idDoAberto || !mexidoHaPouco) return;
    const ctl = new AbortController();
    fetch(`/api/orcamento/${encodeURIComponent(idDoAberto)}/entrega`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const endereco = enderecoDevolvido(j);
        setDevolucao(endereco ? { quoteId: idDoAberto, endereco } : null);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [idDoAberto, mexidoHaPouco]);
  const devolvidoAqui = devolucao && devolucao.quoteId === idDoAberto ? devolucao : null;
  const emailSugerido = useMemo(
    () =>
      sugerirEmail(
        editEmail,
        dominiosConhecidos(
          quotes.map((q) => q.email),
          editEmail,
        ),
      ),
    [editEmail, quotes],
  );
  return { ganhoSemProposta, escolherEstado, devolvidoAqui, emailSugerido };
}
