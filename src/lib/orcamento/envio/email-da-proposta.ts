import "server-only";
import type { dinheiroDaProposta } from "@/lib/proposal-budget";
import { eurDocumento } from "@/lib/money";
import { esc } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { marcadoresDoPedido, modeloParaEnvioAutomatico, textoDoCorpo } from "@/lib/email-modelos";
import { arrumarLigacao, ROTULO_DA_PROPOSTA } from "@/lib/email-ligacoes";
import { assuntoEscritoAMao, corpoEscritoAMao, paragrafosDeTexto } from "@/lib/email-corpo-escrito";
import { resolverLigacaoDaProposta } from "@/lib/email-ligacao-reservada";
import { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";
import { eCasamento } from "@/lib/proposal-evento";
import { log } from "@/lib/logger";
import { cartaoDoPdf } from "./cartao-do-pdf";
import type { OEnvio } from "./o-envio";

/**
 * Etapa 10 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): o email que vai
 * sair, inteiro, antes de sair. Não manda nada — isso é `mandar-o-email.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════
 * QUAL É O CORPO: GANHA O MAIS ESPECÍFICO
 * ══════════════════════════════════════════════════════════════════════
 *
 * Corpo escrito à mão > mensagem pessoal > modelo > texto da casa.
 *
 * · O CORPO ESCRITO À MÃO: quem envia pode reescrever o corpo antes de
 *   carregar em Enviar, e é esse que sai. O tratamento — escape, tecto,
 *   parágrafos — está todo no `email-corpo-escrito`: é texto de uma caixa,
 *   não é marcação. Com ele, a mensagem pessoal fica de fora (quem escreve o
 *   corpo inteiro já lá põe a nota onde quiser).
 * · A MENSAGEM PESSOAL entra logo a seguir ao «Olá», ANTES da frase da casa e
 *   do botão: é a única parte que não se adivinha, e pô-la depois do botão
 *   era pô-la depois do sítio onde muita gente já carregou. O corpo de um
 *   modelo é markup opaco; não há onde lá dentro a enfiar sem adivinhar, por
 *   isso com mensagem o modelo fica de fora.
 * · O MODELO «proposta-enviada» do ecrã «Modelos de email» é o corpo nas
 *   DUAS rotas que mandam uma proposta (a irmã é `orcamento/[id]/proposta`).
 * · O TEXTO DA CASA, na língua da proposta: o desenho do email é UM só, e as
 *   PALAVRAS vivem no `email-proposta-textos`.
 *
 * E a MOLDURA fecha sempre no `emailAoCliente`: a assinatura é da casa e
 * entra uma só vez.
 *
 * ── O MODELO DELA É UM TEXTO PORTUGUÊS — E FICA DE FORA NUMA PROPOSTA INGLESA
 *
 * Não há versão inglesa do modelo, e não se inventa uma: traduzir à máquina
 * o que ela escreveu chegava ao casal sem ninguém o ter lido. Mandá-lo à
 * mesma era um assunto e um corpo portugueses com um PDF inglês em anexo.
 * Sai o texto da casa em inglês, e fica REGISTADO: ela guardou um modelo e o
 * email que saiu não foi o dela; isso tem de se poder ver.
 */
declare const emoldurado: unique symbol;

/**
 * Um email que passou pelo `emailAoCliente` — a assinatura de quem envia, a
 * faixa da casa e as redes (instrução dela, 20/08: «qualquer mensagem que
 * seja mandada tenha isto sempre predefinido»). Só {@link emoldurar} o cria, e
 * `mandar-o-email.ts` só aceita este: um email montado à mão não compila.
 */
export type EmailEmoldurado = ReturnType<typeof emailAoCliente> & { readonly [emoldurado]: true };

function emoldurar(partes: Parameters<typeof emailAoCliente>[0]): EmailEmoldurado {
  return emailAoCliente(partes) as EmailEmoldurado;
}

export interface ParaEscrever extends OEnvio {
  mensagem: string;
  /** O `corpo` e o `assunto` escritos à mão, quando vieram (`ler-o-corpo.ts`). */
  corpo: string | null;
  assunto: string | null;
  acceptUrl: string;
  dinheiro: ReturnType<typeof dinheiroDaProposta>;
  /** Quem carregou em «Enviar» (`assinaturaDeQuemEnvia`). */
  assinatura: { nome: string; cargo: string };
}

export interface EmailDaProposta {
  email: EmailEmoldurado;
  assunto: string;
  /** O texto que fica na CÓPIA do envio (`registarEnvio`). */
  textoDaCopia: string;
  nomeDoAnexo: string;
  quem: { nome: string; cargo: string; destinatario: string };
}

export async function escreverOEmail(p: ParaEscrever): Promise<EmailDaProposta> {
  const { doc, quote, idioma, mensagem, acceptUrl } = p;
  /**
   * O MARCADOR DA LIGAÇÃO, TROCADO PELO ENDEREÇO QUE JÁ EXISTE. O corpo do
   * ecrã de envio traz o `{{link_proposta}}`, e o endereço é assinado sobre
   * o ID DA PROPOSTA, que só existe depois de gravada — o porquê inteiro está
   * no `email-ligacao-reservada.ts`. Só um texto chega aqui: um `corpo: 42` de
   * um cliente avariado é `null` desde a leitura, e não vira um email com «42».
   */
  const escrito = corpoEscritoAMao(
    p.corpo === null ? null : resolverLigacaoDaProposta(p.corpo, acceptUrl),
  );
  /**
   * O assunto que o ecrã mostrou ANDA COM O CORPO, e é condição e não
   * coincidência: os dois vêm do mesmo rascunho, e um assunto solto era
   * reescrever a linha que o casal lê antes de abrir um email cujo texto
   * ninguém viu.
   */
  const assuntoDoEcra = escrito ? assuntoEscritoAMao(p.assunto) : null;

  const doModelo = await modeloDela(p, !!escrito);

  const t = textosDoEmailDaProposta(idioma, eCasamento(doc.eventType));
  /**
   * Quem assina é quem carregou em «Enviar», não a casa. O nome que vai para
   * a protecção é o do DOCUMENTO (o casal), que é quem lê este email — e não
   * o `quote.name`, que pode ser a mãe da noiva. Ver `email-assinatura.ts`.
   */
  const quem = {
    ...p.assinatura,
    destinatario: String(doc.clientNames ?? "").trim() || quote.name,
  };
  /**
   * O corpo dela, com o endereço arrumado: o token gigante fica no `href` e o
   * que se lê é uma frase (`email-ligacoes.ts`). O texto simples deriva-se do
   * HTML JÁ arrumado: as duas alternativas de um email têm de dizer o mesmo.
   */
  const corpoDoModelo =
    doModelo && arrumarLigacao(doModelo.html, { url: acceptUrl, rotulo: ROTULO_DA_PROPOSTA });
  /**
   * O nome do ficheiro que fica na pasta de transferências deles — o mesmo
   * que segue no anexo e o mesmo que a cópia do envio guarda.
   */
  const nomeDoAnexo = t.nomeDoAnexo({
    // O nome que ela escreveu, quando escreveu — manda sobre a composição.
    escolhido: doc.nomeDoFicheiro,
    clientNames: doc.clientNames,
    eventDate: doc.eventDate,
    ref: p.pedidoId,
  });
  const cartao = cartaoDoPdf(acceptUrl, t, nomeDoAnexo);

  const email = escrito
    ? emoldurar({
        /**
         * O CORPO ESCRITO NO ECRÃ TAMBÉM PASSA PELA ARRUMAÇÃO DO LINK. MEDIDO
         * num email real: o endereço saiu por extenso, cinco linhas de token —
         * o desenho de uma mensagem de phishing. O `resolverLigacaoDaProposta`
         * troca o marcador; esta linha esconde o endereço no `href`.
         */
        html: `${arrumarLigacao(escrito.html, { url: acceptUrl, rotulo: ROTULO_DA_PROPOSTA })}${cartao.html}`,
        // O TEXTO SIMPLES fica com o endereço — não há `href` onde o esconder.
        texto: [escrito.texto, ...cartao.texto].join("\n"),
        quem,
      })
    : corpoDoModelo
      ? emoldurar({
          html: `${corpoDoModelo}${cartao.html}`,
          texto: [textoDoCorpo(corpoDoModelo), ...cartao.texto].join("\n"),
          quem,
        })
      : emoldurar({ quem, ...corpoDaCasa(t, doc.clientNames, mensagem, acceptUrl, cartao) });

  return {
    email,
    // O assunto ESCRITO no ecrã de envio ganha ao do modelo, e o do modelo
    // ganha ao da casa (que vem na língua da proposta): é a única linha que o
    // casal lê antes de decidir se abre.
    assunto: assuntoDoEcra ?? doModelo?.assunto ?? t.assunto,
    // O CORPO tal e qual, em texto, já com a ligação resolvida. Sem corpo
    // escrito à mão fica o texto simples do email que saiu.
    textoDaCopia: escrito ? escrito.texto : email.text,
    nomeDoAnexo,
    quem,
  };
}

/**
 * O modelo «proposta-enviada» dela, com os marcadores deste pedido — ou
 * `null` quando não é ele que sai: há corpo escrito à mão ou mensagem pessoal
 * (ganha a mais específica), ou a proposta é noutra língua (o modelo é um
 * texto português, e fica REGISTADO que não saiu).
 */
async function modeloDela(p: ParaEscrever, escritoAMao: boolean) {
  const { doc, quote, idioma, mensagem, acceptUrl } = p;
  if (idioma !== "pt" && !mensagem && !escritoAMao) {
    log.warn(
      "proposta-doc: proposta noutra língua — o modelo «proposta-enviada» não é consultado, sai o texto da casa",
      { id: p.pedidoId, idioma },
    );
  }
  if (escritoAMao || mensagem || idioma !== "pt") return null;
  return modeloParaEnvioAutomatico(
    "proposta-enviada",
    marcadoresDoPedido(quote, {
      // Quem este email saúda são os NOMES DO CASAL do documento do
      // estúdio, e não o `quote.name` — que é quem escreveu o pedido e
      // pode ser a mãe da noiva ou uma wedding planner.
      //
      // Fora de um casamento, o cliente é um restaurante ou uma empresa
      // («Tasca do Pão e Vinho» virava «Tasca e Vinho» no `{cliente_nome}`):
      // aí saúda-se a pessoa que escreveu o pedido.
      nome: eCasamento(doc.eventType)
        ? String(doc.clientNames ?? "").trim()
        : String(quote.name ?? "").trim() || String(doc.clientNames ?? "").trim(),
      link: acceptUrl,
      valor: eurDocumento(p.dinheiro.gross),
      ...(String(doc.eventDate ?? "").trim() ? { data_evento: String(doc.eventDate).trim() } : {}),
      ...(String(doc.location ?? "").trim() ? { local: String(doc.location).trim() } : {}),
    }),
  );
}

/**
 * O TEXTO DA CASA, na língua da proposta: o que sai sem corpo escrito à mão e
 * sem modelo. O desenho é UM só — as PALAVRAS vivem no `email-proposta-textos`.
 * A mensagem pessoal entra logo a seguir ao «Olá», ANTES da frase da casa e
 * do botão: pô-la depois do botão era pô-la depois do sítio onde muita gente
 * já carregou.
 */
function corpoDaCasa(
  t: ReturnType<typeof textosDoEmailDaProposta>,
  clientNames: string,
  mensagem: string,
  acceptUrl: string,
  cartao: ReturnType<typeof cartaoDoPdf>,
): { html: string; texto: string } {
  return {
    html: `<h2 style="font-size:18px;margin:0 0 12px">${esc(t.titulo)}</h2>
        <p style="font-size:14px;line-height:1.6">${esc(t.ola)} ${esc(clientNames)},</p>
        ${mensagem ? `${paragrafosDeTexto(mensagem)}\n        ` : ""}<p style="font-size:14px;line-height:1.6">${esc(t.intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;border-collapse:separate">
          <tr><td style="background:#4c6350;border-radius:8px">
            <!-- 48 px de altura (14+20+14) e letra de 16: é o outro botão deste
                 mesmo email, e tinha 39 px com letra de 13. Dois botões lado a
                 lado com alturas diferentes leem-se como dois produtos. -->
            <a href="${acceptUrl}" style="display:block;padding:14px 26px;font-size:16px;line-height:20px;color:#f7f4ee;text-decoration:none;font-weight:600;white-space:nowrap">${esc(t.botao)}</a>
          </td></tr>
        </table>${cartao.html}`,
    texto: [
      t.titulo,
      "",
      `${t.ola} ${clientNames},`,
      "",
      // Tal e qual, com as quebras dela: escapar é uma preocupação de HTML, e
      // aqui só se lhe acrescenta a linha em branco que a separa do resto.
      // A mensagem pessoal não se traduz em língua nenhuma — é dela, como
      // os títulos e as legendas do documento.
      ...(mensagem ? [mensagem, ""] : []),
      t.introEmTexto,
      `${t.verOnline} ${acceptUrl}`,
      ...cartao.texto,
    ].join("\n"),
  };
}
