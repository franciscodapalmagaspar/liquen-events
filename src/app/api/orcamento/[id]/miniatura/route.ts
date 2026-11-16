import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import { miniaturaAPedidoComMotivo } from "@/lib/derivadas";
import { ehRefDeTema } from "@/lib/theme-ref";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

// `sharp` precisa do runtime de Node.
export const runtime = "nodejs";
// Um download do Storage + um `sharp` + um upload. Na ordem dos 300–800 ms;
// trinta segundos travam um pedido que tenha ficado preso sem ser generoso.
export const maxDuration = 30;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MINIATURA DE UMA FOTO ANTIGA, PARA A CÉLULA NÃO PUXAR O ORIGINAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
 * quando estava a fazer a proposta e não consigo». Em 4G.
 *
 * As fotografias carregadas DEPOIS de as miniaturas existirem trazem a sua, e
 * para essas o `listProposalImages` devolve o URL assinado do Storage — esta
 * rota nunca chega a ser chamada. As que ficaram para trás não têm nenhuma, e
 * até aqui a grelha caía para o ORIGINAL.
 *
 * O número que obriga a isto, medido no estúdio a 1,6 Mbps com 24 células:
 *
 *     original    1099 KB por célula   →  26,4 MB nas 24, primeira foto aos 34,0 s
 *     miniatura     20 KB por célula   →   0,4 MB nas 24, primeira foto aos  2,5 s
 *
 * Cinquenta e cinco vezes menos, para uma caixa de 174 px que nunca soube o que
 * fazer com 1707 px de largura.
 *
 * ── PORQUE É QUE ISTO É UMA ROTA E NÃO UM BOTÃO ───────────────────────────
 * Há um botão — o painel «Miniaturas» chama `/api/admin/derivadas` e trata da
 * biblioteca inteira. Mas um botão que ninguém carregou não gerou miniatura
 * nenhuma, e quem paga o preço disso é ela, no telemóvel, a meio de uma
 * proposta. Aqui a primeira abertura fabrica o que falta E GUARDA-O: da segunda
 * vez em diante o Storage já a tem e esta rota deixa de ser chamada para
 * aquela foto. O painel continua a servir para tratar tudo de uma vez.
 *
 * ── E DEPOIS DE A MINIATURA JÁ EXISTIR? ───────────────────────────────────
 * O estúdio guarda no `localStorage` o URL que desenhou, e este NÃO expira (não
 * leva token nenhum), portanto continua a ser o que ele usa mesmo depois de o
 * `listProposalImages` passar a devolver a assinatura directa do Storage. É
 * deliberado e é o lado bom da troca: com `immutable`, o navegador já a tem e
 * não pede nada; uma assinatura fresca seria um URL novo e um download novo de
 * bytes idênticos (é a mesma armadilha que o `assinatura.ts` descreve). Quando
 * a cache do navegador é limpa, isto custa um pedido que lê a miniatura já
 * guardada — sem `sharp` nenhum.
 *
 * ── O QUE ACONTECE QUANDO NÃO DÁ ──────────────────────────────────────────
 * 404 — e o 404 FICA. A célula tem plano B (`useFotoComPlanoB`) e cai para o
 * original, que é exactamente o comportamento de antes desta rota existir. Um
 * erro aqui nunca pode ser uma foto que desaparece.
 *
 * O QUE NÃO FICA É O SILÊNCIO. Este endereço é o URL PRINCIPAL de todas as
 * fotografias sem miniatura guardada (o `/assets` devolve-o em `thumbUrl`), e
 * era «404, e mais nada» para seis avarias com resoluções diferentes. Quando
 * o plano B também não vem — foi o que aconteceu em produção, com a política
 * de segurança a recusar o Storage —, a única coisa que sobrava no mundo era
 * uma célula a dizer «não consegui mostrá-la». Do lado do servidor, nada.
 *
 * Por isso toda a recusa leva agora `X-Motivo` e fica registada. O cabeçalho
 * está no `curl -I` de quem investiga e nos registos da plataforma; o ecrã não
 * muda de comportamento com ele, que é como tem de ser.
 */
/** A recusa, com o motivo onde quem investiga o encontra. */
function recusa(motivo: string, mensagem: string, estado: number): NextResponse {
  return NextResponse.json(
    { error: mensagem, motivo },
    { status: estado, headers: { "X-Motivo": motivo } },
  );
}

async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return recusa("sem-sessao", "Não autorizado", 401);
  }
  if (!isDatabaseConfigured()) {
    return recusa("sem-storage", "Armazenamento indisponível.", 503);
  }
  const { id } = await params;
  const ref = request.nextUrl.searchParams.get("ref") ?? "";
  if (!ref) return recusa("sem-ref", "Falta o `ref`.", 400);

  /**
   * O GUARDA: uma sessão de admin não é autorização para ler a pasta de
   * QUALQUER pedido a partir do endereço de outro.
   *
   * Duas famílias, e só duas: uma referência à Biblioteca de Temas (que é
   * partilhada por todas as propostas, e portanto legítima em qualquer id), ou
   * um caminho DENTRO da pasta deste pedido. O `safeId` é limpo da mesma
   * maneira que o `uploadProposalImage` o limpa quando escreve — se as duas
   * limpezas divergissem, o guarda passaria a olhar para uma pasta que não é a
   * que está no Storage.
   */
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const daBiblioteca: boolean = ehRefDeTema(ref);
  if (!daBiblioteca && !ref.startsWith(`${safeId}/`)) {
    return recusa("fora-do-pedido", "Não autorizado", 403);
  }
  if (ref.includes("..")) {
    return recusa("caminho-invalido", "Caminho inválido.", 400);
  }

  try {
    const { bytes, motivo, detalhe } = await miniaturaAPedidoComMotivo(ref);
    // «Não deu» não é erro do lado dela: a célula cai para o original sozinha.
    // Mas passa a ficar DITO qual das causas foi — no cabeçalho, para quem
    // estiver a olhar para a rede, e nos registos, para quem só lá chega no dia
    // seguinte.
    if (!bytes) {
      log.warn("miniatura: não foi servida", { id, ref, motivo, detalhe });
      return new NextResponse(null, { status: 404, headers: { "X-Motivo": motivo } });
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // `immutable` porque o caminho tem um UUID: aqueles bytes nunca mudam.
        // `private` porque isto é o back office — nenhuma cache partilhada pode
        // ficar com a fotografia de um casamento.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    log.error("miniatura: falhou", e, { id, ref });
    return new NextResponse(null, {
      status: 404,
      headers: { "X-Motivo": "avaria-inesperada" },
    });
  }
}

export const GET = comCpu("miniatura GET", GET_semMedida);
