import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import {
  ADMIN_COOKIE,
  ADMIN_NAME_COOKIE,
  contaExiste,
  createSession,
  duracaoDaSessao,
} from "@/lib/admin-auth";
import { contadorRetrocedeu, getPasskey, marcarUso } from "@/lib/passkeys-store";
import {
  CHALLENGE_COOKIE,
  lerDesafio,
  novoDesafio,
  opcoesCookieDesafio,
  opcoesParaEsquecerDesafio,
  selarDesafio,
} from "@/lib/passkey-challenge";
import { origemEsperada, rpID } from "@/lib/passkey-rp";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entrar com um dispositivo registado, sem palavra-passe.
 *
 * É PÚBLICA de propósito — é um caminho de entrada, como o `/api/admin/login`.
 * O que a protege não é uma sessão: é a assinatura do aparelho, que só existe
 * se a chave privada estiver lá dentro e a pessoa se tiver identificado ao
 * próprio aparelho (rosto, impressão digital ou PIN).
 *
 * GET  → as opções (com o desafio).
 * POST → a resposta assinada; se bater tudo certo, a sessão é aberta.
 *
 * ── Uma resposta só para todas as recusas ─────────────────────────────────
 * Credencial desconhecida, domínio trocado, conta que já não existe, assinatura
 * inválida: tudo devolve a mesma frase. Distinguir seria dizer a quem tenta
 * qual das barreiras falhou — e a primeira delas responderia "esta credencial
 * existe", que é informação que não se dá.
 */

const RECUSA = "Não foi possível entrar com este dispositivo.";

export async function GET(req: NextRequest) {
  const challenge = novoDesafio();
  const opcoes = await generateAuthenticationOptions({
    rpID: rpID(req),
    challenge: Buffer.from(challenge, "base64url"),
    // Sem lista de credenciais: o aparelho mostra as que tem para este domínio
    // e a pessoa escolhe. É o que permite entrar sem escrever nome nenhum —
    // e evita que esta rota pública sirva para saber que contas existem.
    allowCredentials: [],
    userVerification: "required",
  });

  const res = NextResponse.json(opcoes);
  res.cookies.set(CHALLENGE_COOKIE, selarDesafio("entrada", challenge), opcoesCookieDesafio());
  return res;
}

const entradaSchema = z.object({
  response: z.object({ id: z.string().min(1).max(1000) }).passthrough(),
  /**
   * A mesma caixa «manter a sessão iniciada» da entrada por palavra-passe. Sem
   * isto, desligá-la valia numa porta e não valia na outra — e a porta onde não
   * valia era justamente a mais rápida, ou seja a mais usada.
   *
   * Ausente = ligada, para um separador aberto antes deste deploy continuar a
   * receber os 30 dias de sempre.
   */
  manterSessao: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  sweep();
  // O mesmo tecto do login por palavra-passe. Uma assinatura não se adivinha,
  // mas a rota faz trabalho (uma leitura e uma verificação criptográfica) e
  // não há razão para deixar alguém repeti-lo sem fim.
  const limitado = await rateLimit(`passkey:${ip}`, 20, 60_000, { global: true });
  if (!limitado.ok) {
    log.warn("passkeys: entrada com tecto de tentativas", { ip });
    return NextResponse.json(
      { error: "Demasiadas tentativas. Aguarde um momento." },
      { status: 429, headers: { "Retry-After": String(limitado.retryAfter ?? 60) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = entradaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const selado = lerDesafio(req.cookies.get(CHALLENGE_COOKIE)?.value, "entrada");

  /**
   * O DESAFIO SERVE UMA VEZ, ACERTE OU NÃO.
   *
   * Daqui para baixo o desafio já foi apresentado, portanto está gasto — e sai
   * do browser em qualquer desfecho, não só no feliz. Deixá-lo vivo depois de
   * uma recusa dava ao mesmo número mais tentativas dentro dos dois minutos de
   * prazo, que é precisamente o que um desafio existe para não ter. Não custa
   * nada a quem entra: o cliente pede um desafio novo antes de cada envio.
   */
  const gastandoODesafio = (res: NextResponse): NextResponse => {
    res.cookies.set(CHALLENGE_COOKIE, "", opcoesParaEsquecerDesafio());
    return res;
  };

  if (!selado) {
    return gastandoODesafio(
      NextResponse.json({ error: "O pedido expirou. Volte a tentar." }, { status: 400 }),
    );
  }

  const dominio = rpID(req);

  let credencial;
  try {
    credencial = await getPasskey(parsed.data.response.id);
  } catch (err) {
    log.error("passkeys: leitura da credencial falhou", { err });
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  // Credencial desconhecida, ou registada noutro domínio. A segunda hipótese é
  // o que torna seguro derivar o domínio do pedido: um `Host` forjado produz um
  // domínio para o qual a credencial guardada não bate certo.
  if (!credencial || credencial.rpId !== dominio) {
    log.warn("passkeys: credencial desconhecida ou de outro domínio", { ip, dominio });
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  // A conta pode ter sido removida do ADMIN_USERS desde que o aparelho foi
  // registado. Tirar alguém da lista tem de fechar TAMBÉM esta porta.
  if (!contaExiste(credencial.userName)) {
    log.warn("passkeys: conta já não existe", { ip, conta: credencial.userName });
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  let verificacao;
  try {
    verificacao = await verifyAuthenticationResponse({
      response: parsed.data.response as unknown as VerifyAuthenticationResponseOpts["response"],
      expectedChallenge: selado.challenge,
      expectedOrigin: origemEsperada(req),
      expectedRPID: dominio,
      credential: {
        id: credencial.id,
        publicKey: new Uint8Array(Buffer.from(credencial.publicKey, "base64url")),
        counter: credencial.counter,
        transports: credencial.transports as never,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    log.warn("passkeys: assinatura recusada", { ip, err: String(err) });
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  if (!verificacao.verified) {
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  const novoContador = verificacao.authenticationInfo.newCounter;
  if (contadorRetrocedeu(credencial.counter, novoContador)) {
    // Duas cópias da mesma credencial no mundo. Não se entra, e fica no registo
    // — é o único sinal que existe de uma chave que devia ser irrepetível.
    log.error("passkeys: contador de assinaturas retrocedeu (possível clone)", {
      ip,
      conta: credencial.userName,
      guardado: credencial.counter,
      recebido: novoContador,
    });
    return gastandoODesafio(NextResponse.json({ error: RECUSA }, { status: 401 }));
  }

  try {
    await marcarUso(credencial.id, novoContador);
  } catch (err) {
    // A entrada é válida; falhar a gravar a data de uso não é razão para a
    // recusar. Fica registado, e o contador actualiza-se na próxima.
    log.error("passkeys: não foi possível marcar a utilização", { err });
  }

  const manterSessao = parsed.data.manterSessao !== false;
  log.info("passkeys: entrada", { ip, conta: credencial.userName, manterSessao });
  const res = NextResponse.json({ ok: true });
  // A MESMA duração da entrada por palavra-passe, decidida no mesmo sítio.
  const { ttlMs, maxAge } = duracaoDaSessao(manterSessao);
  const cookieBase = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
  res.cookies.set(ADMIN_COOKIE, createSession(credencial.userName, ttlMs), {
    httpOnly: true,
    ...cookieBase,
  });
  res.cookies.set(ADMIN_NAME_COOKIE, credencial.userName, { httpOnly: false, ...cookieBase });
  return gastandoODesafio(res);
}
