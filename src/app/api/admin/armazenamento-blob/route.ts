import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import {
  blobConfigurado,
  caminhoValido,
  ehBaldeDoBlob,
  ehModo,
  type BaldeDoBlob,
} from "@/lib/armazenamento/baldes";
import { modosDosBaldes, modoDoBaldeFresco, mudarModo } from "@/lib/armazenamento/modos";
import { indiceDebaixoDe } from "@/lib/armazenamento/indice";
import { copiar, ensaio, libertar, verificarLigacao } from "@/lib/armazenamento/migracao";
import { usoAtual } from "@/lib/armazenamento/uso";
import { avisosDoBlob } from "@/lib/armazenamento/tectos";
import { gravarMarcadorDoBlob } from "@/lib/ocupacao-do-armazenamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MUDANÇA PARA O VERCEL BLOB, À MÃO E AOS BOCADOS (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Só com sessão de administrador. `POST` com `{ acao, balde?, ... }`:
 *
 *  - `configurar` — verifica que o token abre o store (um HEAD, uma operação
 *    simples). O store privado não precisa de CORS: o navegador só LÊ do Blob
 *    por endereços assinados (`<img>`), e nunca escreve lá;
 *  - `estado`     — os modos, o contador do mês e os avisos. Não escreve;
 *  - `ensaio`     — conta o que se copiaria de um balde. Não escreve;
 *  - `copiar`     — copia até `n` (≤ 50) ficheiros, verificados por sha256.
 *                   Devolve `proximo`: manda-se de volta como `depois`;
 *  - `modo`       — muda o modo de um balde (`supabase`/`espelho`/`blob`). Sair
 *                   de `blob` com ficheiros no índice é RECUSADO: as leituras
 *                   voltavam ao Supabase e os que só estão no Blob sumiam;
 *  - `libertar`   — apaga do SUPABASE até `n` (≤ 100) ficheiros que estão no
 *                   Blob com prova (ver `migracao.ts`). Só em modo `blob`.
 *
 * Cada chamada cabe numa função (tecto de 40 s de trabalho em 60 s).
 *
 * As três perguntas de custo (regra 7): corre só quando o dono a chama, à mão,
 * umas dezenas de vezes no total; o processador vai em ler/escrever ficheiros
 * (~3 MB cada) e calcular sha256 (~10 ms por foto); nada a guardar no build ou
 * no navegador — é a própria mudança.
 */

type Corpo = {
  acao?: unknown;
  balde?: unknown;
  modo?: unknown;
  n?: unknown;
  depois?: unknown;
};

const resposta = (corpo: unknown, estado = 200) =>
  NextResponse.json(corpo, {
    status: estado,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });

async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return resposta({ error: "Não autorizado" }, 401);
  if (!blobConfigurado()) {
    return resposta({ error: "O Vercel Blob não está ligado (falta BLOB_READ_WRITE_TOKEN)." }, 409);
  }
  let corpo: Corpo;
  try {
    corpo = (await request.json()) as Corpo;
  } catch {
    return resposta({ error: "Corpo ilegível." }, 400);
  }
  const acao = typeof corpo.acao === "string" ? corpo.acao : "";
  const precisaDeBalde = ["ensaio", "copiar", "modo", "libertar"].includes(acao);
  if (precisaDeBalde && (typeof corpo.balde !== "string" || !ehBaldeDoBlob(corpo.balde))) {
    return resposta({ error: "Balde desconhecido." }, 400);
  }
  const balde = corpo.balde as BaldeDoBlob;
  const depois =
    typeof corpo.depois === "string" && caminhoValido(corpo.depois) ? corpo.depois : null;
  const n = Number.isFinite(Number(corpo.n)) ? Number(corpo.n) : 10;

  try {
    switch (acao) {
      case "configurar":
        return resposta(await verificarLigacao());
      case "estado": {
        const uso = await usoAtual();
        return resposta({
          modos: await modosDosBaldes(),
          uso,
          avisos: uso ? avisosDoBlob(uso) : [],
        });
      }
      case "ensaio":
        return resposta(await ensaio(balde));
      case "copiar":
        return resposta(await copiar(balde, { n, depois }));
      case "modo": {
        if (!ehModo(corpo.modo)) return resposta({ error: "Modo desconhecido." }, 400);
        // Fresco: a cache de 60 s podia dizer `espelho` com o balde já em `blob`.
        const atual = await modoDoBaldeFresco(balde);
        if (atual === "blob" && corpo.modo !== "blob") {
          const { linhas, completa } = await indiceDebaixoDe(balde, "", 1);
          if (linhas.size > 0 || !completa) {
            return resposta(
              {
                error:
                  "Há ficheiros deste balde no Blob. Sair do modo blob punha as leituras a ir só " +
                  "ao Supabase, e os que só estão no Blob deixavam de aparecer.",
              },
              409,
            );
          }
        }
        const modos = await mudarModo(balde, corpo.modo);
        if (!modos) return resposta({ error: "O modo não ficou gravado." }, 500);
        // O marcador «há ficheiros no Blob» fica gravado JÁ, e não só à noite
        // (3.ª revisão de 17/11, n.º 3): é ele que diz, sem o token, que falta.
        const marcado = await gravarMarcadorDoBlob(Object.values(modos).includes("blob"));
        if (!marcado) log.warn("blob: o marcador da ocupação não ficou gravado", { balde });
        log.info("blob: modo mudado", { balde, modo: corpo.modo });
        return resposta({ modos });
      }
      case "libertar":
        return resposta(await libertar(balde, { n, depois }));
      default:
        return resposta({ error: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    // Só a mensagem nossa: nenhuma resposta leva o token nem endereços assinados.
    log.error("armazenamento-blob: ação falhou", e, { acao });
    return resposta({ error: e instanceof Error ? e.message : "Falhou." }, 500);
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const POST = comCpu("armazenamento-blob POST", POST_semMedida);
