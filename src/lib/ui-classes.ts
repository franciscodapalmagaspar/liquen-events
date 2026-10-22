/**
 * Shared Tailwind class strings for repeated UI patterns. Keeps the primary
 * form CTA (orçamento + contacto submit buttons) visually identical without
 * three independently-maintained copies of the same 200+ char string.
 */
// Sharp corners to match the redesigned hero / services CTAs (the site's
// on-brand button shape); keep every primary "Pedir orçamento" identical.
// Geometry + type are shared; only the drop shadow changes with the ground it
// sits on (a moss glow is invisible on a dark photo; a black shadow is
// invisible on cream) — hence the two exported variants below.
// `transition-[gap,background-color]` (not `transition-all`): the only things
// that change on hover here are the gap (gap-3→gap-5, the icon drift) and the
// background (bg-moss→bg-moss-dark). Naming them keeps the identical animation
// while sparing the browser from evaluating every animatable property each hover.
// `toque`: o botão cede ao carregar (globals.css, auditoria externa A8) e
// volta com mola ao largar (`MolaAoLargar.tsx`). Com rato, sobe 2 px ao passar
// por cima (`translate`, composto) — «Botões e cartões com mola», 22/10.
const PRIMARY_BUTTON_BASE =
  "toque inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-white font-medium hover:bg-moss-dark hover:gap-5 motion-safe:hover:-translate-y-0.5 transition-[gap,background-color,translate] duration-300 text-[11px] tracking-[0.3em] uppercase disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3";

// On light / cream sections (form submits, service-intro CTA): soft moss lift.
export const PRIMARY_BUTTON_CLASS = `${PRIMARY_BUTTON_BASE} shadow-lg shadow-moss/15`;

// On full-bleed dark / image sections (the closing CTAs): a black drop shadow
// that actually reads over the photo. Identical to the light primary otherwise.
export const PRIMARY_BUTTON_DARK_CLASS = `${PRIMARY_BUTTON_BASE} shadow-xl shadow-black/30`;

// Cinematic outline button for full-bleed dark / image sections (the "SpaceX"
// treatment): a crisp white hairline that fills solid white on hover, text
// inverting to near-black. Mirrors the home chapter buttons exactly — single
// source of truth so every dark-section CTA — /servicos bands, sobre, galeria,
// clientes — stays pixel-identical. Add `flex-shrink-0` inline where the
// button sits in a flex row next to a heading.
// Named properties (not `transition-all`): hover swaps background, text and
// border colours and lifts the button 2 px (`translate`, composited) — the
// lift is «Botões e cartões com mola», 22/10.
// `ease-expo` (globals.css) is SpaceX's signature cubic-bezier(0.19,1,0.22,1).
// No telemóvel, mais fino e mais pequeno — palavras dela (22/10): «coloca o
// pedir orçamento mais fino e mais pequeno». Menos ar à volta, letra e
// espaçamento um degrau abaixo; do `sm` para cima fica como estava. No dedo,
// o `alvo-toque` da casa segura os 44 px de altura (antes eram ~47): o botão
// fica mais fino e o toque continua a cumprir o mínimo.
export const OUTLINE_LIGHT_BUTTON_CLASS =
  "toque alvo-toque relative inline-flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-3.5 border border-white/70 text-white text-[10px] sm:text-[11px] tracking-[0.24em] sm:tracking-[0.3em] uppercase hover:bg-white hover:text-[#0c0e0b] hover:border-white motion-safe:hover:-translate-y-0.5 transition-[color,background-color,border-color,translate] duration-300 ease-expo focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
