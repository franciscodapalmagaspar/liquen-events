import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import {
  ADMIN_COOKIE,
  ADMIN_REAUTH_COOKIE,
  confirmacaoValida,
  isAuthed,
  readSession,
} from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  MAX_DEVICE_LABEL,
  MAX_PASSKEYS_POR_CONTA,
  createPasskey,
  listPasskeysFor,
} from "@/lib/passkeys-store";
import {
  CHALLENGE_COOKIE,
  lerDesafio,
  novoDesafio,
  opcoesCookieDesafio,
  opcoesParaEsquecerDesafio,
  selarDesafio,
} from "@/lib/passkey-challenge";
import { RP_NAME, origemEsperada, rpID } from "@/lib/passkey-rp";
import { mesmaConta } from "@/lib/passkeys-store";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registar ESTE dispositivo como chave de entrada.
 *
 * Só se chega aqui com sessão de admin válida, e é de propósito: o passo que
 * transforma um aparelho numa chave tem de ser dado por quem já provou ser
 * quem diz. É por isso que a primeira passkey de cada pessoa nasce de uma
 * entrada com palavra-passe — não há maneira de arrancar isto do nada sem
 * abrir um caminho por onde um estranho registaria o aparelho dele.
 *
 * GET  → as opções (com o desafio) para o browser entregar ao aparelho.
 * POST → a resposta assinada do aparelho, que é verificada e guardada.
 */

const NAO_INSTALADO =
  "A tabela das passkeys ainda não existe na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso não há onde guardar o " +
  "dispositivo. Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/** Traduz as falhas de persistência em respostas que dizem o que fazer. */
function respostaDeAvaria(err: unknown, contexto: string): NextResponse {
  if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
  if (isPersistenceUnavailable(err))
    return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
  log.error(`passkeys: ${contexto}`, { err });
  return NextResponse.json(
    { error: "Não foi possível concluir. Tenta novamente." },
    { status: 500 },
  );
}

/** O nome da conta com sessão aberta, ou null. */
function contaAutenticada(req: NextRequest): string | null {
  const sess = readSession(req.cookies.get(ADMIN_COOKIE)?.value);
  const nome = sess?.name?.trim();
  return nome ? nome : null;
}

/**
 * A palavra-passe confirmada há pouco (auditoria de 13/11, n.º 5): a sessão
 * sozinha não chega para dar a um aparelho uma porta que dura mais do que ela.
 * Ver `confirmar/route.ts`.
 */
function semConfirmacaoRecente(req: NextRequest, conta: string): NextResponse | null {
  if (confirmacaoValida(req.cookies.get(ADMIN_REAUTH_COOKIE)?.value, conta)) return null;
  return NextResponse.json(
    {
      error: "Confirma a tua palavra-passe para registar este dispositivo.",
      reconfirmar: true,
    },
    { status: 403 },
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const conta = contaAutenticada(req);
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const recusa = semConfirmacaoRecente(req, conta);
  if (recusa) return recusa;

  let existentes;
  try {
    existentes = await listPasskeysFor(conta);
  } catch (err) {
    return respostaDeAvaria(err, "listagem para registo");
  }

  if (existentes.length >= MAX_PASSKEYS_POR_CONTA) {
    return NextResponse.json(
      {
        error:
          `Já tens ${MAX_PASSKEYS_POR_CONTA} dispositivos registados. ` +
          `Remove um que já não uses antes de acrescentar outro.`,
      },
      { status: 409 },
    );
  }

  const challenge = novoDesafio();
  const opcoes = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(req),
    // O identificador de utilizador do WebAuthn tem de ser estável para a conta
    // — é o que faz o aparelho SUBSTITUIR a passkey em vez de acumular uma nova
    // a cada registo repetido. O nome em minúsculas serve: é o que identifica a
    // conta em todo o resto deste módulo.
    userID: new TextEncoder().encode(conta.toLowerCase()),
    userName: conta,
    userDisplayName: conta,
    challenge: Buffer.from(challenge, "base64url"),
    attestationType: "none",
    // Impede registar DUAS VEZES o mesmo aparelho: o browser vê a lista e
    // recusa-se a criar uma segunda credencial no mesmo autenticador.
    excludeCredentials: existentes.map((p) => ({
      id: p.id,
      transports: p.transports as never,
    })),
    authenticatorSelection: {
      // "preferred" e não "required": a passkey deve poder ficar guardada no
      // aparelho para se entrar sem escrever nome nenhum, mas exigi-lo deixava
      // de fora autenticadores mais antigos por nada.
      residentKey: "preferred",
      // Aqui NÃO se cede: sem verificação do utilizador, o aparelho assinava
      // só por estar por perto, e a passkey valia o mesmo que uma chave
      // esquecida na fechadura.
      userVerification: "required",
    },
  });

  const res = NextResponse.json(opcoes);
  res.cookies.set(
    CHALLENGE_COOKIE,
    selarDesafio("registo", challenge, conta),
    opcoesCookieDesafio(),
  );
  return res;
}

