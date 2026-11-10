import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enviarEventos, ipDoPedido, type EventoParaEnviar } from "@/lib/meta/capi";
import { NOMES_VALIDOS, EVENT_ID_VALIDO, EVENTOS, type NomeEvento } from "@/lib/meta/eventos";
import { podeEnviarDoServidor } from "@/lib/meta/consentimento";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O LADO DE SERVIDOR DA MEDIÇÃO DA META
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O browser manda para aqui o que acabou de mandar para o pixel, com o MESMO
 * `event_id`, e este handler reenvia pela Conversions API. A Meta reconhece os
 * dois como um só acontecimento e conta uma vez — ver `eventos.ts`.
 *
 * ── PORQUE É QUE O BROWSER NÃO FALA DIRECTAMENTE COM A META ────────────────
 * Porque o token de acesso ficaria no código da página, à vista de qualquer
 * pessoa que abra o inspector — e um token de CAPI permite escrever eventos no
 * conjunto de dados dela. Passar aqui é o que mantém o token no servidor.
 *
 * ── O QUE ESTE HANDLER RECUSA ──────────────────────────────────────────────
 *   • nomes de evento fora da lista (impede que alguém encha a conta dela de
 *     eventos inventados);
 *   • `Purchase` vindo do browser. O valor de um casamento fechado é o número
 *     de que dependem as decisões de orçamento — não pode ser afirmado por
 *     quem quer que consiga fazer um POST. Só o back office o envia, e por
 *     outro caminho;
 *   • pedidos sem consentimento declarado (ver `consentimento.ts`);
 *   • mais de 20 eventos por minuto por IP.
 *
 * ── O QUE ESTE HANDLER NUNCA FAZ ───────────────────────────────────────────
 * Devolver erro que atrapalhe a página. Responde sempre 200 com o que se
 * passou lá dentro. Uma falha de medição não pode partir uma landing page.
 */

export const maxDuration = 10;

const eventoSchema = z.object({
  nome: z.string().refine((v) => NOMES_VALIDOS.includes(v), "evento desconhecido"),
  eventId: z.string().regex(EVENT_ID_VALIDO, "event_id inválido"),
  /** Milissegundos UNIX, tal como o browser os produz. */
  quando: z.number().finite().optional(),
  url: z.string().max(500).optional(),
  contexto: z.string().max(120).optional(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(600).optional(),
  email: z.string().max(160).optional(),
  telefone: z.string().max(40).optional(),
  nomeDaPessoa: z.string().max(120).optional(),
});

const corpoSchema = z.object({
  /** O que o cliente declara sobre o consentimento neste dispositivo. */
  consentido: z.boolean(),
  eventos: z.array(eventoSchema).min(1).max(5),
});

/**
 * Limpa o URL antes de o mandar para fora.
 *
 * Corta a query inteira. Não é excesso de zelo: as landing pages sociais
 * recebem `fbclid` e os parâmetros de UTM, e o `fbclid` já vai no `fbc` — não
 * precisa de ir outra vez dentro do URL. E a regra "a query nunca sai" é a
 * única que continua verdadeira quando alguém acrescentar um parâmetro novo
 * daqui a seis meses sem se lembrar desta linha.
 */
export function limparUrl(cru: string): string {
  try {
    const u = new URL(cru);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    sweep();
    const limitado = await rateLimit(`meta:${clientIp(request)}`, 20, 60_000);
    if (!limitado.ok) {
      return NextResponse.json({ enviado: false, motivo: "limite" }, { status: 200 });
    }

    const cru = await request.json().catch(() => null);
    const parsed = corpoSchema.safeParse(cru);
    if (!parsed.success) {
      return NextResponse.json({ enviado: false, motivo: "pedido-invalido" }, { status: 200 });
    }
    const { consentido, eventos } = parsed.data;

    if (!podeEnviarDoServidor(consentido)) {
      // Não é um erro: é o comportamento correcto. Sem consentimento não sai
      // nada, e quem chama fica a saber porquê.
      return NextResponse.json({ enviado: false, motivo: "sem-consentimento" }, { status: 200 });
    }

    // `Purchase` só do back office, e `Lead` só atrás de um pedido gravado
    // (`/api/orcamento`, `reenviarLeadParaMeta`) — 10/11. Esta rota é pública:
    // aqui qualquer pessoa podia inventar «pedidos» e ensinar os anúncios a
    // procurar gente que não existe. O browser continua a mandar o `Lead` pelo
    // pixel, com o mesmo `event_id`; a Meta junta os dois.
    if (eventos.some((e) => e.nome === EVENTOS.purchase || e.nome === EVENTOS.lead)) {
      log.warn("meta: Purchase/Lead recusado por vir do browser");
      return NextResponse.json({ enviado: false, motivo: "evento-nao-permitido" }, { status: 200 });
    }

    const agoraS = Math.floor(Date.now() / 1000);
    const ip = ipDoPedido(request.headers);
    const agente = request.headers.get("user-agent") ?? "";

    const paraEnviar: EventoParaEnviar[] = eventos.map((e) => ({
      nome: e.nome as NomeEvento,
      eventId: e.eventId,
      // O relógio do browser pode estar errado, e um `event_time` no futuro é
      // recusado pela Meta. Aceita-se o do cliente só se for plausível — até
      // uma hora para trás e nunca à frente do relógio do servidor.
      quando: (() => {
        if (typeof e.quando !== "number") return agoraS;
        const s = Math.floor(e.quando / 1000);
        return s > agoraS || agoraS - s > 3600 ? agoraS : s;
      })(),
      url: e.url ? limparUrl(e.url) : undefined,
      fonte: "website",
      contexto: e.contexto,
      pessoa: {
        fbp: e.fbp,
        fbc: e.fbc,
        email: e.email,
        telefone: e.telefone,
        nome: e.nomeDaPessoa,
        ip: ip || undefined,
        agente: agente || undefined,
      },
    }));

    const r = await enviarEventos(paraEnviar);
    if (!r.enviado && r.motivo !== "sem-configuracao") {
      log.error("meta: envio pela CAPI falhou", undefined, {
        motivo: r.motivo,
        detalhe: r.detalhe,
      });
    }
    return NextResponse.json(r, { status: 200 });
  } catch (err) {
    log.error("meta POST falhou", err);
    // 200 mesmo assim: ver o cabeçalho.
    return NextResponse.json({ enviado: false, motivo: "erro" }, { status: 200 });
  }
}
