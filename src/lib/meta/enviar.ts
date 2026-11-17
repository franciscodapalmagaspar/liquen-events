import { EVENTOS, novoEventId, type NomeEvento } from "./eventos";
import { lerIdentificadores } from "./click-id";
import { temConsentimento } from "./consentimento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DISPARAR UM EVENTO PARA A META, PELOS DOIS CAMINHOS AO MESMO TEMPO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma chamada, um `event_id`, dois destinos:
 *
 *   1. o pixel, no browser — `fbq('track', nome, dados, { eventID })`;
 *   2. a nossa rota `/api/meta`, que reenvia pela Conversions API com o MESMO
 *      `event_id`.
 *
 * O `event_id` é gerado AQUI, uma vez. É esse detalhe que faz a deduplicação
 * funcionar; ver o cabeçalho de `eventos.ts`.
 *
 * ── PORQUE É QUE O SEGUNDO ENVIO É `sendBeacon` E NÃO `fetch` ──────────────
 * Porque metade destes eventos acontece a sair da página: um toque no WhatsApp
 * abre outra aplicação, e um `fetch` normal é cancelado quando a página é
 * descarregada. O `sendBeacon` é entregue pelo browser depois de a página
 * morrer, que é precisamente o caso. Onde não existe, recorre-se ao `fetch`
 * com `keepalive`, que faz o mesmo com mais anos de estrada.
 *
 * ── NUNCA LANÇA ────────────────────────────────────────────────────────────
 * Um erro de medição não pode impedir um clique de ir para o WhatsApp nem um
 * formulário de submeter. Tudo aqui está embrulhado.
 */

type Fbq = ((...args: unknown[]) => void) & { loaded?: boolean };

export interface DadosDoEvento {
  /** Que página gerou isto, por exemplo "s/comporta". */
  contexto?: string;
  /**
   * Já NÃO saem do browser (auditoria de 16/11, n.º 8): a rota pública
   * descarta-os, e o `Lead` com os dados vai pelo servidor, atrás do pedido
   * gravado. Ficam no tipo para quem ainda os passa não ter de mudar.
   */
  email?: string;
  telefone?: string;
  nome?: string;
}

/**
 * Dispara o evento. Devolve o `event_id` usado, para quem precise de o
 * guardar (a submissão do formulário guarda-o com o pedido).
 */
export function dispararMeta(nome: NomeEvento, dados: DadosDoEvento = {}): string {
  const eventId = novoEventId();
  if (typeof window === "undefined") return eventId;

  const consentido = temConsentimento();

  // ── 1. O pixel ──────────────────────────────────────────────────────────
  // Só existe se o consentimento tiver sido dado (o componente MetaPixel só o
  // carrega nesse caso), portanto esta chamada é naturalmente inerte sem
  // consentimento. A verificação continua aqui à mesma: é barata e não
  // depende de outro ficheiro continuar a comportar-se como hoje.
  try {
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    if (consentido && typeof fbq === "function") {
      const custom: Record<string, unknown> = {};
      if (dados.contexto) {
        custom.content_name = dados.contexto;
        custom.content_category = "casamentos";
      }
      fbq("track", nome, custom, { eventID: eventId });
    }
  } catch {
    /* medição nunca parte a página */
  }

  // ── 2. A Conversions API, pelo nosso servidor ───────────────────────────
  try {
    if (!consentido) return eventId;
    const { fbp, fbc } = lerIdentificadores();
    const corpo = JSON.stringify({
      consentido,
      eventos: [
        {
          nome,
          eventId,
          quando: Date.now(),
          url: location.href,
          contexto: dados.contexto,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
          // Sem email, telefone nem nome: a rota descarta-os (n.º 8 de
          // 16/11) — só os eventos que nascem no servidor os levam.
        },
      ],
    });
    const enviarPorBeacon = () => {
      if (typeof navigator.sendBeacon !== "function") return false;
      // `type: "application/json"` é preciso: sem ele o beacon vai como
      // `text/plain` e a rota, que faz `request.json()`, ainda o lê — mas o
      // proxy de CSRF do sítio olha para o cabeçalho `Origin`, e um pedido
      // com o tipo errado é o género de coisa que passa hoje e parte quando
      // alguém apertar a validação. Declara-se o que é.
      return navigator.sendBeacon("/api/meta", new Blob([corpo], { type: "application/json" }));
    };
    if (!enviarPorBeacon()) {
      void fetch("/api/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        keepalive: true,
      }).catch(() => {
        /* idem */
      });
    }
  } catch {
    /* idem */
  }

  return eventId;
}

/** Atalhos legíveis, para quem chama não ter de importar `EVENTOS`. */
export const meta = {
  verConteudo: (d?: DadosDoEvento) => dispararMeta(EVENTOS.viewContent, d),
  comecouFormulario: (d?: DadosDoEvento) => dispararMeta(EVENTOS.initiateCheckout, d),
  lead: (d?: DadosDoEvento) => dispararMeta(EVENTOS.lead, d),
  contacto: (d?: DadosDoEvento) => dispararMeta(EVENTOS.contact, d),
};
