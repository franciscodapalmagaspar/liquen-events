import "server-only";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";
import {
  guardarDesmontado,
  remontarDoArquivo,
  type ClienteDoArquivo,
  type ResultadoDoArquivo,
} from "./guardar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ARQUIVO DESMONTADO, DO LADO DO SERVIDOR (fase 2 — DESLIGADO por omissão)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Chamado por `guardarPdfDaProposta` quando um PDF NOVO fica guardado em
 * `proposal-pdfs` (no envio, ou quando o link do casal o desenha e guarda). O
 * original fica sempre, e é ele que as rotas servem.
 *
 * ── PORQUE É QUE ESTÁ DESLIGADO ─────────────────────────────────────────
 *
 * Ele pediu: «se o espaço a mais passar de ~20 MB, para e avisa antes de
 * ativar». Medido (`docs/ARQUIVO-DE-PDFS.md`, §9): cada PDF novo acrescenta,
 * enquanto o original fica, 0,8 a 2,8 MB — o tecto de 20 MB enche-se em uma a
 * três semanas de envios. Por isso só corre com `ARQUIVO_DE_PDFS=ligado` na
 * Vercel, e mesmo ligado pára sozinho no tecto (`guardar.ts`).
 *
 * Nunca lança, nunca atrasa nem impede um envio.
 */
export const ligado = () => process.env.ARQUIVO_DE_PDFS === "ligado";

const cliente = () => getSupabase() as unknown as ClienteDoArquivo | null;

export async function arquivarPdfDesmontado(
  proposalId: string,
  chave: string,
  pdf: Uint8Array,
): Promise<ResultadoDoArquivo | null> {
  if (!ligado()) return null;
  const sb = cliente();
  if (!sb) return null;
  try {
    return await guardarDesmontado(sb, log, proposalId, chave, pdf);
  } catch (e) {
    log.warn("arquivo de PDFs: falhou — o original está intacto", { erro: String(e) });
    return null;
  }
}

/**
 * O PDF remontado do arquivo, provado pelo sha256 (fase 3: ainda nenhuma rota
 * o usa — a rota do PDF continua a servir o ORIGINAL).
 */
export async function remontarPdfDoArquivo(
  proposalId: string,
  chave: string,
  esperado?: string,
): Promise<Buffer | null> {
  const sb = cliente();
  if (!sb) return null;
  return remontarDoArquivo(sb, proposalId, chave, esperado);
}
