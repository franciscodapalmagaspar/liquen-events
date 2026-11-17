import { LogotipoEmail, LogotipoWhatsApp } from "../../LogotiposDosCanais";

/** Por onde a proposta segue. Ver a nota longa no `canal`, dentro do estúdio. */
export type CanalDeEnvio = "email" | "whatsapp" | "ambos";

/**
 * As três maneiras de a proposta seguir, com os logótipos a cores (#212). São
 * as MESMAS no topo do passo 5 e na barra de baixo (14/10): dois controlos do
 * mesmo estado não podem dizer coisas diferentes.
 */
export const OPCOES_DO_CANAL: { value: CanalDeEnvio; label: string; icon: React.ReactNode }[] = [
  { value: "email", label: "Email", icon: <LogotipoEmail /> },
  { value: "whatsapp", label: "WhatsApp", icon: <LogotipoWhatsApp /> },
  {
    value: "ambos",
    label: "Os dois",
    icon: (
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <LogotipoEmail />
        <LogotipoWhatsApp />
      </span>
    ),
  },
];
