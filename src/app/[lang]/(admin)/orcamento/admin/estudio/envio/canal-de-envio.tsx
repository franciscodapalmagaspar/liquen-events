import { useCallback, useEffect, useState } from "react";
import { LogotipoEmail, LogotipoWhatsApp } from "../../LogotiposDosCanais";

/** Por onde a proposta segue. Ver a nota longa no `useCanalDeEnvio`, aqui em baixo. */
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

/** Onde fica a última escolha dela. */
const CANAL_GUARDADO = "liquen-canal-de-envio";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * POR ONDE É QUE A PROPOSTA SEGUE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «Quero colocar aqui a opção de enviar por email e por WhatsApp. E quero que
 * seja possível escolher enviar apenas só para o email, apenas só para o
 * WhatsApp, ou para os dois.»
 *
 * ── OS DOIS CANAIS NÃO FUNCIONAM DA MESMA MANEIRA, E ISSO VÊ-SE ─────────
 *
 * O **email** sai do SERVIDOR: leva o PDF em anexo e parte sozinho quando ela
 * carrega em enviar.
 *
 * O **WhatsApp** não. Nenhuma página consegue mandar uma mensagem por
 * alguém — o que se pode é abrir o WhatsApp com a mensagem escrita e a lista
 * de contactos à espera. Ou seja, o WhatsApp é sempre um SEGUNDO gesto, dela,
 * a seguir a este. E não pode ser automático: uma janela aberta depois de um
 * `await` é bloqueada pelo browser (a mesma razão pela qual o «Imprimir folha
 * do dia» vive onde vive).
 *
 * Por isso a escolha faz duas coisas diferentes: decide se o email SAI, e
 * decide se o passo do WhatsApp fica em destaque no fim. Não finge que os
 * dois são a mesma coisa.
 *
 * ── E LEMBRA-SE DA ÚLTIMA ──────────────────────────────────────────────
 *
 * A omissão é «Email», que é como isto sempre funcionou — ninguém que não
 * peça nada pode passar a ter uma janela do WhatsApp a abrir-se. Mas se ela
 * escolher WhatsApp, é isso que encontra da próxima: uma escolha que se
 * repete todos os dias e se pede todos os dias é uma escolha mal feita.
 */
export function useCanalDeEnvio(): {
  canal: CanalDeEnvio;
  escolherCanal: (c: CanalDeEnvio) => void;
} {
  const [canal, setCanal] = useState<CanalDeEnvio>("email");
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CANAL_GUARDADO);
      if (guardado === "email" || guardado === "whatsapp" || guardado === "ambos") {
        setCanal(guardado);
      }
    } catch {
      /* Uma janela privada ou o armazenamento desligado dão erro aqui. A
         omissão serve, e não vale um ecrã partido. */
    }
  }, []);
  const escolherCanal = useCallback((c: CanalDeEnvio) => {
    setCanal(c);
    try {
      localStorage.setItem(CANAL_GUARDADO, c);
    } catch {
      /* Ver acima: não poder lembrar-se não é razão para não obedecer agora. */
    }
  }, []);
  return { canal, escolherCanal };
}
