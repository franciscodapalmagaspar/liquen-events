import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TRABALHO PESADO TEM DE DIZER QUANTO TEMPO PRECISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «detetámos que não dá para mandar a proposta para o cliente».
 *
 * A rota que gera e envia a proposta é a mais pesada da aplicação — vai buscar
 * ao armazenamento até oitenta fotografias, redimensiona cada uma, desenha um
 * PDF de uma dúzia de páginas, grava a proposta e manda um email com o ficheiro
 * em anexo. E era a ÚNICA das rotas pesadas que não declarava `maxDuration`.
 *
 * Sem essa linha a plataforma dá o MÍNIMO — dez segundos — e mata a função a
 * meio. Do lado dela não aparece um erro que se perceba: o botão fica a rodar e
 * depois falha. E o mais cruel é que funciona nas propostas pequenas e nos
 * testes: só falha nas que têm fotografias a sério, que são exactamente as que
 * seguem para os casais.
 *
 * A comparação dizia tudo: a rota que SERVE o PDF já feito pedia 20 s, a que
 * faz miniaturas pedia 60, e a que faz tudo isto não pedia nada.
 *
 * ── PORQUE É QUE ISTO É UM TESTE ─────────────────────────────────────────
 *
 * Porque é invisível. Não dá erro de compilação, não dá aviso, passa em todos
 * os testes — e uma rota pesada NOVA nasce exactamente com o mesmo defeito, sem
 * ninguém reparar, até ao dia em que alguém não consegue enviar uma proposta.
 *
 * A lista abaixo é o contrato: uma rota que faça trabalho pesado tem de estar
 * aqui e tem de declarar o seu tempo. Acrescentar uma rota pesada e não a pôr
 * nesta lista é a única maneira de este teste não a apanhar — e é por isso que
 * a lista está escrita com o que cada uma FAZ, para quem a lê saber se a sua
 * pertence cá.
 */

/** As rotas que fazem trabalho pesado, e o que cada uma faz. */
const PESADAS: { rota: string; faz: string; minimo: number }[] = [
  {
    rota: "orcamento/[id]/proposta-doc",
    faz: "resolve até 80 fotos, desenha o PDF, grava e envia por email",
    minimo: 60,
  },
  { rota: "orcamento/[id]/assets", faz: "carrega fotos: sharp + original + miniatura", minimo: 30 },
  { rota: "temas/[id]/imagens", faz: "carrega fotos para a biblioteca", minimo: 30 },
  { rota: "temas/[id]/miniaturas", faz: "fabrica miniaturas em lote", minimo: 30 },
  { rota: "temas/[id]/imagens/copiar", faz: "copia fotos entre pastas", minimo: 30 },
  { rota: "contratos/[id]/pdf", faz: "desenha o PDF do contrato", minimo: 20 },
  // A rota do aceite do cliente saiu (ver `nada-de-aceitar-por-botao.test.ts`):
  // a proposta passa a ser aceite pela conversa, e marcada no back office.
  { rota: "proposta/[token]/pdf", faz: "serve o PDF da proposta ao cliente", minimo: 20 },
  // As duas do portal saíram com ele (achado n.º 37 da auditoria).
  { rota: "backup", faz: "lê treze conjuntos de dados inteiros", minimo: 60 },
  { rota: "backup/restore", faz: "reescreve treze conjuntos de dados", minimo: 60 },
  { rota: "material/importar", faz: "importação em bloco", minimo: 30 },
  { rota: "propostas/copiar", faz: "copia as fotos de uma proposta para outra", minimo: 30 },
  { rota: "orcamento/[id]/assets/importar", faz: "importa fotos para o pedido", minimo: 30 },
  { rota: "admin/derivadas", faz: "refaz derivadas em lote", minimo: 60 },
  // A segunda vaga, encontrada pela mesma pergunta: quanto trabalho é que esta
  // rota faz DEPOIS de o pedido entrar? Todas estas passam dos dez segundos com
  // um lote a sério, e todas morriam a meio sem dar erro que se perceba.
  {
    rota: "temas/[id]/imagens/url",
    faz: "confirma um lote de fotos: cabeçalho do Storage + sharp por cada uma",
    minimo: 30,
  },
  {
    rota: "orcamento/[id]/assets/url",
    faz: "o mesmo, para a pasta do pedido",
    minimo: 30,
  },
  {
    rota: "biblioteca/etiquetar",
    faz: "etiqueta até 500 fotos, em série, com duas idas à base de dados por foto",
    minimo: 30,
  },
  {
    rota: "orcamento/[id]/material/marcar",
    faz: "descarrega até 500 marcações da fila do armazém",
    minimo: 30,
  },
  {
    rota: "temas/[id]",
    faz: "o DELETE copia as fotos referenciadas para as propostas e apaga a pasta",
    minimo: 30,
  },
  // A terceira vaga, e esta era uma LEITURA — o que a fazia parecer leve.
  // Palavras dela: «diz que não é possível carregar os temas». A lista faz uma
  // listagem do Storage POR TEMA mais três assinaturas em bloco: com trinta
  // temas são trinta e três idas à rede, e uma só que se arraste (medi 8 s até
  // o cliente do Supabase desistir de uma porta fechada) leva os dez segundos
  // por diante. O que chega ao ecrã é um 504 do intermediário, sem corpo JSON
  // nenhum — a única falha que nem a rota consegue explicar.
  {
    rota: "temas",
    faz: "lista os temas: uma listagem do Storage por tema + três assinaturas em bloco",
    minimo: 30,
  },
  { rota: "cron/backup", faz: "a cópia de segurança diária", minimo: 60 },
  { rota: "cron/reminders", faz: "o resumo diário", minimo: 30 },
];

const fonte = (rota: string) =>
  readFileSync(path.join(process.cwd(), "src/app/api", rota, "route.ts"), "utf8");

/** O valor declarado, ou `null` se a rota não declara nenhum. */
function tempoDeclarado(rota: string): number | null {
  const m = /export const maxDuration\s*=\s*(\d+)/.exec(fonte(rota));
  return m ? Number(m[1]) : null;
}

describe("as rotas pesadas declaram o tempo de que precisam", () => {
  for (const { rota, faz, minimo } of PESADAS) {
    it(`${rota} — ${faz}`, () => {
      const declarado = tempoDeclarado(rota);
      expect(
        declarado,
        `${rota} não declara \`maxDuration\`. Sem isso a plataforma dá o mínimo (10 s) e mata a ` +
          `função a meio — sem erro que se perceba do lado de quem está a usar.`,
      ).not.toBeNull();
      expect(
        declarado!,
        `${rota} declara ${declarado} s e precisa de pelo menos ${minimo}.`,
      ).toBeGreaterThanOrEqual(minimo);
    });
  }

  /**
   * O tecto do plano. Um valor acima disto não é aceite no arranque — e uma
   * função que não arranca é pior do que uma que demora.
   */
  it("nenhuma pede mais do que o plano permite", () => {
    for (const { rota } of PESADAS) {
      expect(tempoDeclarado(rota)!, rota).toBeLessThanOrEqual(60);
    }
  });
});
