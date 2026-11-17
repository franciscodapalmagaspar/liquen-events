import { pareceEmail } from "./parece-email";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARA QUEM É QUE ESTA PROPOSTA VAI, AFINAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «no ecrã de envio, a proposta para "Melanie e Sebastien" ia
 * para franciscomariagaspar6@gmail.com. Presumo que estejas a testar — mas nada
 * avisa que o destinatário não é o cliente. Um aviso discreto evita que um teste
 * escape para envio real.»
 *
 * ── O que faltava não era um julgamento: era o endereço ───────────────────
 *
 * O ecrã de envio nunca mostrava para onde a proposta ia. O endereço só
 * aparecia depois de carregar em «Gerar e enviar», na frase de confirmação — ou
 * seja, um clique DEPOIS da decisão de enviar já estar tomada. Basta pô-lo à
 * vista ao lado do botão para o caso dela deixar de existir: ela teria visto o
 * gmail e parado.
 *
 * ── E porque é que a maior parte disto NÃO é um aviso ─────────────────────
 *
 * Porque não há como saber, do lado de cá, se `geral@quinta.pt` é o email dos
 * noivos ou não é. Um aviso que dispara em endereços legítimos — e a maioria
 * dos endereços de casamento não tem o nome de ninguém lá dentro — ensina-se a
 * ignorar, e o próximo, o que interessa, ignora-se com ele.
 *
 * Por isso só há UM aviso a sério, e é o que se sabe com certeza: o endereço é
 * da casa. Esse não é uma dúvida — é uma proposta que ia para nós em vez de ir
 * para o casal. Tudo o resto é o endereço, dito em voz normal, que é o que ela
 * pediu: discreto.
 */

/**
 * Os endereços que são NOSSOS.
 *
 * A caixa da casa e o domínio próprio. Não são segredo nenhum — estão no
 * rodapé de todos os emails que saem daqui — e é por isso que podem viver do
 * lado do navegador, onde o ecrã de envio precisa deles.
 *
 * O `MAIL_TO` do servidor pode ser outro (uma instalação de testes, uma caixa
 * nova): quando é, essa não é apanhada aqui, e a linha do endereço continua a
 * mostrá-lo. Vale mais uma rede que apanha o caso conhecido do que nenhuma.
 */
const DA_CASA = [
  /^liquen[.\-_]?\w*@gmail\.com$/i,
  /@liquenevents\.[a-z.]+$/i,
  /@liquen\.[a-z.]+$/i,
];

export function eEnderecoDaCasa(email: string): boolean {
  const e = email.trim().toLowerCase();
  return DA_CASA.some((r) => r.test(e));
}

export interface Destinatario {
  /** O endereço, como está no pedido. Vazio quando não há. */
  endereco: string;
  /** Um endereço com forma de endereço. */
  valido: boolean;
  /** O aviso a mostrar, ou `null`. Só o caso que se sabe com certeza. */
  aviso: string | null;
}

/**
 * O que dizer sobre o destinatário deste envio.
 *
 * `clientNames` fica de fora do julgamento de propósito — ver o cabeçalho. É o
 * endereço que se mostra; a comparação com o nome do casal daria um aviso em
 * quase todos os casamentos («geral@quinta.pt», «mafalda.rs@…»), e um aviso que
 * quase sempre dispara não é um aviso.
 */
export function destinatarioDoEnvio(email: string | undefined | null): Destinatario {
  const endereco = (email ?? "").trim();
  if (!endereco) {
    return {
      endereco: "",
      valido: false,
      // Desde a B1 do documento dela, sem email a proposta por email nem chega
      // a ser gravada: o botão trava. O que fica por dizer é o remédio.
      aviso:
        "Este pedido não tem email de cliente: por email não sai — escolhe «WhatsApp» ou acrescenta o email no pedido.",
    };
  }
  if (!pareceEmail(endereco)) {
    return {
      endereco,
      valido: false,
      aviso: `«${endereco}» não tem forma de email: por email não sai — corrige-o no pedido ou escolhe «WhatsApp».`,
    };
  }
  if (eEnderecoDaCasa(endereco)) {
    return {
      endereco,
      valido: true,
      aviso: "Este é um endereço da casa, e não do cliente. A proposta ia para nós.",
    };
  }
  return { endereco, valido: true, aviso: null };
}
