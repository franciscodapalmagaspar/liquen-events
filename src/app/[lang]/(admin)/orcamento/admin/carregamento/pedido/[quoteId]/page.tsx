import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AdminLogin from "../../../AdminLogin";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { sessaoValida } from "@/lib/sessoes-revogadas";
import { getForQuote } from "@/lib/event-material-store";
import { getQuote } from "@/lib/quotes-store";
import { ESTADO, PRESSAO } from "../../../ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO CARREGAMENTO PELO ID DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, o terceiro dos oito bloqueios:
 *
 *   «A checklist da carrinha — a única tarefa que É de telemóvel — está a
 *   quatro toques e não tem entrada nenhuma na navegação. É a tarefa do
 *   enunciado: de pé, ao lado da carrinha, mãos ocupadas, rede fraca — e é a
 *   que está mais fundo. Ironia amarga: o `sw.js` põe expressamente esta rota a
 *   funcionar offline. A casa fez o trabalho difícil e deixou por fazer o
 *   fácil: pô-la ao alcance do polegar.»
 *
 * ── Porque é que era preciso uma segunda porta ────────────────────────────
 *
 * A rota do carregamento é indexada pelo id da CHECKLIST, e não pelo do pedido
 * — de propósito, e a razão está escrita lá: é o endereço que se pode dar a
 * quem vai carregar a carrinha sem lhe dar acesso ao pedido inteiro.
 *
 * O preço disso é que só quem já leu a checklist sabe o endereço. A Visão
 * Geral, a Agenda e a lista de pedidos têm o id do PEDIDO e mais nada, e por
 * isso não podiam ligar para lá — era essa a razão técnica de a única ligação
 * em todo o repositório estar escondida a quatro toques de profundidade.
 *
 * Esta porta resolve o id e reencaminha. Fica com o mesmo guarda de sessão da
 * outra: não é uma segunda entrada no produto, é um segundo caminho para a
 * mesma sala.
 *
 * ── E quando ainda não há checklist ───────────────────────────────────────
 *
 * Diz-se. Um 404 aqui seria correcto e inútil — quem chega por este endereço
 * quer carregar a carrinha, e o que falta para isso é gerar a lista —, e um
 * reencaminhamento para o back office deixava-a no topo, sem saber porquê.
 *
 * O que NÃO se faz é mandar para «o pedido, com a Produção aberta»: o back
 * office não lê nada do endereço (não há `searchParams` no `AdminClient`), e um
 * link que promete abrir um painel e abre o ecrã inicial é pior do que um que
 * não promete nada.
 */
export const metadata: Metadata = {
  title: "Carregamento — Líquen Events",
  robots: { index: false, follow: false },
};

export default async function CarregamentoDoPedido({
  params,
}: {
  params: Promise<{ lang: string; quoteId: string }>;
}) {
  const store = await cookies();
  // Com as revogações (sair, palavra-passe redefinida) — ver `sessoes-revogadas.ts`.
  const session = await sessaoValida(store.get(ADMIN_COOKIE)?.value);
  if (!session) return <AdminLogin />;

  const { lang, quoteId } = await params;
  // O pedido tem de existir: sem isto, um id inventado passava a ser um
  // reencaminhamento para uma vista vazia em vez de um «não há».
  if (!(await getQuote(quoteId))) notFound();

  const evento = await getForQuote(quoteId);
  // O prefixo da língua: o português vive na raiz e o inglês em `/en` — é a
  // mesma regra que o service worker escreve para poder guardar esta rota
  // (`/^\\/(?:en\\/)?orcamento\\/admin\\/carregamento\\//`). Um `/pt/` aqui
  // saía fora dessa expressão, e a página deixava de abrir sem rede — que é a
  // única coisa que ela tem mesmo de fazer.
  const raiz = lang === "en" ? "/en" : "";
  if (evento) redirect(`${raiz}/orcamento/admin/carregamento/${evento.id}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10 text-center">
      <h1 className="font-display text-2xl text-[var(--bo-text)]">Ainda não há lista de carga</h1>
      <p className="text-sm leading-relaxed text-[var(--bo-text-muted)]">
        Este evento ainda não tem checklist de material gerada. Gera-a no pedido, em «Produção», e
        este endereço passa a abrir a carga.
      </p>
      <a
        href={`${raiz}/orcamento/admin`}
        className={`alvo-toque mx-auto inline-flex items-center rounded-xl border border-foreground/20 px-4 text-sm text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
      >
        Ir para o back office
      </a>
    </main>
  );
}
