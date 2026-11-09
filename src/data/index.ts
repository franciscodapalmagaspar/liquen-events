// ── Shared constants ─────────────────────────────────────────────────────────

import { SITE } from "@/lib/site";

// Single source of truth: derive the WhatsApp number from SITE.phone so it can
// never drift from the canonical contact details in lib/site.ts.
export const WHATSAPP_PHONE = SITE.phone.replace(/\D/g, "");
export const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_PHONE}`;
export const WHATSAPP_HREF_CTA = `${WHATSAPP_HREF}?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20a%20organiza%C3%A7%C3%A3o%20de%20eventos.`;

/** WhatsApp deep-link with a (locale-aware) pre-filled message. */
export function waHref(message: string): string {
  return `${WHATSAPP_HREF}?text=${encodeURIComponent(message)}`;
}

// ── Clients ───────────────────────────────────────────────────────────────────
// Client logos — drop the PNGs (transparent, rendered white) into
// public/logos/clientes/ with these exact file names. Missing logos fall back
// to the client name as text, so the site never breaks while they're added.
export interface ClientLogo {
  name: string;
  logo: string;
}

export const clientLogos: ClientLogo[] = [
  { name: "José de Mello", logo: "/logos/clientes/jose-de-mello.png" },
  { name: "Deloitte", logo: "/logos/clientes/deloitte.png" },
  { name: "Torre de Palma Wine Hotel", logo: "/logos/clientes/torre-de-palma.avif" },
  { name: "Aernnova", logo: "/logos/clientes/aernnova.avif" },
  { name: "Mainova", logo: "/logos/clientes/mainova.avif" },
  { name: "Palácio Duques de Cadaval", logo: "/logos/clientes/palacio-cadaval.avif" },
  { name: "Ravasqueira", logo: "/logos/clientes/ravasqueira.avif" },
  { name: "Fitapreta Vinhos", logo: "/logos/clientes/fitapreta.png" },
  { name: "Universidade de Évora", logo: "/logos/clientes/universidade-evora.avif" },
  { name: "Hilton Garden Inn", logo: "/logos/clientes/hilton-garden-inn.avif" },
  { name: "Convento do Espinheiro", logo: "/logos/clientes/convento-espinheiro.avif" },
  { name: "Pérez-Llorca", logo: "/logos/clientes/perez-llorca.png" },
  { name: "Câmara Municipal de Évora", logo: "/logos/clientes/camara-evora.avif" },
  { name: "PACT", logo: "/logos/clientes/pact.avif" },
  { name: "Clínica Dentária Santa Madalena", logo: "/logos/clientes/clinica-santa-madalena.avif" },
  { name: "Casa Morgado Esporão", logo: "/logos/clientes/casa-morgado-esporao.avif" },
  { name: "PortugalNuts", logo: "/logos/clientes/portugal-nuts.avif" },
  { name: "ESRI Portugal", logo: "/logos/clientes/esri.avif" },
  { name: "Monte do Zambujal", logo: "/logos/clientes/monte-zambujal.avif" },
  { name: "EDIA", logo: "/logos/clientes/edia.avif" },
];

// ── Testimonials ──────────────────────────────────────────────────────────────

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
}

export const testimonials: Testimonial[] = [
  {
    name: "António Bettencourt",
    role: "Evento Corporativo",
    quote:
      "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
  },
  {
    name: "Alexandra Teixeira",
    role: "Evento Social",
    quote:
      "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
  },
  {
    name: "Stephanie & Mizio",
    role: "Evento Privado",
    quote: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
  },
  {
    name: "Teresinha Malta",
    role: "Evento Social",
    quote:
      "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
  },
];
