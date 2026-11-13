import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Carregamento from "./Carregamento";
import AdminLogin from "../../AdminLogin";
import { ADMIN_COOKIE, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import { sessaoValida } from "@/lib/sessoes-revogadas";
import { getEventMaterial } from "@/lib/event-material-store";
import { getQuote } from "@/lib/quotes-store";

/**
 * A ROTA DO CARREGAMENTO.
 *
 * `[eventId]` é o id da CHECKLIST, não o do pedido: é o que se pode passar a
 * quem vai carregar sem lhe dar acesso ao pedido inteiro, e é o endereço que o
 * service worker conhece pelo nome (ver `public/sw.js`).
 *
 * Mesma sessão do back office — não há aqui uma segunda porta de entrada.
 */
export const metadata: Metadata = {
  title: "Carregamento — Líquen Events",
  robots: { index: false, follow: false },
};

export default async function CarregamentoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const store = await cookies();
  // Com as revogações (sair, palavra-passe redefinida) — ver `sessoes-revogadas.ts`.
  const session = await sessaoValida(store.get(ADMIN_COOKIE)?.value);
  if (!session) return <AdminLogin />;

  const { eventId } = await params;
  const evento = await getEventMaterial(eventId);
  if (!evento) notFound();

  const quote = await getQuote(evento.quoteId);
  const titulo = quote
    ? `${quote.name ?? "Evento"}${quote.date ? ` · ${quote.date}` : ""}`
    : "Evento";

  const actor =
    session.name || store.get(ADMIN_NAME_COOKIE)?.value || process.env.ADMIN_NAME || "Equipa";

  return (
    <Carregamento quoteId={evento.quoteId} eventId={evento.id} titulo={titulo} actor={actor} />
  );
}
