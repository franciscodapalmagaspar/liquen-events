"use client";

import { waHref } from "@/data";
import { meta } from "@/lib/meta/enviar";
import { track } from "@/lib/track";
import { rolarAteVer } from "@/lib/motion/rolar";
import WhatsAppIcon from "@/components/WhatsAppIcon";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA FIXA — O CTA QUE NUNCA SAI DO ECRÃ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE NÃO É O `StickyCTA` DO SÍTIO ──────────────────────────────
 * O `StickyCTA` só aparece depois de 75% de um ecrã de scroll, esconde-se ao
 * chegar ao rodapé, e monta-se em `requestIdleCallback`. Faz sentido num sítio
 * institucional: é um lembrete discreto para quem está a passear. Aqui é o
 * contrário — é a acção principal da página, tem de estar visível desde o
 * primeiro pixel e nunca desaparecer.
 *
 * ── PORQUE É QUE O WHATSAPP É O BOTÃO PRINCIPAL ────────────────────────────
 * Foi a instrução, e a razão está certa: em Portugal, tráfego frio de
 * Instagram fala mais depressa do que preenche formulários. Um formulário
 * pede à pessoa que redija; o WhatsApp pede-lhe que carregue num botão e
 * escreva "olá" numa aplicação que já tem aberta. A mensagem vai
 * pré-preenchida com a zona, para a equipa saber logo de onde veio.
 *
 * O formulário continua ali ao lado, com o mesmo peso visual, porque há quem
 * prefira escrever — e porque é o formulário que traz data, local e nome de
 * uma vez só.
 *
 * ── NÃO HÁ ESTADO NENHUM AQUI ──────────────────────────────────────────────
 * Sem `useState`, sem observadores, sem ouvintes de scroll. A barra é HTML
 * desenhado no servidor com `position: fixed`; a única coisa que faz este
 * componente ser de cliente são os dois `onClick` da medição. É por isso que
 * ela está lá antes de a hidratação acontecer — no browser interno do
 * Instagram, onde a hidratação demora, isso é a diferença entre um botão que
 * existe e um botão que aparece.
 */
export default function BarraFixa({
  contexto,
  textoWhatsApp,
  mensagemWhatsApp,
  textoFormulario,
}: {
  /** "s/comporta" — vai na medição para se saber que variante produziu. */
  contexto: string;
  textoWhatsApp: string;
  mensagemWhatsApp: string;
  textoFormulario: string;
}) {
  return (
    <div
      className="vidro-cede fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#0c0e0b]/95 backdrop-blur-sm px-3 py-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch gap-2.5">
        <a
          href={waHref(mensagemWhatsApp)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            meta.contacto({ contexto });
            track("WhatsAppClick", { source: "social", origem: contexto });
          }}
          className="toque flex flex-[1.4] items-center justify-center gap-2.5 bg-moss px-4 py-3.5 text-white transition-colors hover:bg-moss-dark"
        >
          <WhatsAppIcon className="h-5 w-5 flex-shrink-0" />
          <span className="text-[12px] font-medium tracking-[0.08em]">{textoWhatsApp}</span>
        </a>
        {/* Uma âncora, não um botão com `scrollIntoView`: funciona antes de
            qualquer JavaScript correr, e no browser interno isso conta.
            Depois de hidratar, o salto é suave (auditoria externa, A9: o
            `scroll-behavior: smooth` saiu do `html` e fica só nos saltos
            internos) — e seco para quem pediu movimento reduzido. */}
        <a
          href="#pedido"
          onClick={(e) => {
            track("CTAClick", { source: "social-barra", origem: contexto });
            const alvo = document.getElementById("pedido");
            if (!alvo) return;
            e.preventDefault();
            rolarAteVer(alvo, { block: "start" });
            history.replaceState(null, "", "#pedido");
          }}
          className="toque flex flex-1 items-center justify-center border border-white/60 px-4 py-3.5 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-[#0c0e0b]"
        >
          {textoFormulario}
        </a>
      </div>
    </div>
  );
}
