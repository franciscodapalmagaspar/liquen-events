import { createHash } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { pedirRecuperacao, normalizarIdentificador } from "@/lib/admin-auth";
import { VALIDADE_MS } from "@/lib/admin-recuperacao";
import { rateLimit, clientIp, sweep, reservarLugar, devolverLugar } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import {
  ASSUNTO_DA_RECUPERACAO,
  htmlDaRecuperacao,
  textoDaRecuperacao,
} from "@/lib/email-recuperacao";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PEDIR UMA LIGAÇÃO PARA DEFINIR UMA PALAVRA-PASSE NOVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É PÚBLICA de propósito, como o `/api/admin/login`: quem se esqueceu da
 * palavra-passe não tem sessão para provar nada. O que a protege é o tecto de
 * pedidos, o token de uso único com meia hora de vida, e o facto de a ligação
 * só ir parar a uma caixa de correio que já estava configurada no `ADMIN_USERS`
 * — nunca a um endereço escrito neste formulário.
 *
 * ── A RESPOSTA NUNCA DIZ SE O ENDEREÇO EXISTE ─────────────────────────────
 * Mesma frase, mesmo código de estado, e o mesmo trabalho feito nos dois casos:
 * lê-se o registo, escreve-se o registo, e só depois — e só quando há mesmo uma
 * conta — sai um email. Um formulário de recuperação que responde «não temos
 * esse email» é um verificador de endereços grátis para quem anda a montar uma
 * campanha de phishing contra a equipa.
 *
 * O TEMPO TAMBÉM NÃO PODE DENUNCIAR, e são precisas duas coisas para isso:
 *
 *  1. o envio do email SAI DE DENTRO DA RESPOSTA (`after`). É o único trabalho
 *     que só acontece num dos ramos, e é de longe o mais lento: um SMTP a sério
 *     leva 0,5 a 2 s (o `mail.ts` só corta aos 8 s). Enquanto era esperado, a
 *     conta que existe respondia em ~2 s e a que não existe em 0,9 s — um
 *     segundo de diferença, que se lê com o cronómetro do próprio browser e é
 *     exactamente o oráculo que esta rota existe para não ter. Com o `after`, o
 *     envio passa a correr DEPOIS de a resposta sair (na Vercel é o
 *     `waitUntil`, portanto a função fica viva e o email vai à mesma) e o
 *     relógio de quem pergunta deixa de ver a diferença;
 *  2. o que RESTA dentro da resposta é o mesmo nos dois ramos — lê-se o
 *     registo, escreve-se o registo — e ainda assim espera-se até um PISO
 *     comum, para as diferenças pequenas (um `bcrypt` a mais, um ramo mais
 *     curto) também não se somarem a nada legível.
 */

/** A ÚNICA frase que sai daqui quando o pedido foi processado. */
const NEUTRA =
  "Se este email pertencer a uma conta, vais receber uma mensagem com a ligação para definires uma palavra-passe nova. Vê também o spam.";

/**
 * Piso de tempo de resposta, em milissegundos.
 *
 * O que fica dentro da resposta depois de o email ter saído para o `after`:
 * uma leitura e uma escrita no `app_state` (40–120 ms cada, numa ligação
 * normal ao Supabase), a reserva no tecto da conta (um INCR no Upstash,
 * 20–80 ms — revisão de 16/11, n.º 3) e, quando a escrita falha, a devolução
 * (outro pedido ao Upstash). Somado, o caso normal mais lento anda pelos
 * 400 ms; 700 ms cobre-o com folga. (Era 900 ms enquanto o envio do email era
 * esperado aqui dentro, e 300 ms antes de a reserva passar para cá.) Uma base
 * de dados pendurada passa de qualquer piso — mas pendura-se para os dois
 * casos por igual.
 *
 * O piso não é decoração: sem ele, o ramo com conta (que ainda gera um token e
 * escreve mais um campo) e o ramo sem conta separavam-se por alguns
 * milissegundos consistentes — pouco para um cronómetro de browser, suficiente
 * para uma média de mil pedidos.
 */
const PISO_MS = 700;

