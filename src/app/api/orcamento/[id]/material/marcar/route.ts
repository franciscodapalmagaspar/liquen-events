import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getForQuote, updateEventMaterial } from "@/lib/event-material-store";
import { listItemsOfEvent, updateEventItemWith } from "@/lib/event-material-items-store";
import type { EventMaterialItem } from "@/lib/event-material-types";
import { listLogOf, registar } from "@/lib/event-material-log-store";
import type { AccaoOffline } from "@/lib/material-offline";
import { isConflictError } from "@/lib/repository";
import { respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Descarrega até `MAX_MARCACOES` marcações, uma a uma e com escrita própria
 *  cada; os 10 s por omissão do alojamento cortavam a fila a meio e o armazém
 *  via um erro de rede depois de duas horas offline. */
export const maxDuration = 60;

const ACCOES: AccaoOffline[] = [
  "loaded",
  "unloaded",
  "returned",
  "missing",
  "note",
  "used",
  "fechado",
];

/** Um lote grande é duas horas sem rede; acima disto é engano ou abuso. */
const MAX_MARCACOES = 500;

/**
 * Os dois EIXOS de uma linha: carregar/descarregar e devolver/dar em falta.
 * Duas marcações do mesmo eixo disputam-se; de eixos diferentes, não.
 */
type Eixo = "carga" | "regresso";
function eixoDe(accao: AccaoOffline): Eixo | null {
  if (accao === "loaded" || accao === "unloaded") return "carga";
  if (accao === "returned" || accao === "missing") return "regresso";
  return null;
}

/** O carimbo que a linha guarda para um eixo (só existe nos estados «sim»). */
function carimboNaLinha(item: EventMaterialItem, eixo: Eixo): string {
  return (eixo === "carga" ? item.loadedAt : item.returnedAt) ?? "";
}

/**
 * DESCARREGA A FILA DE MARCAÇÕES.
 *
 * Recebe um LOTE, não uma marcação de cada vez: quem esteve duas horas sem rede
 * tem quarenta para enviar, e quarenta pedidos numa ligação fraca é a maneira
 * de metade se perder.
 *
 * ── O conflito ────────────────────────────────────────────────────────────
 * Ganha a marcação mais recente pelo relógio de QUEM MARCOU, não pelo de
 * chegada. Um telemóvel offline há uma hora traz marcações mais ANTIGAS do que
 * as de quem marcou agora no armazém, mesmo chegando depois — decidir pela
 * ordem de chegada dava a vitória a quem tinha pior rede.
 *
 * A marcação que perde NÃO é deitada fora: fica no registo com `superseded`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    const marcacoes = Array.isArray(body?.marcacoes) ? body.marcacoes : [];
    if (marcacoes.length === 0) return NextResponse.json({ ok: true, aplicadas: 0 });
    if (marcacoes.length > MAX_MARCACOES) {
      return NextResponse.json({ error: "Lote demasiado grande" }, { status: 413 });
    }

    const evento = await getForQuote(id);
    if (!evento) return NextResponse.json({ error: "Sem checklist" }, { status: 404 });

    const itens = await listItemsOfEvent(evento.id);
    const porId = new Map(itens.map((i) => [i.id, i]));

    // ── O CARIMBO DE CADA EIXO, MESMO DEPOIS DE LIMPO (auditoria 6, n.º 9) ──
    //
    // «Descarregado» e «em falta» limpam o carimbo da linha (`loadedAt` /
    // `returnedAt` a nulo) — é isso que os faz ler como «não». Comparar só com
    // a linha deixava, por isso, de haver com que comparar: um «carregado» das
    // 10:00 de um telemóvel que esteve offline desfazia o «descarregado» das
    // 10:05, e a carrinha saía sem o material que a checklist dizia lá estar.
    //
    // O carimbo de TODAS as marcações já vive no registo do evento (que só
    // cresce), por isso compara-se com o mais recente de lá, de cada eixo —
    // sem coluna nova. Uma leitura por lote, não uma por marcação.
    const ultimoPorEixo = new Map<string, string>();
    const chave = (itemId: string, eixo: Eixo) => `${itemId}|${eixo}`;
    const notarCarimbo = (itemId: string, eixo: Eixo, quando: string) => {
      const k = chave(itemId, eixo);
      if (quando > (ultimoPorEixo.get(k) ?? "")) ultimoPorEixo.set(k, quando);
    };
    for (const l of await listLogOf(evento.id)) {
      if (l.superseded || !porId.has(l.itemId)) continue;
      const eixo = eixoDe(l.action);
      if (eixo) notarCarimbo(l.itemId, eixo, l.markedAt);
    }

    let aplicadas = 0;
    let ignoradas = 0;
    /** O estado para onde o «Dar por carregada» leva a checklist, se ele veio. */
    let estadoDoFecho: "carregada" | "preparada" | null = null;
    let fechoEm = "";
    // Marcações que perderam uma corrida de escrita (não uma corrida de
    // relógios, que é a `ignoradas`). Contam-se à parte porque significam outra
    // coisa: alguém marcou a MESMA linha no mesmo instante a partir de outro
    // telemóvel. Ver o tratamento por marcação, mais abaixo.
    let conflitos = 0;

    for (const m of marcacoes) {
      const itemId = typeof m?.itemId === "string" ? m.itemId : "";
      const accao = ACCOES.includes(m?.accao) ? (m.accao as AccaoOffline) : null;
      const markedAt = typeof m?.markedAt === "string" ? m.markedAt : "";
      const actor = typeof m?.actor === "string" ? m.actor.slice(0, 120) : "";
      /**
       * ── O FECHO NÃO É SOBRE NENHUMA LINHA ────────────────────────────────
       *
       * Sai daqui antes da procura pelo item, porque não tem item nenhum: é o
       * «Dar por carregada» do fim do carregamento, e diz respeito à checklist
       * inteira. Aplica-se DEPOIS do ciclo, com o último carimbo que chegar —
       * um telemóvel que esteve offline pode trazer um fecho mais antigo do
       * que o reabrir que outra pessoa fez entretanto, e é a mesma regra de
       * sempre: ganha o relógio de quem marcou.
       */
      if (accao === "fechado") {
        if (!markedAt) {
          ignoradas++;
          continue;
        }
        const para = m?.valor === "preparada" ? "preparada" : "carregada";
        if (markedAt >= fechoEm) {
          estadoDoFecho = para;
          fechoEm = markedAt;
        }
        await registar({
          eventId: evento.id,
          itemId: "",
          action: "fechado",
          value: para,
          actor,
          markedAt,
          superseded: false,
        });
        aplicadas++;
        continue;
      }

      const item = porId.get(itemId);
      if (!item || !accao || !markedAt) {
        ignoradas++;
        continue;
      }

      // A marcação que já lá está é mais recente? Então esta perdeu — mas fica
      // registada, para se poder saber que existiu. «Já lá está» é a linha OU
      // o registo: o registo é o único que se lembra de quando foi limpa.
      const eixo = eixoDe(accao);
      const maisRecente = (linha: EventMaterialItem): string => {
        if (!eixo) return "";
        const doRegisto = ultimoPorEixo.get(chave(itemId, eixo)) ?? "";
        const daLinha = carimboNaLinha(linha, eixo);
        return doRegisto > daLinha ? doRegisto : daLinha;
      };
      const perdeu = Boolean(eixo) && maisRecente(item) > markedAt;

      await registar({
        eventId: evento.id,
        itemId,
        action: accao,
        value: typeof m?.valor === "string" ? m.valor.slice(0, 500) : undefined,
        actor,
        markedAt,
        superseded: perdeu,
      });

      if (perdeu) {
        ignoradas++;
        continue;
      }

      const patch: Record<string, unknown> = {};
      switch (accao) {
        case "loaded":
          patch.loadedAt = markedAt;
          patch.loadedBy = actor;
          break;
        case "unloaded":
          // `null` e não undefined: é uma instrução para LIMPAR o carimbo, e um
          // undefined seria ignorado pelo patch.
          patch.loadedAt = null;
          patch.loadedBy = null;
          break;
        case "returned":
          patch.returnedAt = markedAt;
          patch.returnedBy = actor;
          patch.missing = false;
          break;
        case "missing":
          patch.missing = true;
          patch.returnedAt = null;
          break;
        case "note":
          patch.note = typeof m?.valor === "string" ? m.valor.slice(0, 500) : "";
          break;
        case "used":
          patch.usedQty = Number(m?.valor) || 0;
          break;
      }
      // ── A colisão trata-se AQUI, por marcação, e nunca deita o lote fora ──
      //
      // O bloqueio optimista (ver o `touch` em event-material-items-store) pode
      // recusar esta escrita: duas pessoas a marcar a mesma linha ao mesmo
      // tempo enquanto carregam a carrinha é o caso normal desta tabela, não a
      // excepção. Se o erro subisse até ao `catch` de topo, uma linha
      // disputada devolvia 500 e levava atrás as outras trinta e nove
      // marcações de quem esteve duas horas sem rede — precisamente o que esta
      // rota existe para não deixar acontecer.
      //
      // Nada se perde ao contar em vez de atirar: o `registar` acima já gravou
      // esta marcação no registo do evento ANTES da escrita, com quem a fez e a
      // que horas. Perde-se a aplicação, nunca o facto — e ele fica
      // recuperável à mão a partir do registo.
      try {
        // A decisão repete-se sobre a linha FRESCA, dentro da escrita: dois
        // lotes ao mesmo tempo não podem pôr um carimbo mais velho por cima
        // de um mais novo só porque a leitura do início já era velha.
        let perdeuNaHora = false;
        const escrita = await updateEventItemWith(item.id, (actual) => {
          perdeuNaHora = Boolean(eixo) && maisRecente(actual) > markedAt;
          return perdeuNaHora ? actual : ({ ...actual, ...patch } as EventMaterialItem);
        });
        if (!escrita || perdeuNaHora) {
          // A linha já não existe (a checklist foi regenerada entretanto), ou
          // perdeu na hora: não se aplicou, e não se conta como aplicada.
          ignoradas++;
          continue;
        }
        if (eixo) notarCarimbo(itemId, eixo, markedAt);
        aplicadas++;
      } catch (err) {
        if (!isConflictError(err)) throw err;
        conflitos++;
        log.warn("material marcar: marcação em conflito com outra pessoa na mesma linha", {
          eventId: evento.id,
          itemId,
          accao,
          actor,
        });
      }
    }

    // O estado da checklist escreve-se UMA vez, no fim, e só se mudou mesmo:
    // um lote com quarenta marcações e um fecho não pode dar quarenta
    // escritas no cabeçalho.
    let estado = evento.status;
    if (estadoDoFecho && estadoDoFecho !== evento.status) {
      // Nunca por cima de «devolvida»: o material já voltou, e um fecho
      // atrasado de um telemóvel que esteve sem rede não pode fazer o evento
      // andar para trás no tempo.
      if (evento.status !== "devolvida") {
        await updateEventMaterial(evento.id, { status: estadoDoFecho });
        estado = estadoDoFecho;
      }
    }

    return NextResponse.json({
      ok: true,
      aplicadas,
      ignoradas,
      conflitos,
      estado,
      itens: await listItemsOfEvent(evento.id),
    });
  } catch (err) {
    // Ver `respostaDeMigracaoEmFalta`: a checklist compara sobre `updated_at` e
    // quem está no armazém a marcar material merece saber que falta correr o
    // ficheiro, não "Erro interno" a meio de um carregamento.
    const migracao = respostaDeMigracaoEmFalta(err, "As marcações de material");
    if (migracao) return migracao;
    log.error("material marcar falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
