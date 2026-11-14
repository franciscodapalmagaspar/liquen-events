import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listFotos } from "@/lib/biblioteca-fotos-store";
import { listFotoEtiquetas } from "@/lib/biblioteca-foto-etiquetas-store";
import { signThemePaths, signThemeThumbs } from "@/lib/theme-storage";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { isEixo, type Eixo } from "@/lib/biblioteca-types";
import {
  ehFotoDaBiblioteca,
  porConfirmarSet,
  porFoto,
  responde,
  type Procura,
} from "@/lib/biblioteca-consulta";
import { pastasDeTemasNaReciclagem } from "@/lib/reciclagem";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PROCURAR NA BIBLIOTECA POR ETIQUETAS — a rota que torna possível a pergunta
 * que hoje não se pode fazer: "seating plans em terracotta".
 *
 * `?etiquetas=tipo:seating-plan,paleta:terracotta` — TODAS têm de estar na
 * foto. `?sem=tipo,paleta` devolve o que falta etiquetar, e
 * `?porConfirmar=1` o que a migração adivinhou e ninguém confirmou ainda: são
 * os dois filtros de que a revisão em lote vive.
 *
 * ── Porquê ler as ligações todas e cruzar aqui ───────────────────────────
 * Com 104 fotos são umas centenas de linhas, e mesmo uma biblioteca dez vezes
 * maior cabe folgadamente numa leitura. Em troca, a semântica do cruzamento
 * fica num módulo puro e testado (`biblioteca-consulta`) em vez de espalhada
 * por SQL gerado — e é essa semântica que decide o que ela vê. Quando a
 * biblioteca crescer ao ponto de isto doer, o sítio para mudar é este, e o
 * teste que guarda o significado continua a valer.
 *
 * O passo CARO — assinar URLs — é que é sempre pago só pela página pedida.
 */

const NAO_INSTALADO =
  "As etiquetas da biblioteca ainda não estão criadas na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação. Faltam as chaves do Supabase " +
  "(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

/** Fotos por página. O mesmo número da grelha de um tema — é a mesma grelha. */
const PAGINA = 60;
const MAX_PAGINA = 200;

function lista(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function inteiro(v: string | null, omissao: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return omissao;
  return Math.min(n, max);
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const procura: Procura = {
    etiquetas: lista(q.get("etiquetas")),
    semEixo: lista(q.get("sem")).filter((e): e is Eixo => isEixo(e)),
    porConfirmar: q.get("porConfirmar") === "1",
    pasta: q.get("pasta") ?? undefined,
  };
  const limite = inteiro(q.get("limit"), PAGINA, MAX_PAGINA) || PAGINA;
  const inicio = inteiro(q.get("offset"), 0, 100_000);

  try {
    const [fotos, ligacoes, naReciclagem] = await Promise.all([
      listFotos(),
      listFotoEtiquetas(),
      pastasDeTemasNaReciclagem(),
    ]);
    const etiquetasDe = porFoto(ligacoes);
    const adivinhadas = porConfirmarSet(ligacoes);

    // Um tema na Reciclagem deixa a pasta no Storage durante 30 dias — e as
    // fotos dele assinavam-se e voltavam a aparecer aqui. Não aparecem.
    // E as fotos das PROPOSTAS, que vivem na mesma tabela (cor, LQIP e forma
    // do estúdio — ver `ehFotoDaBiblioteca`), não são da Biblioteca: entravam
    // no total e saíam da página por não se assinarem no bucket dos temas.
    const encontradas = fotos.filter(
      (f) =>
        ehFotoDaBiblioteca(f.path) &&
        !naReciclagem.has(f.pasta) &&
        (!procura.pasta || f.pasta === procura.pasta) &&
        responde(etiquetasDe.get(f.path), procura, adivinhadas.has(f.path)),
    );
    const pagina = encontradas.slice(inicio, inicio + limite);
    const caminhos = pagina.map((f) => f.path);

    // Assinar é o passo caro, e paga-se só pela página — nunca pela procura
    // inteira. Miniaturas e originais saem em dois pedidos ao Storage, não em
    // dois por foto.
    const [urls, thumbs] = caminhos.length
      ? await Promise.all([signThemePaths(caminhos), signThemeThumbs(caminhos)])
      : [new Map<string, string>(), new Map<string, string>()];

    return NextResponse.json({
      ok: true,
      total: encontradas.length,
      fotos: pagina
        .map((f) => ({
          path: f.path,
          url: urls.get(f.path) ?? "",
          ...(thumbs.get(f.path) ? { thumbUrl: thumbs.get(f.path) } : {}),
          etiquetas: [...(etiquetasDe.get(f.path) ?? [])],
          porConfirmar: adivinhadas.has(f.path),
        }))
        // Uma foto que não se consegue assinar não se consegue mostrar. Mandá-la
        // com `url: ""` enchia a grelha de quadrados partidos.
        .filter((f) => f.url),
    });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("biblioteca fotos GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
