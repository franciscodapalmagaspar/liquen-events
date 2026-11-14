import "server-only";
import { listFotosDaBiblioteca } from "./biblioteca-fotos-da-biblioteca";
import { etiquetar, listFotoEtiquetas } from "./biblioteca-foto-etiquetas-store";
import { planearPaletas, resumoDoPlano, type PlanoDePaletas } from "./paleta-etiquetar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EXECUTOR — corre o plano das paletas sobre a biblioteca que já existe
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `paleta-etiquetar.ts` DECIDE; isto ESCREVE. A separação não é arrumação:
 * a decisão é pura e está testada sem base de dados nenhuma, e o que sobra
 * aqui é tão pouco que se lê de uma vez — que é o que se quer de código que
 * escreve em ~200 linhas de uma tabela.
 *
 * ── O ENSAIO NÃO É UM EXTRA ───────────────────────────────────────────────
 * `ensaio: true` faz tudo menos escrever, e devolve exactamente as mesmas
 * contas. É a mesma convenção da reposição da cópia de segurança, e pela mesma
 * razão: ninguém deve ter de descobrir o que uma migração vai fazer DEPOIS de
 * ela ter feito.
 *
 * ── AS CONTAS SÃO LIDAS DUAS VEZES ────────────────────────────────────────
 * Antes e depois, da tabela e não da memória. É a diferença entre «escrevi 137
 * etiquetas» (o que eu julgo ter feito) e «havia 12, agora há 149» (o que lá
 * está). Se as duas discordarem, o relatório mostra as duas e quem lê decide —
 * em vez de eu escolher a que me favorece.
 */

const PREFIXO_PALETA = "paleta:";

export interface ResultadoDaAplicacao {
  plano: PlanoDePaletas;
  /** Quantas ligações de paleta existiam ANTES, lidas da tabela. */
  antes: number;
  /** E DEPOIS. Em ensaio é igual a `antes`, por construção. */
  depois: number;
  /** Quantas o executor julga ter criado. Comparar com `depois - antes`. */
  criadas: number;
  /** As que falharam a escrever, com o caminho — para se poder repetir só essas. */
  falhadas: Array<{ path: string; erro: string }>;
  ensaio: boolean;
  /** Uma linha pronta a ler. */
  resumo: string;
}

/**
 * Aplica a paleta a todas as fotos que têm cor e ainda não têm etiqueta.
 *
 * Nunca lança: uma etiqueta que falhe entra em `falhadas` e o passe continua.
 * Parar o lote inteiro à primeira falha deixaria a biblioteca a meio, que é o
 * pior dos dois estados possíveis.
 */
export async function aplicarPaletas({ ensaio = false } = {}): Promise<ResultadoDaAplicacao> {
  const [fotos, ligacoes] = await Promise.all([
    // Só a Biblioteca: as fotos das propostas também têm linha (e cor) na
    // tabela, mas não se etiquetam — ver `soDaBiblioteca`.
    listFotosDaBiblioteca(),
    listFotoEtiquetas(),
  ]);

  const contarPaletas = (todas: typeof ligacoes) =>
    todas.filter((l) => l.etiquetaId.startsWith(PREFIXO_PALETA)).length;

  const antes = contarPaletas(ligacoes);
  const jaComPaleta = new Set(
    ligacoes.filter((l) => l.etiquetaId.startsWith(PREFIXO_PALETA)).map((l) => l.path),
  );

  const plano = planearPaletas(
    fotos.map((f) => ({ path: f.path, cor: f.cor })),
    jaComPaleta,
  );

  let criadas = 0;
  const falhadas: Array<{ path: string; erro: string }> = [];

  if (!ensaio) {
    for (const { path, etiquetaId } of plano.aAplicar) {
      try {
        // `origem: "migracao"` e não `"upload"`: estas fotos já cá estavam, e
        // a revisão em lote merece saber a diferença entre «a máquina pôs isto
        // quando a foto entrou» e «a máquina pôs isto num passe posterior».
        const { criada } = await etiquetar(path, etiquetaId, "migracao");
        if (criada) criadas += 1;
      } catch (e) {
        falhadas.push({ path, erro: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Relida da TABELA, não contada na memória — ver o cabeçalho.
  const depois = ensaio ? antes : contarPaletas(await listFotoEtiquetas());

  return {
    plano,
    antes,
    depois,
    criadas,
    falhadas,
    ensaio,
    resumo: [
      ensaio ? "ENSAIO (não escreveu nada)" : "aplicado",
      resumoDoPlano(plano),
      `etiquetas de paleta: ${antes} → ${depois}`,
      falhadas.length > 0 ? `${falhadas.length} falharam` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
