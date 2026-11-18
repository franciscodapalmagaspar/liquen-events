import "server-only";
import { log } from "@/lib/logger";
import { ESPACOS, espacoDaChave, type NomeDoEspaco } from "./espacos";

/**
 * A vigia das leituras do `app_state` (docs/ESTRUTURA-DOS-DADOS.md, P2,
 * primeiro tempo): cada valor lido passa pelo esquema do seu espaço, e o que
 * não bate certo fica REGISTADO — nunca recusado. Quem lê recebe exatamente o
 * mesmo valor de antes; a vigia não muda nada do que acontece, só diz.
 *
 * Um aviso por espaço por instância: a mesma forma estragada lida mil vezes
 * numa varredura é um problema, não mil.
 */

const avisados = new Set<string>();
const MAX_AVISADOS = 200;

function umaVez(motivo: string, avisar: () => void): void {
  if (avisados.has(motivo)) return;
  if (avisados.size >= MAX_AVISADOS) avisados.clear();
  avisados.add(motivo);
  avisar();
}

/** O prefixo aparente de uma chave por registar, para o aviso não levar ids. */
function prefixoAparente(chave: string): string {
  const m = /^[^:]*:?/.exec(chave);
  return (m?.[0] ?? chave).slice(0, 60);
}

/** O espaço da chave; uma chave fora do registo fica registada. */
export function vigiarChave(chave: string): NomeDoEspaco | null {
  const nome = espacoDaChave(chave);
  if (!nome) {
    const prefixo = prefixoAparente(chave);
    umaVez(`sem-espaco:${prefixo}`, () =>
      log.warn("app-state: chave fora do registo dos espaços (app-state/espacos.ts)", { prefixo }),
    );
  }
  return nome;
}

/** Confere o valor lido com o esquema do espaço. Nunca lança, nunca muda nada. */
export function vigiarValor(chave: string, valor: unknown): void {
  // `null` é «não há» (e as lápides dos rascunhos, até a noite as levar).
  if (valor === null || valor === undefined) return;
  const nome = vigiarChave(chave);
  if (!nome) return;
  const r = ESPACOS[nome].valor.safeParse(valor);
  if (r.success) return;
  umaVez(`forma:${nome}`, () =>
    log.warn("app-state: valor fora da forma registada do espaço", {
      espaco: nome,
      problemas: r.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(topo)"}: ${i.code}`),
    }),
  );
}

/** Só para os testes: esquecer os avisos já dados. */
export function esquecerAvisos(): void {
  avisados.clear();
}
