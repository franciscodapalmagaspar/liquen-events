import { NextRequest, NextResponse, after } from "next/server";
import { pedirRecuperacao, normalizarIdentificador } from "@/lib/admin-auth";
import { VALIDADE_MS } from "@/lib/admin-recuperacao";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { sendMail, esc } from "@/lib/mail";
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
 * 300 ms cobre com folga o que sobrou dentro da resposta depois de o email ter
 * saído para o `after` — uma leitura e uma escrita no `app_state`, que numa
 * ligação normal ao Supabase andam pelos 40–120 ms. Era 900 ms enquanto o envio
 * do email era esperado aqui dentro; deixou de precisar de ser tão alto, e
 * baixar não custa nada a quem espera pelo ecrã.
 *
 * O piso não é decoração: sem ele, o ramo com conta (que ainda gera um token e
 * escreve mais um campo) e o ramo sem conta separavam-se por alguns
 * milissegundos consistentes — pouco para um cronómetro de browser, suficiente
 * para uma média de mil pedidos.
 */
const PISO_MS = 300;

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
   *  • 3 pedidos por hora e por CONTA: é o tecto contra o bombardeamento da
   *    caixa de correio de uma pessoa. Três chega para quem não recebeu o
   *    primeiro email e volta a tentar.
   *
   * O tecto por conta tem um custo que se assume de olhos abertos: um estranho
   * pode gastá-lo e deixar a própria sem poder pedir a ligação durante uma
   * hora. Aqui — ao contrário do que acontecia na entrada — esse mal é pequeno:
   * a pessoa continua a poder entrar com a palavra-passe ou com o aparelho
   * registado, e o que se evita do outro lado (mil emails na caixa de correio
   * de quem gere a empresa) é bem pior.
   */
  const chaveConta = normalizarIdentificador(email);
  const [porIp, porConta] = await Promise.all([
    rateLimit(`recuperar-ip:${ip}`, 5, 60 * 60_000, { global: true }),
    rateLimit(`recuperar-conta:${chaveConta}`, 3, 60 * 60_000, { global: true }),
  ]);
  const travado = !porIp.ok ? porIp : !porConta.ok ? porConta : null;
  if (travado) {
    log.warn("recuperação: pedido com tecto de tentativas", { ip });
    await esperarAtePiso(inicio);
    return NextResponse.json(
      { error: "Demasiados pedidos. Tenta daqui a bocado." },
      { status: 429, headers: { "Retry-After": String(travado.retryAfter ?? 3600) } },
    );
  }

  // Um endereço sem arroba nunca é conta nenhuma: poupa-se a leitura e a
  // escrita, e não se perde neutralidade — a resposta é a mesma de sempre.
  if (!chaveConta.includes("@")) {
    await esperarAtePiso(inicio);
    return NextResponse.json({ ok: true, mensagem: NEUTRA });
  }

  const resultado = await pedirRecuperacao(email);

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
        const { sent } = await sendMail({
          to: resultado.conta.email,
          subject: "Definir uma palavra-passe nova — Líquen Events",
          text: [
            `Olá ${resultado.conta.name},`,
            "",
            "Alguém (esperemos que tu) pediu para definir uma palavra-passe nova no painel de gestão.",
            "",
            ligacao,
            "",
            `A ligação serve UMA vez e expira daqui a ${minutos} minutos.`,
            "Se não foste tu, não é preciso fazeres nada: a palavra-passe actual continua a valer.",
          ].join("\n"),
          html: `
          <p>Olá ${esc(resultado.conta.name)},</p>
          <p>Alguém (esperemos que tu) pediu para definir uma palavra-passe nova no painel de gestão.</p>
          <p><a href="${esc(ligacao)}">Definir uma palavra-passe nova</a></p>
          <p>A ligação serve <strong>uma vez</strong> e expira daqui a ${minutos} minutos.</p>
          <p>Se não foste tu, não é preciso fazeres nada: a palavra-passe actual continua a valer.</p>
        `,
          headers: { "Auto-Submitted": "auto-generated" },
        });
        if (!sent) {
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
      }
    });
  }

  await esperarAtePiso(inicio);
  return NextResponse.json({ ok: true, mensagem: NEUTRA });
}
