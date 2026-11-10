import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_NAME_COOKIE,
  createSession,
  duracaoDaSessao,
  verifyCredentials,
  totpRequired,
  checkTotp,
  normalizarIdentificador,
} from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep, limiteEsgotado } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * UMA SÓ FRASE PARA TODAS AS RECUSAS.
 *
 * «Esta conta não existe» e «a palavra-passe está errada» são a mesma resposta,
 * com o mesmo código de estado e — pelo compare-fantasma do `verifyCredentials`
 * — aproximadamente o mesmo tempo. Distinguir as duas dava a quem tenta metade
 * do trabalho feito: saber que o endereço é bom vale mais do que uma tentativa.
 */
const RECUSA = "Credenciais incorretas";

/**
 * ── A ESCADA DO BLOQUEIO, POR CONTA ───────────────────────────────────────
 *
 * Três degraus, todos contados SÓ COM FALHAS (ver a nota grande mais abaixo) e
 * todos sobre a mesma conta, independentemente do endereço de onde vêm:
 *
 *   5 falhas → fecha  5 minutos   um engano humano cabe aqui à vontade; quem
 *                                 procura às cegas leva com a primeira parede
 *                                 ao fim de cinco tentativas, que é cedo.
 *  10 falhas → fecha 30 minutos   quem insistiu depois da primeira parede já
 *                                 não é distracção: o custo passa a ser real.
 *  20 falhas → fecha  1 hora      o tecto que já existia, mantido tal e qual
 *                                 (é ele que fecha a busca dos 6 dígitos do
 *                                 2FA a quem já tenha a palavra-passe).
 *
 * É PROGRESSIVA porque as tentativas gastas durante um bloqueio continuam a
 * contar para os degraus seguintes: quem bate na parede dos 5 minutos e insiste
 * empurra-se sozinho para os 30 e depois para a hora. Quem se enganou duas
 * vezes e foi buscar o papelinho não sente nada disto.
 *
 * Os dois primeiros degraus nunca fecham a porta a quem sabe a palavra-passe:
 * são consultados só DEPOIS de as credenciais falharem — um engano repetido, ou
 * alguém a tentar a conta dela umas vezes, não a deixa de fora.
 *
 * O TERCEIRO (20 falhas numa hora) fecha MESMO — decisão dela, 10/11, «Sim,
 * fecha mesmo». Antes também deixava passar a palavra-passe certa, e isso
 * queria dizer que quem tenta palpites de muitos endereços nunca era parado:
 * os errados levavam 429 e o certo entrava. Agora, com a conta no último
 * degrau, nem a certa entra durante essa hora. Ela não fica presa: a chave de
 * acesso (passkey) e a recuperação por email não passam por aqui. E pergunta-se
 * ANTES do bcrypt, que é o trabalho caro do pedido.
 */
