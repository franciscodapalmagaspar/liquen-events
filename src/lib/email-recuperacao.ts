import { esc } from "./mail";
import { ESTILO_DA_CARTA } from "./email-pedido-recebido";
import { FUSO_DO_ESTUDIO } from "./fuso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL «DEFINIR UMA PALAVRA-PASSE NOVA»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco a 13/11 («eu quero melhorar este email», com a captura).
 * O de antes era quatro parágrafos soltos, uma ligação sublinhada no meio do
 * texto, «(esperemos que tu)» e «actual» com a grafia antiga. É o email que se
 * abre à pressa, no telemóvel, quando não se consegue entrar: tem de ser
 * reconhecível como da Líquen à primeira vista e ter UMA coisa para tocar.
 *
 * O desenho é o das outras cartas da casa (`email-pedido-recebido.ts`,
 * `email-pedido-equipa.ts`): a mesma folha de estilo, o mesmo logótipo
 * embutido, a mesma largura e os mesmos cinzentos — não uma terceira família.
 *
 * O que cada bloco faz:
 *   · o título diz o que é, sem precisar do assunto;
 *   · o botão é o único gesto, verde-sálvia (a cor da marca, nunca verde vivo),
 *     com a ligação também escrita por baixo para quem não o consiga abrir;
 *   · a hora a que expira em vez de «daqui a 30 minutos» — quem abre o email
 *     uma hora depois sabe logo que tem de pedir outro;
 *   · o «não foste tu?» no rodapé, calmo: nada muda sem esta ligação.
 */

export interface DadosDaRecuperacao {
  /** `cid:` do logótipo. */
  logo: string;
  /** O nome da conta («Catarina Gaspar»). Só se usa o primeiro. */
  nome: string;
  ligacao: string;
  /** Quantos minutos vale a ligação. */
  minutos: number;
  /** Quando foi pedida (para a hora a que expira). */
  pedidoEm: Date;
}

const primeiroNome = (nome: string) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** «11:46», na hora de Lisboa — é a hora do relógio de quem lê. */
export function horaDeLisboa(d: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_DO_ESTUDIO,
  }).format(d);
}

export const ASSUNTO_DA_RECUPERACAO = "Definir uma palavra-passe nova — Líquen Events";

function partes(d: DadosDaRecuperacao) {
  const nome = primeiroNome(d.nome);
  const expira = horaDeLisboa(new Date(d.pedidoEm.getTime() + d.minutos * 60_000));
  return {
    ola: nome ? `Olá ${nome},` : "Olá,",
    pedido: "Pediste para definir uma palavra-passe nova para o painel da Líquen Events.",
    validade: `A ligação serve uma só vez e é válida até às ${expira} (${d.minutos} minutos).`,
    naoFoste:
      "Não foste tu? Podes ignorar este email. A tua palavra-passe atual continua a valer, e ninguém a consegue mudar sem esta ligação.",
    preheader: `Toca no botão para escolheres a palavra-passe nova. Válido até às ${expira}.`,
  };
}

export function textoDaRecuperacao(d: DadosDaRecuperacao): string {
  const p = partes(d);
  return [
    p.ola,
    "",
    p.pedido,
    "",
    "Definir a palavra-passe nova:",
    d.ligacao,
    "",
    p.validade,
    "",
    p.naoFoste,
    "",
    "Líquen Events",
  ].join("\n");
}

export function htmlDaRecuperacao(d: DadosDaRecuperacao): string {
  const p = partes(d);
  const ligacao = esc(d.ligacao);
  return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Definir uma palavra-passe nova</title>
<!--[if mso]>
<style>table,td,div,p,a,h1{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
${ESTILO_DA_CARTA}
</head>
<body style="margin:0;padding:0;background:#ffffff;">

<!-- Pré-visualização na caixa de entrada -->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${esc(p.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:#ffffff;">
<tr><td align="center">

<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;">

  <!-- Logótipo -->
  <tr><td class="pad top" style="padding:48px 40px 0;">
    <img src="${esc(d.logo)}" width="96" alt="LÍQUEN EVENTS" style="display:block;width:96px;height:auto;font-size:12px;line-height:16px;font-weight:600;letter-spacing:2px;color:#4d6650;">
  </td></tr>

  <!-- Título -->
  <tr><td class="pad" style="padding:40px 40px 0;">
    <h1 class="h1 t1" style="margin:0;font-size:28px;line-height:34px;font-weight:600;letter-spacing:0.1px;color:#1d1d1f;">Definir uma palavra-passe nova</h1>
  </td></tr>

  <!-- O pedido -->
  <tr><td class="pad" style="padding:20px 40px 0;">
    <p class="t1" style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;">${esc(p.ola)}</p>
    <p class="t1" style="margin:12px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;">${esc(p.pedido)}</p>
  </td></tr>

  <!-- O botão: o único gesto -->
  <tr><td class="pad" style="padding:32px 40px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" bgcolor="#4d6650" style="border-radius:12px;background:#4d6650;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${ligacao}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="23%" stroke="f" fillcolor="#4d6650"><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:600;">Definir a palavra-passe</center></v:roundrect><![endif]-->
        <!--[if !mso]><!-- --><a href="${ligacao}" style="display:inline-block;padding:15px 28px;font-size:17px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">Definir a palavra-passe</a><!--<![endif]-->
      </td></tr>
    </table>
    <p class="t2" style="margin:16px 0 0;font-size:15px;line-height:22px;color:#6e6e73;">${esc(p.validade)}</p>
  </td></tr>

  <!-- Se o botão não abrir -->
  <tr><td class="pad" style="padding:24px 40px 0;">
    <p class="t3" style="margin:0;font-size:13px;line-height:19px;color:#86868b;">Se o botão não abrir, copia esta ligação para o navegador:</p>
    <p style="margin:4px 0 0;font-size:13px;line-height:19px;word-break:break-all;"><a href="${ligacao}" class="accent" style="color:#4d6650;text-decoration:none;">${ligacao}</a></p>
  </td></tr>

  <!-- Rodapé -->
  <tr><td class="pad" style="padding:32px 40px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:16px;">
        <p class="t3" style="margin:0;font-size:13px;line-height:19px;color:#86868b;">${esc(p.naoFoste)}</p>
        <p class="t3" style="margin:8px 0 0;font-size:13px;line-height:19px;color:#86868b;">Líquen Events · painel de gestão</p>
      </td></tr>
    </table>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>

</body>
</html>
`;
}