const registoSchema = z.object({
  // A resposta do browser é um objecto do WebAuthn com forma própria; a
  // verificação a sério é a criptográfica, feita a seguir. Aqui só se garante
  // que é um objecto e que o id existe.
  response: z.object({ id: z.string().min(1).max(1000) }).passthrough(),
  deviceLabel: z.string().trim().max(MAX_DEVICE_LABEL).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const conta = contaAutenticada(req);
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const recusa = semConfirmacaoRecente(req, conta);
  if (recusa) return recusa;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = registoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const selado = lerDesafio(req.cookies.get(CHALLENGE_COOKIE)?.value, "registo");

  /**
   * O DESAFIO SERVE UMA VEZ, ACERTE OU NÃO. A razão está por extenso na rota
   * irmã (`entrada/route.ts`) e no cabeçalho do `passkey-challenge.ts`: um
   * desafio que sobrevive à recusa deixa de ser um desafio e passa a ser um
   * número reutilizável durante o que lhe resta de prazo.
   */
  const gastandoODesafio = (res: NextResponse): NextResponse => {
    res.cookies.set(CHALLENGE_COOKIE, "", opcoesParaEsquecerDesafio());
    return res;
  };

  if (!selado) {
    return gastandoODesafio(
      NextResponse.json({ error: "O pedido de registo expirou. Volta a tentar." }, { status: 400 }),
    );
  }
  // O desafio foi emitido para a conta que o pediu. Se a sessão entretanto
  // mudou de pessoa (mesmo browser, outra entrada), o registo não pode seguir
  // — acabaria a prender o aparelho de alguém à conta de outra pessoa.
  if (!mesmaConta(selado.userName, conta)) {
    return gastandoODesafio(
      NextResponse.json(
        { error: "A sessão mudou durante o registo. Volta a tentar." },
        { status: 400 },
      ),
    );
  }

  let verificacao;
  try {
    verificacao = await verifyRegistrationResponse({
      response: parsed.data.response as unknown as VerifyRegistrationResponseOpts["response"],
      expectedChallenge: selado.challenge,
      expectedOrigin: origemEsperada(req),
      expectedRPID: rpID(req),
      requireUserVerification: true,
    });
  } catch (err) {
    log.warn("passkeys: registo recusado", { conta, err: String(err) });
    return gastandoODesafio(
      NextResponse.json({ error: "Não foi possível confirmar este dispositivo." }, { status: 400 }),
    );
  }

  if (!verificacao.verified || !verificacao.registrationInfo) {
    return gastandoODesafio(
      NextResponse.json({ error: "Não foi possível confirmar este dispositivo." }, { status: 400 }),
    );
  }

  const { credential } = verificacao.registrationInfo;
  const agora = new Date().toISOString();

  try {
    await createPasskey({
      id: credential.id,
      userName: conta,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ? [...credential.transports] : [],
      rpId: rpID(req),
      deviceLabel: parsed.data.deviceLabel?.trim() || "Dispositivo",
      createdAt: agora,
      lastUsedAt: null,
    });
  } catch (err) {
    return gastandoODesafio(respostaDeAvaria(err, "gravação do dispositivo"));
  }

  log.info("passkeys: dispositivo registado", { conta });
  // A confirmação serve um registo: o seguinte pede a palavra-passe outra vez.
  const feito = gastandoODesafio(NextResponse.json({ ok: true }));
  feito.cookies.set(ADMIN_REAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return feito;
}
