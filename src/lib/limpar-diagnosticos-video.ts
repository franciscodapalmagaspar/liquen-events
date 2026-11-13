import "server-only";
import { apagarEstadoPorPrefixo } from "./app-state";

/**
 * Os registos do diagnóstico do vídeo da entrada (`diagnostico-video:<dia>:<sessão>`,
 * ver `src/lib/diagnostico-video.ts`) saem do `app_state` ao fim de
 * {@link DIAS_DO_DIAGNOSTICO} dias.
 *
 * O diagnóstico desligou-se a 4/11 e as linhas ficavam lá para sempre — uma
 * por página aberta, a ocupar a base de dados do plano gratuito sem servirem a
 * ninguém (auditoria de 13/11, n.º 15). A chave traz o dia (UTC), por isso o
 * corte é pela chave e nada que não seja um destes registos pode sair.
 *
 * Corre de noite, com a cópia de segurança; uma limpeza que falha fica para a
 * noite seguinte.
 */
export const PREFIXO_DO_DIAGNOSTICO = "diagnostico-video:";
export const DIAS_DO_DIAGNOSTICO = 30;

export function limparDiagnosticosDoVideo(agora: Date): Promise<number | null> {
  const corte = new Date(agora.getTime() - DIAS_DO_DIAGNOSTICO * 86_400_000);
  return apagarEstadoPorPrefixo(
    PREFIXO_DO_DIAGNOSTICO,
    `${PREFIXO_DO_DIAGNOSTICO}${corte.toISOString().slice(0, 10)}`,
  );
}