const ESCADA = [
  { chave: "login-conta-curto", tentativas: 5, janelaMs: 5 * 60_000, esperaS: 300 },
  { chave: "login-conta-medio", tentativas: 10, janelaMs: 30 * 60_000, esperaS: 1800 },
  // Mantém o nome de chave original: é o contador que já estava em produção e
  // trocar-lhe o nome oferecia a toda a gente um tecto novo em folha.
  { chave: "login-conta", tentativas: 20, janelaMs: 60 * 60_000, esperaS: 3600 },
] as const;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  // Throttle brute-force attempts on the login endpoint.
  sweep();
  const [porMinuto, porHora] = await Promise.all([
    rateLimit(`login:${ip}`, 8, 60_000, { global: true }),
    // Tecto POR ENDEREÇO à hora. O de 8/minuto sozinho deixa passar 480
    // tentativas por hora de um só sítio, e cada uma custa um bcrypt — mesmo
    // com identificadores inventados, que não gastam o contador de conta
    // nenhuma. É trabalho de CPU que se compra por nada. Sessenta à hora fica
    // muito acima do que um escritório inteiro usa num dia mau.
    rateLimit(`login-ip-hora:${ip}`, 60, 60 * 60_000, { global: true }),
  ]);
  const limited = !porMinuto.ok ? porMinuto : !porHora.ok ? porHora : null;
  if (limited) {
    log.warn("admin login rate-limited", { ip });
    return NextResponse.json(
      { error: "Demasiadas tentativas. Aguarda um momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
    );
  }

  let password = "";
  let identificador = "";
  let code = "";
  /**
   * «Manter a sessão iniciada.» Verdadeiro por omissão de propósito: um
   * separador aberto antes deste deploy não manda o campo, e a página antiga
   * também não — e ambos têm de continuar a receber os 30 dias de sempre. Só
   * quem DESLIGA a caixa é que pede a sessão curta, e isso chega aqui como um
   * `false` explícito.
   */
  let manterSessao = true;
  try {
    const body = await request.json();
    password = String(body.password ?? "");
    if (body.manterSessao === false) manterSessao = false;
    // `email` é o campo novo; `name` continua a ser lido para que um separador
    // aberto antes do deploy (com a página antiga em memória) não fique a
    // responder «credenciais incorretas» sem razão nenhuma.
    identificador = String(body.email ?? body.name ?? "")
      .trim()
      .slice(0, 160);
    code = String(body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // ── Tecto POR CONTA, independente do endereço ─────────────────────────────
  //
  // O tecto acima conta por IP, e sozinho não chega. Quem tenha a palavra-passe
  // (reutilizada, apanhada num phishing, saída numa fuga de outro serviço) fica
  // só com o código de 6 dígitos à frente — e um código de 6 dígitos com uma
  // janela de tolerância é um espaço de busca pequeno. Bastava rodar endereços,
  // que é barato, para ter tentativas ilimitadas ao segundo factor: cada IP novo
  // trazia oito tentativas novas.
  //
  // Este contador é o mesmo para todos os endereços do mundo, portanto rodar
  // endereços deixa de comprar tentativas. Vinte por hora deixa passar uma
  // pessoa que se engane várias vezes (o relógio dessincronizado do telemóvel é
  // a causa mais comum) e fecha a porta a uma busca automática.
  //
  // SÓ AS TENTATIVAS FALHADAS GASTAM O CONTADOR, e por isso ele é consultado
  // depois de verificar as credenciais, não antes. Quando era consultado antes,
  // gastava-se em qualquer pedido: bastavam vinte pedidos anónimos com o nome
  // "Catarina" — que está no site — para a própria, com a palavra-passe certa,
  // levar 429 durante uma hora (medido: 20 falhas de IPs diferentes → 429 com
  // Retry-After 3598). E como o limitador distribuído renova o PEXPIRE a cada
  // toque, um pedido por hora mantinha o back office fechado para sempre.
  //
  // Contar só as falhas não afrouxa o tecto: quem procura às cegas falha SEMPRE,
  // logo é sempre contado, e continua preso às vinte por hora. O que deixa de
  // acontecer é um estranho poder fechar a porta a quem sabe a palavra-passe.
  //
  // A chave usa o identificador tal como foi escrito, em minúsculas e truncado.
  // Não abre um oráculo de enumeração: uma conta inexistente e uma palavra-passe
  // errada seguem exactamente o mesmo caminho (`!user`), gastam o mesmo contador
  // e devolvem a mesma resposta. Só escapa ao contador quem já acertou nas
  // credenciais — e esse já sabe o que o oráculo lhe diria.
  const conta = normalizarIdentificador(identificador);

  /** 429 do degrau mais alto que a conta já pisou, gastando uma tentativa. */
  async function gastarTentativaDaConta(): Promise<NextResponse | null> {
    // Todos os degraus contam SEMPRE, mesmo quando um deles já está a fechar a
    // porta: é isso que faz a escada subir para quem insiste.
    const resultados = await Promise.all(
      ESCADA.map((d) => rateLimit(`${d.chave}:${conta}`, d.tentativas, d.janelaMs, { global: true })),
    );
    let espera = 0;
    resultados.forEach((r, i) => {
      if (!r.ok) espera = Math.max(espera, r.retryAfter ?? ESCADA[i].esperaS);
    });
    if (!espera) return null;
    log.warn("admin login rate-limited por conta", { ip, conta, espera });
    return NextResponse.json(
      // A frase é a mesma para os três degraus: o que muda é quanto tempo, e
      // isso vai no cabeçalho, não numa frase que ensine em que degrau se está.
      { error: "Demasiadas tentativas nesta conta. Tenta mais tarde." },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  // O último degrau, perguntado sem gastar tentativa — ver a nota da ESCADA.
  if (conta) {
    const topo = ESCADA[ESCADA.length - 1];
    const fechada = await limiteEsgotado(`${topo.chave}:${conta}`, topo.tentativas);
    if (!fechada.ok) {
      log.warn("admin login recusado: conta no último degrau", { ip, conta });
      return NextResponse.json(
        { error: "Demasiadas tentativas nesta conta. Tenta mais tarde." },
        { status: 429, headers: { "Retry-After": String(fechada.retryAfter ?? topo.esperaS) } },
      );
    }
  }

  const user = await verifyCredentials(identificador, password);
  if (!user) {
    const travado = await gastarTentativaDaConta();
    if (travado) return travado;
    log.warn("admin login failed", { ip, conta, reason: "credentials" });
    return NextResponse.json({ error: RECUSA }, { status: 401 });
  }

  // Second factor (TOTP), when configured for this account. A chave de consulta
  // é o email quando a conta o tem — é o identificador, e dois nomes visíveis
  // iguais não podem partilhar o segundo factor um do outro.
  const chaveDaConta = user.email ?? user.name;
  if (totpRequired(chaveDaConta)) {
    if (!code) {
      return NextResponse.json(
        { needs2fa: true, error: "Introduz o código de verificação." },
        { status: 401 },
      );
    }
    if (!checkTotp(chaveDaConta, code)) {
      // O código errado é a tentativa que mais interessa travar: é aqui que
      // quem já tem a palavra-passe procura os 6 dígitos.
      const travado = await gastarTentativaDaConta();
      if (travado) return travado;
      log.warn("admin login failed", { ip, name: user.name, reason: "totp" });
      return NextResponse.json(
        { needs2fa: true, error: "Código de verificação inválido." },
        { status: 401 },
      );
    }
  }

  log.info("admin login ok", {
    ip,
    name: user.name,
    mfa: totpRequired(chaveDaConta),
    manterSessao,
  });
  const res = NextResponse.json({ ok: true });
  const { ttlMs, maxAge } = duracaoDaSessao(manterSessao);
  const cookieBase = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Sem `maxAge` é um cookie de sessão do browser — ver `duracaoDaSessao`.
    ...(maxAge === undefined ? {} : { maxAge }),
  };
  res.cookies.set(ADMIN_COOKIE, createSession(user.name, ttlMs), {
    httpOnly: true,
    ...cookieBase,
  });
  // Who is logged in — used to greet the partner and default task ownership.
  res.cookies.set(ADMIN_NAME_COOKIE, user.name, { httpOnly: false, ...cookieBase });
  return res;
}