async function esperarAtePiso(inicio: number): Promise<void> {
  const falta = PISO_MS - (Date.now() - inicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
}

export async function POST(request: NextRequest) {
  const inicio = Date.now();
  const ip = clientIp(request);
  sweep();

  let email = "";
  try {
    const body = await request.json();
    email = String(body.email ?? "")
      .trim()
      .slice(0, 160);
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  /**
   * ── OS DOIS TECTOS, E PORQUE SÃO ESTES NÚMEROS ─────────────────────────
   *
   *  • 5 pedidos por hora e por ENDEREÇO DE ORIGEM: impede que um sítio só
   *    ande a disparar pedidos para descobrir contas ou a encher caixas de
   *    correio;
   *  • 3 EMAILS por hora e por CONTA: é o tecto contra o bombardeamento da
   *    caixa de correio de uma pessoa. Três chega para quem não recebeu o
   *    primeiro email e volta a tentar.
   *
   * O TECTO DA CONTA CONTA SÓ OS ENVIOS DECIDIDOS, E NÃO RESPONDE 429 (auditoria
   * de 16/11, n.º 5). Antes, qualquer pedido o gastava e acima dele vinha um
   * 429: três pedidos de um estranho deixavam a dona sem poder pedir a ligação
   * durante uma hora. Agora conta-se, de forma atómica, só quando o endereço é
   * de uma conta e antes de emitir a ligação; acima do tecto não sai email nem
   * se emite ligação nova — a do último email continua a valer — e a resposta
   * é a neutra de sempre. Os endereços que não são de ninguém não gastam nada.
   *
   * O tecto por ENDEREÇO DE ORIGEM continua a responder 429: é sobre quem está
   * a pedir, não sobre a conta, e não deixa ninguém fechar a porta a outro.
   */
  const chaveConta = normalizarIdentificador(email);
  // Pelo RESUMO do endereço: a chave existe para qualquer endereço com «@»
  // (n.º 3 de 16/11), e um endereço escrito por quem quer que seja não vai em
  // claro para o Upstash.
  const CHAVE_DA_CONTA = `recuperar-conta:${createHash("sha256").update(chaveConta, "utf8").digest("hex").slice(0, 32)}`;
  const TECTO_DA_CONTA = 3;
  const porIp = await rateLimit(`recuperar-ip:${ip}`, 5, 60 * 60_000, { global: true });
  if (!porIp.ok) {
    log.warn("recuperação: pedido com tecto de tentativas", { ip });
    await esperarAtePiso(inicio);
    return NextResponse.json(
      { error: "Demasiados pedidos. Tenta daqui a bocado." },
      { status: 429, headers: { "Retry-After": String(porIp.retryAfter ?? 3600) } },
    );
  }

  // Um endereço sem arroba nunca é conta nenhuma: poupa-se a leitura e a
  // escrita, e não se perde neutralidade — a resposta é a mesma de sempre.
  if (!chaveConta.includes("@")) {
    await esperarAtePiso(inicio);
    return NextResponse.json({ ok: true, mensagem: NEUTRA });
  }

  // O tecto da conta conta-se NO MOMENTO DA DECISÃO, de forma atómica (um
  // INCR): uma rajada de pedidos ao mesmo tempo não passa dele (revisão de
  // 16/11, n.º 1). E faz-se para QUALQUER endereço com «@», existindo ou não
  // (n.º 3): se só as contas reais fossem ao Upstash, essa ida separava-as
  // pelo tempo. Acima do tecto não se emite ligação nem se envia; a resposta é
  // a neutra.
  //
  // Um lugar reservado que não deu email VOLTA (n.º 2): quando a leitura ou a
  // escrita do registo falham (aqui, dentro da resposta, igual para os dois
  // casos), quando o endereço não é de ninguém e quando o SMTP não envia (no
  // `after`, fora da resposta).
  // `reservarLugar`/`devolverLugar` (e não o `rateLimit`): a devolução vai só
  // ao sítio e à janela da reserva, e um recusado não gasta — ver
  // `rate-limit.ts`.
  const reserva = await reservarLugar(CHAVE_DA_CONTA, TECTO_DA_CONTA, 60 * 60_000, {
    global: true,
  });
  const devolverEnvio = () => devolverLugar(reserva);
  const resultado = await pedirRecuperacao(email, { podeEmitir: reserva.ok });
  if (resultado.estado === "acima-do-tecto") {
    log.warn("recuperação: conta com o tecto de emails — nada enviado", { ip });
  }
  if (resultado.estado === "sem-persistencia" || resultado.estado === "sem-recuperacao") {
    await devolverEnvio().catch(() => undefined);
  }
  if (resultado.estado === "sem-conta") {
    after(() => devolverEnvio().catch(() => undefined));
  }

  if (resultado.estado === "sem-recuperacao") {
    // Verdade sobre a INSTALAÇÃO, não sobre a pessoa: não há contas com email
    // configuradas, portanto ninguém consegue recuperar nada. Dizê-lo é o que
    // impede alguém de ficar meia hora a olhar para a caixa de correio.
    log.error(
      "recuperação: pedida sem contas com email — falta configurar ADMIN_USERS com `email` (ver ENTRADA.md)",
    );
    await esperarAtePiso(inicio);
    return NextResponse.json(
      {
        /**
         * ── «FALA COM QUEM O GERE» ERA A PESSOA A FALAR CONSIGO PRÓPRIA ──
         *
         * Esta frase foi escrita a pensar numa equipa: alguém usa o produto,
         * outro alguém trata da infraestrutura. Aqui não é assim — quem vê
         * este ecrã é a dona da empresa, que É quem o gere. Mandou-me a
         * fotografia do aviso a dizer que «isto não funciona bem», e tinha
         * razão: a mensagem manda-a falar consigo mesma e não lhe diz nem o
         * que fazer a seguir, nem que há duas portas abertas ao lado.
         *
         * O que a mensagem tem de dar, por esta ordem: o que se pode fazer
         * AGORA (as duas entradas que funcionam), e só depois o que falta
         * fazer para esta passar a funcionar.
         *
         * O nome da variável que falta fica no `log.error` acima e não aqui:
         * esta rota responde a quem quer que a chame, e detalhes da instalação
         * não se contam a quem passa.
         */
        error:
          "A recuperação por email ainda não está ligada neste site. Entra com a " +
          "palavra-passe ou com a chave de acesso. Se és tu quem gere o site, é " +
          "preciso configurar as contas com email para isto passar a funcionar.",
      },
      { status: 503 },
    );
  }

  if (resultado.estado === "sem-persistencia") {
    // A escrita foi tentada nos DOIS casos (conta real ou não), portanto esta
    // resposta aparece a toda a gente e não denuncia ninguém. E é a resposta
    // honesta: sem sítio onde guardar o token, a ligação que fôssemos enviar
    // não abriria nada.
    await esperarAtePiso(inicio);
    return NextResponse.json(
      {
        error:
          "Não foi possível preparar a recuperação neste momento. Nada foi enviado — fala com quem gere o site.",
      },
      { status: 503 },
    );
  }

  if (resultado.estado === "emitido") {
    /**
     * O ENDEREÇO DA LIGAÇÃO VEM DA CONSTANTE, NUNCA DO PEDIDO.
     *
     * Montá-lo a partir do cabeçalho `Host` é o erro clássico desta rota:
     * quem faz o pedido escolhe o `Host`, o email sai para a caixa de correio
     * VERDADEIRA com uma ligação para o servidor de quem atacou, e a pessoa
     * entrega-lhe o token com as próprias mãos. `SITE.url` é fixo no código.
     */
    const ligacao = `${SITE.url}/orcamento/admin/recuperar?token=${encodeURIComponent(resultado.token)}`;
    const minutos = Math.round(VALIDADE_MS / 60_000);
    /**
     * DEPOIS DA RESPOSTA, não dentro dela — ver a nota grande do topo.
     *
     * O `after` não é «disparar e esquecer»: a plataforma mantém a função viva
     * até o trabalho acabar (na Vercel, o `waitUntil`). Um `void sendMail(...)`
     * solto fazia o contrário — o contentor podia congelar assim que a resposta
     * saísse, e o email desaparecia sem deixar rasto. A diferença entre os dois
     * só se vê em produção, que é o pior sítio para a descobrir.
     *
     * O token JÁ ESTÁ gravado e válido neste ponto (a resposta só chega aqui
     * depois de a escrita ter sido confirmada como duradoura), portanto nada
     * do que acontecer aqui dentro pode inventar uma ligação que não abre.
     */
    after(async () => {
      try {
        const dados = {
          logo: `cid:${EMAIL_LOGO_CID}`,
          nome: resultado.conta.name,
          ligacao,
          minutos,
          pedidoEm: new Date(inicio),
        };
        const { sent } = await sendMail({
          to: resultado.conta.email,
          // O desenho da carta da casa (pedido de 13/11) — ver `email-recuperacao.ts`.
          subject: ASSUNTO_DA_RECUPERACAO,
          text: textoDaRecuperacao(dados),
          html: htmlDaRecuperacao(dados),
          attachments: [emailLogoAttachment()],
          headers: { "Auto-Submitted": "auto-generated" },
        });
        if (!sent) {
          await devolverEnvio().catch(() => undefined);
          // SMTP por configurar. O token está guardado e válido, mas ninguém o
          // vai receber. Fica no registo como ERRO — é uma avaria de instalação,
          // não um caso normal — e a resposta continua a ser a neutra: mudar de
          // frase aqui dizia a quem perguntasse que este endereço existe.
          log.error(
            "recuperação: SMTP não configurado — a ligação NÃO foi enviada (ver SMTP_HOST/SMTP_USER/SMTP_PASS)",
          );
        }
      } catch (err) {
        // O `after` corre fora da resposta: uma excepção aqui não tem para onde
        // subir. Fica registada, e o token continua válido — a pessoa pede
        // outra ligação e ninguém fica preso a um erro que não viu.
        log.error("recuperação: envio do email falhou", err);
        await devolverEnvio().catch(() => undefined);
      }
    });
  }

  await esperarAtePiso(inicio);
  return NextResponse.json({ ok: true, mensagem: NEUTRA });
}
