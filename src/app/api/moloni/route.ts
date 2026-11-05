import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { configDoMoloni, ErroDoMoloni, estadoDaLigacao, variaveisEmFalta } from "@/lib/moloni";
import { comCpu } from "@/lib/medir-cpu";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Verificar ligação ao Moloni»: a empresa, e os cinco artigos — encontrados
 * pelo nome exacto, com o IVA que têm lá. Só corre quando ela carrega no botão
 * (regra 7: nenhum polling, nada agendado).
 */
async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const cfg = configDoMoloni();
  if (!cfg) {
    return NextResponse.json({ configurado: false, faltam: variaveisEmFalta() });
  }
  try {
    const estado = await estadoDaLigacao(cfg);
    return NextResponse.json({ configurado: true, ...estado });
  } catch (e) {
    if (e instanceof ErroDoMoloni) {
      return NextResponse.json(
        { configurado: true, error: e.message, codigo: e.codigo },
        { status: 502 },
      );
    }
    log.error("moloni: verificar ligação falhou", e);
    return NextResponse.json({ error: "Erro interno ao falar com o Moloni." }, { status: 500 });
  }
}

export const GET = comCpu("moloni estado", GET_semMedida);
