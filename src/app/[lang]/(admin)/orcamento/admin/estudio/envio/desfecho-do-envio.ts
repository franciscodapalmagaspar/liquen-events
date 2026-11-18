import type { CanalDeEnvio } from "./canal-de-envio";

/** O que a rota do envio responde, só nos campos que decidem o desfecho. */
export interface RespostaDoEnvio {
  emailed?: unknown;
  semEmailPorEscolha?: unknown;
  estado?: unknown;
  emailError?: unknown;
  repetidoAviso?: unknown;
  docError?: unknown;
  docSaved?: unknown;
  estadoError?: unknown;
  pedidoError?: unknown;
  copiaError?: unknown;
}

export interface DesfechoDoEnvio {
  /** A proposta seguiu mesmo (email enviado, ou WhatsApp escolhido e marcado). */
  saiu: boolean;
  mensagem: string;
  tipo: "error" | "success";
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * «ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Um pedido sem email de cliente válido devolvia 200 com `emailed:false`
 * — e o ecrã mostrava um aviso cinzento, marcava o passo como «Proposta
 * enviada ✓» e seguia. Ela ficava convencida de que tinha ido; o casal
 * não recebia nada. É, ao pé da letra, «não dá para mandar a proposta
 * para o cliente» — e da pior maneira, porque nem sequer parecia falhar.
 *
 * O email não ter saído é um ERRO, não uma informação. E o passo só é
 * dado por feito quando o email saiu: a proposta fica gravada na mesma
 * (isso não se perde), mas o botão continua lá para ela poder corrigir o
 * contacto e enviar a sério.
 */
/**
 * ══════════════════════════════════════════════════════════════════════
 * PRIMEIRO O QUE ACONTECEU, DEPOIS O QUE ESTAVA LÁ DENTRO
 * ══════════════════════════════════════════════════════════════════════
 *
 * Esta cadeia começava pelo `aviso` do conteúdo, e ele ganhava a tudo.
 * A prioridade fazia sentido quando havia três desfechos («o documento
 * incompleto é o mais importante dos três»); com cinco, produzia frases
 * que afirmam o contrário do que aconteceu:
 *
 *  · com uma foto em falta E o SMTP em baixo, lia-se «No PDF que seguiu,
 *    falta 1 foto. Verifica a proposta e reenvia» — e não seguiu PDF
 *    nenhum, o casal não recebeu nada;
 *  · com uma foto em falta E a marcação do estado a falhar, o
 *    `estadoError` nunca chegava a ser mostrado.
 *
 * A ordem passa a ser: decide-se primeiro por SAIU ou não saiu — que é o
 * facto — e só depois pelo conteúdo. E quando saiu, os avisos JUNTAM-SE
 * em vez de se substituírem: não há razão para escolher entre dizer que
 * faltou uma foto e dizer que o pedido não ficou actualizado.
 */
/**
 * O servidor reconheceu isto como uma REPETIÇÃO e não enviou nada
 * (mesmo documento, há menos de três minutos). Acontece quando a rede
 * tosse a meio, o ecrã diz que falhou, e ela carrega outra vez — o
 * primeiro pedido acabou por seguir. Dizer «Proposta enviada» aqui era
 * verdade só por acidente; dizer o que aconteceu é o que a impede de
 * ficar à espera de perceber porque é que há duas linhas no quadro.
 */
/**
 * O email saiu. Junta-se tudo o que correu mal DEPOIS disso, por ordem
 * de gravidade, numa frase só — cada um destes campos só vem na
 * resposta quando falhou mesmo.
 *
 * O `docError` (A9-003) nunca era lido: `grep docError` no cliente dava
 * zero. É o pior dos quatro — sem documento gravado, o link que o casal
 * acabou de receber não tem PDF nenhum para lhe mostrar.
 */
export function desfechoDoEnvio({
  resposta,
  aviso,
  canal,
  abriuOWhatsApp,
}: {
  resposta: RespostaDoEnvio | null;
  /** O que faltou no PDF (fotos, cortes), já em frase — ou nada. */
  aviso: string | null | undefined;
  canal: CanalDeEnvio;
  abriuOWhatsApp: boolean;
}): DesfechoDoEnvio {
  const data = resposta;
  // E o WhatsApp que ela escolheu também conta como ter seguido (achado
  // n.º 4): o servidor marca-a como «enviada» e devolve o link.
  const saiu =
    Boolean(data?.emailed) || (data?.semEmailPorEscolha === true && data?.estado === "enviada");
  if (!saiu) {
    const erro = typeof data?.emailError === "string" && data.emailError ? data.emailError : "";
    return {
      saiu,
      mensagem: erro || "A proposta foi gravada mas o EMAIL NÃO SAIU — o cliente não recebeu nada.",
      tipo: "error",
    };
  }
  if (typeof data?.repetidoAviso === "string") {
    return { saiu, mensagem: data.repetidoAviso, tipo: "success" };
  }
  const problemas = [
    typeof data?.docError === "string" && data?.docSaved === false ? data.docError : "",
    typeof data?.estadoError === "string" ? data.estadoError : "",
    typeof data?.pedidoError === "string" ? data.pedidoError : "",
    typeof data?.copiaError === "string" ? data.copiaError : "",
    aviso ? `No PDF que seguiu, ${aviso}.` : "",
  ].filter(Boolean);
  if (problemas.length > 0) return { saiu, mensagem: problemas.join(" "), tipo: "error" };
  /* Com «só WhatsApp» não seguiu nada para ninguém — a proposta foi
     GERADA. Um aviso a dizer «enviada» era a mentira que faria a
     próxima pessoa não carregar no botão que falta. */
  return {
    saiu,
    mensagem:
      canal === "whatsapp"
        ? abriuOWhatsApp
          ? "Proposta pronta — o WhatsApp abriu com o link. Escolhe o casal e carrega em enviar."
          : "Proposta pronta — falta mandá-la: é o botão «Mandar por WhatsApp»."
        : "Proposta enviada ao cliente",
    tipo: "success",
  };
}
