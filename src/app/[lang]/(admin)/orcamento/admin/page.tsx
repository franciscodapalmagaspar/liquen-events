import type { Metadata } from "next";
import { cookies } from "next/headers";
import { porqueNaoLeuDoErro, type LeituraFalhada } from "@/lib/porque-nao-leu";
import { log } from "@/lib/logger";
import type { QuoteSummary } from "@/lib/orcamento/types";
import { isDatabaseConfigured } from "@/lib/supabase";
import AdminClient, { VIEW_COOKIE } from "./AdminClient";
import { vistaValida, type View } from "./nav";
import MedidorDeTransbordo from "./MedidorDeTransbordo";
import AdminLogin from "./AdminLogin";
import { ToastProvider } from "./Toast";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import { ADMIN_COOKIE, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import { sessaoValida } from "@/lib/sessoes-revogadas";
import { listQuoteSummaries } from "@/lib/quotes-store";

// Kept out of robots.txt (crawling) *and* given noindex here (indexing) —
// disallow alone only stops crawling; a stray external link could still get
// the bare URL indexed with no way for Google to see this tag.
export const metadata: Metadata = {
  title: "Admin — Líquen Events",
  robots: { index: false, follow: false },
};

/**
 * A lista vai em RESUMO. O pedido inteiro é grande (150 convidados, checklist,
 * plano de produção, cronograma) e tudo isso era serializado para dentro deste
 * HTML, 300 vezes, antes de haver um pixel desenhado. O que a lista, os
 * filtros e os painéis de conjunto lêem continua cá todo; o resto vai buscar-se
 * quando um pedido é ABERTO. Ver `resumirQuote` em quotes-store.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LISTA VAZIA E UMA LEITURA FALHADA NÃO SÃO A MESMA COISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era um `catch { return [] }`. Com a base de dados em baixo, o back
 * office inteiro abria como se ela não tivesse pedido nenhum — e o ecrã de
 * Clientes dizia-lhe, com toda a confiança, «Sem clientes ainda».
 *
 * É a mesma classe de mentira que o `porque-nao-leu` veio nomear: **uma
 * leitura que não aconteceu não sabe afirmar que não há nada.** E é a pior das
 * versões dela, porque é a primeira coisa que se vê ao entrar.
 *
 * A falha viaja agora até quem a pode dizer. Nada mais muda: a lista continua
 * a ser `[]`, o back office continua a abrir, e os ecrãs que não recebem a
 * falha comportam-se exactamente como antes.
 */
async function getQuotes(): Promise<{ quotes: QuoteSummary[]; falha: LeituraFalhada | null }> {
  try {
    return { quotes: await listQuoteSummaries(), falha: null };
  } catch (e) {
    log.error("admin: a lista de pedidos não veio", e);
    return { quotes: [], falha: porqueNaoLeuDoErro("os pedidos", e) };
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const store = await cookies();
  // Com as revogações (sair, palavra-passe redefinida) — ver `sessoes-revogadas.ts`.
  const session = await sessaoValida(store.get(ADMIN_COOKIE)?.value);

  if (!session) {
    return <AdminLogin />;
  }

  const { quotes, falha: falhaDosPedidos } = await getQuotes();
  // Trust the signed session name first; fall back to the display cookie.
  /**
   * ── A SECÇÃO COM QUE ABRIR, DECIDIDA AQUI ───────────────────────────────
   *
   * MEDIDO por uma auditoria, em separador limpo: a ~1 s aparecia a Visão
   * Geral, a ~2 s a aplicação trocava sozinha para a última secção usada e o
   * menu lateral fechava-se. Quem entrou para ver a Visão Geral via-a
   * desaparecer-lhe da frente.
   *
   * A memória estava no `localStorage`, que só existe depois de a página estar
   * desenhada — portanto a escolha dela só podia ser aplicada como uma
   * CORRECÇÃO, à vista. O cookie é a mesma memória por aparelho, mas viaja com
   * o pedido: o servidor desenha logo o que ela quer ver.
   *
   * O valor é validado contra o menu e não usado tal e qual: um cookie é
   * escrito pelo browser e pode vir com o que lá puserem.
   */
  /**
   * ── E O ENDEREÇO GANHA AO COOKIE ────────────────────────────────────────
   *
   * O cookie é a MEMÓRIA («onde é que eu ia»); o `?v=` é a INTENÇÃO («leva-me
   * aqui»). Um favorito, um link mandado a alguém, um segundo separador aberto
   * noutra secção — nos três casos há uma intenção escrita no endereço, e ela
   * tem de ganhar à memória de ontem. Sem isto, abrir um favorito das Propostas
   * levava-a à última secção usada e o favorito não servia para nada.
   *
   * Decidido AQUI, no servidor, e não a corrigir no cliente depois: é a mesma
   * razão que tirou o salto de secção do arranque — uma escolha aplicada depois
   * do primeiro desenho é uma escolha que se vê a acontecer.
   *
   * ── E VALIDADO CONTRA AS VISTAS, NÃO CONTRA O MENU ──────────────────────
   *
   * Isto dizia `NAV.some(...)`, e o `NAV` não tem as vistas todas — o próprio
   * `nav.tsx` explica que várias ficam de fora de propósito para não encher o
   * menu, «e ainda assim desenham-se se lá chegarem por um link directo». Não
   * chegavam: o cookie de uma delas era recusado e ela ia parar à Visão Geral.
   */
  const { v } = await searchParams;
  const doEndereco = vistaValida(typeof v === "string" ? v : undefined);
  const doCookie = vistaValida(store.get(VIEW_COOKIE)?.value);
  const vistaInicial: View | undefined = doEndereco ?? doCookie;

  const userName =
    session.name || store.get(ADMIN_NAME_COOKIE)?.value || process.env.ADMIN_NAME || "Equipa";
  /**
   * O REGISTO DE GRAVAÇÕES ENVOLVE O BACK OFFICE INTEIRO, E ENVOLVE-O DAQUI.
   *
   * Tem de ficar POR FORA do `AdminClient`: o painel do pedido inscreve-se no
   * registo, e um componente não pode ler um contexto que é ele próprio a
   * fornecer. Daqui, tudo o que está lá dentro — o painel, o estúdio de
   * propostas, o construtor de orçamentos, os modelos de email — fica debaixo
   * do mesmo registo, e o botão «Guardar tudo» do cabeçalho fala por todos eles
   * com uma verdade só.
   */
  return (
    <ToastProvider>
      <RegistoDeGravacoesProvider>
        <AdminClient
          initialQuotes={quotes}
          userName={userName}
          falhaDosPedidos={falhaDosPedidos}
          vistaInicial={vistaInicial}
          armazenamentoLigado={isDatabaseConfigured()}
        />
        {/* Instrumento, não funcionalidade: só aparece com `?medir=1` no
            endereço. Ver o cabeçalho do ficheiro — existe porque o transbordo
            horizontal que ela vê no iPhone não se reproduz em Chromium, e a
            única medição que vale é a que corre no aparelho dela. */}
        <MedidorDeTransbordo />
      </RegistoDeGravacoesProvider>
    </ToastProvider>
  );
}
