/**
 * O lado do browser das passkeys: dois passos de rede à volta de uma chamada
 * ao aparelho. Vive aqui, e não dentro dos componentes, porque o ecrã de
 * entrada e o de gestão fazem exactamente o mesmo — e um deles feito de outra
 * maneira seria a forma mais provável de isto partir sem ninguém ver.
 *
 * NÃO é `server-only`: é o único módulo destes que corre no browser.
 */

import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/** O browser sabe o que são passkeys? Falso em contextos antigos ou sem HTTPS. */
export function suportaPasskeys(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * O browser sabe oferecer a passkey DENTRO do preenchimento automático?
 *
 * É a pergunta do «conditional UI»: em vez de a pessoa ter de carregar num
 * botão, o aparelho propõe a passkey assim que o campo do email ganha o foco,
 * na mesma lista onde o gestor de palavras-passe já propõe o resto. Safari 16+,
 * Chrome 108+ e Firefox 122+ sabem; os outros respondem `false` e ficamos com o
 * botão, que continua lá.
 */
export async function suportaAutofillDePasskeys(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

/** Cancela a cerimónia em curso (a do autofill, tipicamente). */
export function cancelarCerimonia(): void {
  try {
    WebAuthnAbortService.cancelCeremony();
  } catch {
    /* não havia nenhuma a decorrer */
  }
}

/**
 * O erro que se mostra a quem está à frente do ecrã.
 *
 * Cancelar (fechar a janela do sistema, não pôr o dedo) NÃO é uma falha e não
 * merece um aviso vermelho: devolve-se `null` e o ecrã fica como estava. Só o
 * que é mesmo um problema tem texto.
 */
export function mensagemDeErro(err: unknown): string | null {
  const nome = (err as { name?: string })?.name;
  if (nome === "NotAllowedError" || nome === "AbortError") return null;
  if (nome === "InvalidStateError") {
    return "Este dispositivo já está registado nesta conta.";
  }
  if (nome === "SecurityError") {
    return "O endereço desta página não permite passkeys. Verifique que está em liquen-events.com.";
  }
  const msg = (err as { message?: string })?.message;
  return msg && msg.length < 200 ? msg : "Não foi possível falar com este dispositivo.";
}

async function pedirJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = (data as { error?: string })?.error;
    throw new Error(erro || "Pedido recusado.");
  }
  return data;
}

/**
 * Regista o aparelho actual na conta com sessão aberta.
 *
 * Só é chamado de dentro do back office — o servidor exige sessão válida nos
 * dois passos, e o segundo verifica ainda que a conta não mudou entretanto.
 *
 * E a palavra-passe da conta, confirmada antes (auditoria de 13/11, n.º 5):
 * a sessão sozinha não chega para dar a um aparelho uma porta própria.
 */
export async function registarDispositivo(
  deviceLabel: string,
  palavraPasse: string,
): Promise<void> {
  await pedirJson("/api/admin/passkeys/confirmar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: palavraPasse }),
  });
  const optionsJSON = (await pedirJson("/api/admin/passkeys/registo")) as Parameters<
    typeof startRegistration
  >[0]["optionsJSON"];
  const response = await startRegistration({ optionsJSON });
  await pedirJson("/api/admin/passkeys/registo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, deviceLabel }),
  });
}

export interface OpcoesDeEntrada {
  /**
   * Propor a passkey pelo preenchimento automático, sem esperar por um clique
   * (`mediation: "conditional"`). Exige um `<input autocomplete="… webauthn">`
   * na página — o `startAuthentication` verifica isso e atira se não houver.
   */
  autofill?: boolean;
  /** A caixa «manter a sessão iniciada» do ecrã de entrada. */
  manterSessao?: boolean;
}

/**
 * Entra com um aparelho já registado. Sem nome, sem palavra-passe: o aparelho
 * mostra as passkeys que tem para este domínio e a pessoa escolhe.
 *
 * ── Com `autofill`, esta promessa fica PENDURADA ──────────────────────────
 * Em modo condicional o browser não abre janela nenhuma: regista o pedido e
 * espera, possivelmente para sempre, que a pessoa escolha a passkey na lista do
 * preenchimento automático. Quem chama tem de tratar isto como uma subscrição e
 * não como um pedido — e não pode desenhar «a confirmar…» à espera dela.
 */
