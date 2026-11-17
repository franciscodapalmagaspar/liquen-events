import { SITE } from "@/lib/site";
import { WHATSAPP_HREF } from "@/data";

/**
 * O que um formulário de pedido diz quando o JavaScript não corre.
 *
 * O «Enviar» vem desligado do servidor e só se liga ao hidratar
 * (`useJaHidratado`). Sem JavaScript, um botão desligado sem explicação é
 * uma porta fechada: aqui fica porquê, e as duas portas que funcionam sempre,
 * o email e o WhatsApp da Líquen (os de `SITE`). Discreto, por baixo do botão.
 *
 * Só cobre o JavaScript DESLIGADO: um pedaço do JS que falhe numa rede fraca
 * não mostra o `<noscript>`. Para esse, continua o WhatsApp que a página já
 * tem à vista.
 */
const TEXTO = {
  pt: {
    antes: "Este formulário precisa de JavaScript para enviar. Escreva-nos para ",
    ou: " ou pelo ",
    whatsapp: "WhatsApp",
  },
  en: {
    antes: "This form needs JavaScript to send. Write to us at ",
    ou: " or on ",
    whatsapp: "WhatsApp",
  },
} as const;

export default function AvisoSemJavaScript({
  lingua,
  className = "mt-3 text-[13px] leading-relaxed text-foreground/68",
}: {
  lingua: "pt" | "en";
  className?: string;
}) {
  const t = TEXTO[lingua];
  return (
    <noscript>
      <p className={className}>
        {t.antes}
        <a href={`mailto:${SITE.email}`} className="underline">
          {SITE.email}
        </a>
        {t.ou}
        <a href={WHATSAPP_HREF} className="underline">
          {t.whatsapp}
        </a>
        .
      </p>
    </noscript>
  );
}
