import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme, updateTheme } from "@/lib/themes-store";
import { countThemeFiles, listThemeObjects, themeFolder } from "@/lib/theme-storage";
import { moverFotosDaBiblioteca } from "@/lib/theme-materializar";
import {
  MAX_PHOTO_ORDER,
  MAX_THEME_NOTES,
  THEME_MERGE_BATCH,
  type ThemeMergeBatch,
} from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
/** Um lote são 40 fotos e ~120 chamadas de Storage; mesmo com zero bytes a
 *  atravessar a função, não cabem nos 10 s por omissão do alojamento. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * JUNTAR DOIS TEMAS NUM SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `[id]` é a ORIGEM — o tema que desaparece da lista — e o destino vem no
 * corpo. É a mesma convenção da rota irmã (`/imagens/copiar`), e pela mesma
 * razão: quem tem de ser lido, escrito e limpo é a origem.
 *
 * ── PORQUE É QUE ISTO É UMA ROTA E NÃO UM CICLO NO CLIENTE ────────────────
 *
 * Porque o cliente NÃO SABE os caminhos. O «Copiar para…» leva as fotos que
 * estão selecionadas na grelha, e por isso já as tem à mão; uma fusão parte da
 * lista de temas, onde nenhuma pasta está aberta e onde a origem pode ter
 * milhares de fotos. Ir buscá-las pela rota das imagens custaria assinar todas
 * — centenas de URLs por página, para depois os deitar fora sem os usar.
 *
 * Aqui a listagem é a primitiva barata (`listThemeObjects`, sem assinar nada) e
 * acontece do lado de dentro.
 *
 * ── PORQUE É QUE CADA CHAMADA LEVA SÓ UM LOTE ─────────────────────────────
 *
 * Porque `maxDuration` são 60 s e um tema pode ter 3000 fotos. Cada chamada
 * leva até `THEME_MERGE_BATCH` e devolve por onde continuar; o cliente repete
 * até `done`. Cada lote é atómico por foto (`bucket.move`) e REPETÍVEL — parar
 * a meio, ou a ligação cair, não deixa nada num estado inválido: fica um tema
 * com menos fotos e outro com mais, que é exactamente o que uma fusão a meio é.
 *
 * ── O `nextOffset`, QUE NÃO É UM DETALHE ──────────────────────────────────
 *
 * A pasta ENCOLHE à medida que se move. Listar sempre do zero é o certo para as
 * que saem — mas as que FICAM (as repetidas e as que falharam) voltariam a ser
 * tentadas em cada chamada, e a fusão nunca acabava. Por isso o deslocamento
 * seguinte é o número de fotos que ficaram para trás, e só esse.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configura o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;
  try {
    const source = await getTheme(id);
    if (!source) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const destino = typeof body?.destino === "string" ? body.destino : "";
    if (!destino || destino === id) {
      return NextResponse.json(
        { error: "A origem e o destino são o mesmo tema." },
        { status: 400 },
      );
    }
    const dest = await getTheme(destino);
    if (!dest) {
      return NextResponse.json({ error: "Tema de destino não encontrado." }, { status: 404 });
    }
    // Um tema de FILTRO não tem pasta própria: as suas fotos vivem noutros
    // temas e são o resultado de uma pergunta. Fundir um seria mover fotos que
    // não são dele; fundir PARA um seria escrever numa pasta que ninguém lê.
    if (source.kind === "filtro" || dest.kind === "filtro") {
      return NextResponse.json(
        { error: "Um tema de filtro não tem fotos próprias — não há nada para fundir." },
        { status: 400 },
      );
    }

    const rawOffset = Number(body?.offset);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;

    const listed = await listThemeObjects(id, THEME_MERGE_BATCH, offset);
    // Pasta ilegível NÃO é pasta vazia: parar aqui é o que impede uma falha de
    // leitura de se transformar em «acabou, arquiva-se a origem».
    if (!listed.ok) {
      return NextResponse.json(
        { error: "Não foi possível ler as fotos deste tema. Tenta outra vez." },
        { status: 502 },
      );
    }

    const folder = themeFolder(id);
    const paths = listed.objects.map((o) => `${folder}/${o.name}`);

    // Pela porta do mover, e nunca pelo `transferThemeImage(…, "move")` à
    // mão: é ela que reescreve as referências das propostas e dos rascunhos e
    // leva as etiquetas da Biblioteca atrás da foto (auditoria 6, n.º 1). Uma
    // foto que não pôde ir com tudo o que é dela fica — e conta como falhada.
    const results = await moverFotosDaBiblioteca(paths, destino);

    const movidas: { from: string; to: string }[] = [];
    let existing = 0;
    let failed = 0;
    let thumbsMissing = 0;
    paths.forEach((from, i) => {
      const r = results[i];
      if (r?.outcome === "copied") {
        movidas.push({ from, to: r.to });
        if (!r.thumb) thumbsMissing += 1;
      } else if (r?.outcome === "exists") existing += 1;
      else failed += 1;
    });

    // A ARRUMAÇÃO ACOMPANHA AS FOTOS, lote a lote.
    //
    // À prova de bala, como na rota irmã: `photo_order` e `cover_path` são
    // colunas que podem não existir numa base sem o db/schema.sql corrido, e um
    // movimento JÁ FEITO não pode passar a reportar-se como falhado por causa
    // de arrumação. Regista-se e segue-se.
    if (movidas.length > 0) {
      try {
        await arrumarDepoisDeMover(id, destino, movidas);
      } catch (e) {
        log.warn("temas fundir: arrumação não acompanhou o lote", { id, erro: String(e) });
      }
    }

    // A página veio incompleta: a pasta acabou. (`truncated` é o contrário —
    // veio cheia, portanto há mais para trás.)
    const done = !listed.truncated;
    let leftBehind = 0;
    let archived = false;
    if (done) {
      // Contam-se as que SOBRARAM mesmo, em vez de as somar por conta própria:
      // ao fim de vários lotes a soma do cliente e a verdade da pasta podem
      // divergir, e quem decide arquivar tem de olhar para a pasta. A contagem
      // acabou de ser invalidada por cada movimento, por isso é fresca.
      const restantes = await countThemeFiles(id);
      // Uma contagem que não se leu conta como «há lá qualquer coisa»: o que
      // não se sabe nunca pode virar «acabou, arquiva-se».
      leftBehind = restantes.ok ? restantes.total : Math.max(1, existing + failed);
      // Só se arquiva o que ficou VAZIO. Com uma foto lá dentro — repetida ou
      // falhada — arquivar era escondê-la, e esconder uma fotografia é a única
      // coisa que uma fusão não pode fazer.
      if (restantes.ok && restantes.total === 0) {
        archived = await fecharAFusao(id, destino);
      }
    }

    const resposta: ThemeMergeBatch = {
      ok: true,
      moved: movidas.length,
      existing,
      failed,
      thumbsMissing,
      nextOffset: offset + existing + failed,
      done,
      leftBehind,
      archived,
    };
    return NextResponse.json(resposta);
  } catch (err) {
    log.error("temas fundir POST falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * A ordem manual e a capa, depois de um lote sair da origem.
 *
 * Duas escritas, e cada uma com a sua razão:
 *
 *  · na ORIGEM, tirar os caminhos que já lá não estão. Sem isto, a primeira
 *    página da origem vinha CURTA — o `planOrderedPage` metia-os na página e o
 *    filtro final deitava-os fora;
 *  · no DESTINO, acrescentar os caminhos novos ao FIM. Ao fim e não ao
 *    princípio: quem funde está a arrumar, não a promover — as fotos que ela
 *    escolheu pôr à frente no tema que fica continuam à frente.
 *
 * A capa da origem some com o tema; a do destino nunca se toca.
 */