export async function entrarComDispositivo({
  autofill = false,
  manterSessao = true,
}: OpcoesDeEntrada = {}): Promise<void> {
  const optionsJSON = (await pedirJson("/api/admin/passkeys/entrada")) as Parameters<
    typeof startAuthentication
  >[0]["optionsJSON"];
  const response = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
  await pedirJson("/api/admin/passkeys/entrada", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, manterSessao }),
  });
}

/**
 * De quanto em quanto tempo é que a proposta de passkey do autofill é rearmada.
 *
 * ── O número não é um gosto: é o prazo do desafio menos folga ─────────────
 * O desafio que o servidor emite dura 120 s (ver `passkey-challenge.ts`, e a
 * razão de ser curto está lá escrita). A proposta do autofill, essa, pode ficar
 * à espera o tempo que a pessoa demorar a olhar para o ecrã — abre-se o
 * separador, vai-se buscar um café, volta-se. Sem rearmar, quem escolhesse a
 * passkey três minutos depois de abrir a página levava com «o pedido expirou»
 * por uma razão que não é dela.
 *
 * 100 s deixa 20 s de folga para a ida e volta ao servidor e para o tempo que a
 * pessoa leva a pôr o dedo depois de escolher.
 */
const REARMAR_AUTOFILL_MS = 100_000;

/**
 * Deixa a passkey proposta no preenchimento automático enquanto a página
 * estiver aberta, e devolve como se desliga isso.
 *
 * Rearma sozinha (ver `REARMAR_AUTOFILL_MS`) — mas NUNCA enquanto o campo do
 * autofill está focado: rearmar chama `navigator.credentials.get` outra vez, o
 * que aborta a cerimónia anterior, e abortá-la com a lista do browser aberta
 * fecha-a debaixo dos dedos de quem estava a escolher.
 *
 * O `aoEntrar` só é chamado quando a entrada ficou MESMO feita. Cancelar não
 * chega aqui: um autofill abortado (por nós, ao rearmar, ou pela pessoa ao
 * escrever a palavra-passe) é o funcionamento normal, não uma falha.
 */
export function armarEntradaAutomatica(opcoes: {
  aoEntrar: () => void;
  aoFalhar?: (erro: unknown) => void;
  manterSessao?: () => boolean;
}): () => void {
  let vivo = true;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  /** O campo do autofill está debaixo do cursor? Então não se mexe. */
  const aEscolher = () => {
    const activo = document.activeElement as HTMLElement | null;
    return !!activo?.matches?.("input[autocomplete$='webauthn']");
  };

  const armar = () => {
    if (!vivo) return;
    entrarComDispositivo({ autofill: true, manterSessao: opcoes.manterSessao?.() ?? true })
      .then(() => {
        if (!vivo) return;
        vivo = false;
        opcoes.aoEntrar();
      })
      .catch((err) => {
        // `AbortError` é o rearmar a substituir-se a si próprio; `NotAllowedError`
        // é a pessoa a fechar a lista. Nenhum dos dois é para mostrar.
        if (!vivo) return;
        const nome = (err as { name?: string })?.name;
        if (nome !== "AbortError" && nome !== "NotAllowedError") opcoes.aoFalhar?.(err);
      });
    temporizador = setTimeout(() => {
      if (aEscolher()) {
        // Volta a perguntar daqui a pouco em vez de rearmar por cima da lista
        // aberta. O desafio pode expirar nessa janela — mas isso é a pessoa a
        // demorar com a lista aberta, e aí a mensagem de erro é honesta.
        temporizador = setTimeout(armar, 5_000);
        return;
      }
      armar();
    }, REARMAR_AUTOFILL_MS);
  };

  armar();

  return () => {
    vivo = false;
    if (temporizador) clearTimeout(temporizador);
    cancelarCerimonia();
  };
}