async function arrumarDepoisDeMover(
  id: string,
  destino: string,
  movidas: { from: string; to: string }[],
): Promise<void> {
  const gone = new Set(movidas.map((m) => m.from));
  const origem = await getTheme(id);
  const patchOrigem: { photoOrder?: string[]; coverPath?: string } = {};
  const ordem = origem?.photoOrder ?? [];
  if (ordem.some((p) => gone.has(p))) patchOrigem.photoOrder = ordem.filter((p) => !gone.has(p));
  if (origem?.coverPath && gone.has(origem.coverPath)) patchOrigem.coverPath = "";
  if (patchOrigem.photoOrder || patchOrigem.coverPath !== undefined) {
    await updateTheme(id, patchOrigem);
  }

  const alvo = await getTheme(destino);
  if (!alvo) return;
  const ordemDoDestino = alvo.photoOrder ?? [];
  // Só se escreve se o destino JÁ tinha ordem manual: dar ordem manual a um
  // tema que não a tinha congelava-o na ordem em que a fusão calhou de correr,
  // e ele estava a ser mostrado por data — que é uma escolha, não uma ausência.
  if (ordemDoDestino.length === 0) return;
  const jaLa = new Set(ordemDoDestino);
  const acrescentar = movidas.map((m) => m.to).filter((p) => !jaLa.has(p));
  if (acrescentar.length === 0) return;
  await updateTheme(destino, {
    photoOrder: [...ordemDoDestino, ...acrescentar].slice(0, MAX_PHOTO_ORDER),
  });
}

/**
 * O último passo: a nota da origem passa para o destino e a origem sai da
 * lista.
 *
 * ARQUIVAR e não apagar. Apagar um tema é a única operação irreversível deste
 * ecrã, e aqui seria irreversível sem ninguém a pedir — a fusão já fez o que
 * lhe compete quando a pasta ficou vazia. Arquivado, o tema sai da frente, o
 * nome antigo continua a existir para quem o procurar, e apagá-lo de vez
 * continua a ser uma decisão dela, no botão que já existe para isso.
 *
 * A NOTA vai atrás porque é escrita à mão e não está em mais lado nenhum:
 * perdê-la numa arrumação seria perder a única coisa que a fusão não pode
 * recriar. Vai com a proveniência à frente, para se saber de onde caiu ali.
 *
 * Devolve `false` — sem lançar — quando a arrumação não passou: nesse caso a
 * fusão está feita e o que falta é cosmético, e um erro aqui não pode
 * transformar um lote concluído numa falha.
 */
async function fecharAFusao(id: string, destino: string): Promise<boolean> {
  try {
    const [origem, alvo] = await Promise.all([getTheme(id), getTheme(destino)]);
    if (!origem || !alvo) return false;
    const nota = (origem.notes ?? "").trim();
    const notaDoAlvo = (alvo.notes ?? "").trim();
    if (nota && !notaDoAlvo.includes(nota)) {
      const junta = notaDoAlvo ? `${notaDoAlvo}\n\nDe "${origem.name}": ${nota}` : nota;
      // O campo tem teto (`MAX_THEME_NOTES`) e a rota do PATCH recusa acima
      // dele. Cortar aqui é preferível a deixar a fusão falhar no último
      // passo por causa de uma nota comprida: o que se perde é o fim de um
      // texto interno, e o que se salvava não era nada.
      await updateTheme(destino, { notes: junta.slice(0, MAX_THEME_NOTES) });
    }
    await updateTheme(id, { arquivado: true });
    return true;
  } catch (e) {
    log.warn("temas fundir: a origem não chegou a ser arquivada", { id, erro: String(e) });
    return false;
  }
}
