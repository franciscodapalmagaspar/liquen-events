import "server-only";
import { getSupabase } from "./supabase";
import { log } from "./logger";
import type { Linha, NomeDaTabela } from "./db/base";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COLUNAS QUE DESAPARECEM SEM DAR ERRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num email real: o casal recebeu a proposta em anexo, com quinze
 * páginas e mood boards, e o link ao lado abriu uma página com a saudação, o
 * subtotal, o IVA e o total. Sem Apresentação, sem Serviços, sem Inspiração —
 * e sem o botão do PDF.
 *
 * A página está certa: desenha o documento quando `proposal.doc` existe e cai
 * no quadro de preço quando não existe. O que faltava era o `doc`.
 *
 * ── PORQUE É QUE ELE FALTA, E PORQUE É QUE NINGUÉM DEU POR ISSO ───────────
 *
 * O `db/schema.sql` é corrido À MÃO, no editor de SQL do Supabase. Uma base
 * onde a versão nova ainda não foi aplicada não tem as colunas novas — e as
 * escritas desta casa foram todas construídas para SOBREVIVER a isso:
 *
 *     ...(p.doc !== undefined ? { doc: p.doc } : {})
 *
 * e, na rota do envio, um resgate que tira `doc`, `pdf_sha256`, `idioma` e o
 * selo da versão quando a gravação rebenta por coluna em falta, para o email
 * seguir na mesma. A decisão está certa — «uma proposta que não sai é um
 * negócio parado» — e tem um custo que ninguém tinha contado: a partir daí, a
 * casa funciona INTEIRA menos uma coisa, e a coisa que falta é a que o cliente
 * vê.
 *
 * O aviso existia e era um `toast` vermelho no fim de um envio, entre outros
 * quatro. Passa a haver uma pergunta que se pode fazer a frio, antes de
 * qualquer envio: **as colunas estão lá?**
 *
 * ── PORQUE É QUE SÃO ESTAS COLUNAS E NÃO TODAS ────────────────────────────
 *
 * Só entram aqui as colunas cuja ausência é SILENCIOSA — aquelas que a
 * aplicação escreve com um `...(x !== undefined ? … : {})` ou que um resgate
 * deita fora para poder continuar. As outras não precisam desta rede: sem elas
 * a gravação rebenta, alguém vê o erro, e o erro diz o nome da coluna.
 *
 * É por isso que esta lista não se deduz do `db/schema.sql` — deduzia-se a
 * lista errada. Deduz-se dos `toRow` dos mapeadores e dos resgates das rotas, e
 * é por isso que ela vive ao lado deles e não ao lado do esquema.
 */

/**
 * Tabela → colunas que a aplicação escreve só se existirem.
 *
 * Para acrescentar: quando escreveres uma coluna nova com o padrão
 * `...(x !== undefined ? { coluna: x } : {})`, acrescenta-a aqui. É o que
 * impede que a coluna seguinte se perca da mesma maneira.
 */
/** Uma tabela e as colunas a vigiar — que o compilador confere contra os
 *  tipos gerados da base de dados (docs/ESTRUTURA-DOS-DADOS.md, P1): vigiar
 *  uma coluna com o nome errado era ficar a avisar, para sempre, que ela falta. */
function vigiar<N extends NomeDaTabela>(
  tabela: N,
  colunas: readonly (keyof Linha<N> & string)[],
): { tabela: N; colunas: readonly string[] } {
  return { tabela, colunas };
}

export const COLUNAS_QUE_DESAPARECEM = [
  vigiar("proposals", [
    // A mais cara de todas: sem ela o link do casal mostra um quadro de preço
    // em vez da proposta que foi enviada.
    "doc",
    "pdf_sha256",
    "pdf_bytes",
    "idioma",
    "versao_selo",
    "versao_numero",
    "versao_em",
  ]),
  vigiar("contracts", ["proposta_versao_selo", "proposta_versao_numero", "idioma"]),
] as const;

/** O que o Postgres diz quando a coluna não existe. */
function ehColunaDesconhecida(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === "42703") return true;
  return /column .* does not exist|could not find the .* column/i.test(erro.message ?? "");
}

/** E quando é a tabela inteira que falta. */
function ehTabelaDesconhecida(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === "42P01" || erro.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(erro.message ?? "");
}

/**
 * As colunas em falta, com o nome da tabela à frente — `proposals.doc`.
 *
 * Vazio quando está tudo lá, e vazio TAMBÉM quando não há base de dados
 * nenhuma: numa máquina de desenvolvimento o armazenamento é um ficheiro JSON,
 * que não tem esquema nenhum para lhe faltar coisa alguma. Dizer ali «faltam
 * sete colunas» era um alarme falso todos os dias.
 *
 * NUNCA atira. Quem chama isto é um aviso, e um aviso que rebenta desaparece
 * sem dizer porquê — que é o defeito que este ficheiro existe para corrigir.
 * Uma verificação que não consegue apurar nada devolve vazio: não se inventa
 * uma avaria a partir de uma pergunta que não teve resposta.
 */
export async function colunasEmFalta(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const faltam: string[] = [];
  for (const { tabela, colunas } of COLUNAS_QUE_DESAPARECEM) {
    try {
      /**
       * Uma pergunta por tabela no caso normal.
       *
       * `limit(1)` e não `limit(0)`: o PostgREST valida as colunas pedidas de
       * qualquer maneira, e uma linha a mais numa verificação que corre uma vez
       * por minuto não se sente. O que interessa é o ERRO, não os dados.
       */
      const { error } = await sb.from(tabela).select(colunas.join(",")).limit(1);
      if (!error) continue;

      if (ehTabelaDesconhecida(error)) {
        // A tabela inteira em falta é outra conversa — e já há quem a conte
        // (o `estado-do-armazenamento` fá-lo para a `app_state`). Diz-se pelo
        // nome da tabela, uma vez, em vez de listar sete colunas de uma tabela
        // que não existe.
        faltam.push(tabela);
        continue;
      }

      if (!ehColunaDesconhecida(error)) {
        // Base em baixo, permissão recusada, tempo esgotado: NÃO é uma coluna
        // em falta e não se diz que é. Fica no registo e a lista fica como
        // estava — quem tem de gritar por uma base em baixo é o outro aviso.
        log.warn("colunas: não deu para verificar a tabela", {
          tabela,
          erro: error.message,
        });
        continue;
      }

      /**
       * O PostgREST pára na PRIMEIRA coluna desconhecida, portanto o erro de
       * cima só nomeia uma. Aqui pergunta-se uma a uma para a frase que ela vai
       * ler dizer todas — «faltam `doc`, `idioma` e `versao_selo`» resolve-se de
       * uma vez; «falta `doc`» resolve-se três vezes.
       *
       * Só corre no caminho da avaria, que é raro e fica em cache um minuto.
       */
      for (const coluna of colunas) {
        const r = await sb.from(tabela).select(coluna).limit(1);
        if (ehColunaDesconhecida(r.error)) faltam.push(`${tabela}.${coluna}`);
      }
    } catch (e) {
      log.warn("colunas: verificação falhou", { tabela, erro: String(e) });
    }
  }
  return faltam;
}

/**
 * O que fazer, escrito para quem tem o painel do Supabase aberto e não é
 * programadora.
 *
 * Nomeia o ficheiro, diz que é seguro correr outra vez, e diz o que se perde
 * enquanto não for corrido — porque é essa última parte que decide se isto se
 * faz hoje ou para a semana.
 */
export function oQueFazerComAsColunas(emFalta: readonly string[]): string {
  const doDocumento = emFalta.includes("proposals.doc") || emFalta.includes("proposals");
  const consequencia = doDocumento
    ? " Enquanto faltar a coluna `proposals.doc`, o link que o casal recebe abre um quadro com o preço em vez da proposta: sem apresentação, sem serviços, sem fotografias e sem o botão do PDF."
    : "";
  return (
    `Corre o ficheiro db/schema.sql no editor de SQL do Supabase. ` +
    `Leva um minuto, pode ser corrido as vezes que forem precisas e não apaga nada do que já lá está.` +
    consequencia
  );
}

/**
 * O aviso do ENVIO — o que se perdeu nesta proposta, e o que isso custa.
 *
 * Diferente do `oQueFazerComAsColunas`, que fala do estado da instalação: isto
 * fala de uma proposta concreta que acabou de seguir para um casal concreto, e
 * a primeira frase tem de dizer o que ele vai ver. Uma pessoa a ler um aviso
 * depois de carregar em «Enviar» quer saber o que aconteceu ao que enviou,
 * não o que se passa com o esquema da base.
 */
export function avisoDeColunasPerdidas(colunas: readonly string[]): string {
  const lista = colunas.join(", ");
  const remedio =
    `Corre o db/schema.sql no editor de SQL do Supabase (em falta: ${lista}). ` +
    `Leva um minuto e não apaga nada.`;
  if (!colunas.includes("doc")) {
    return (
      `A proposta foi enviada e guardada, mas sem alguns campos que a base não tem. ` +
      `O casal vê a proposta na mesma; o que se perde é o registo da versão e a ` +
      `língua da segunda descarga. ${remedio}`
    );
  }
  return (
    `A proposta foi enviada, mas SEM o documento: o link que o casal acabou de receber ` +
    `abre um quadro com o preço em vez da proposta — sem apresentação, sem serviços, ` +
    `sem fotografias e sem o botão do PDF. ${remedio}`
  );
}

/** A linha de cima do aviso. Diz o que falta, pelo nome. */
export function tituloDasColunas(emFalta: readonly string[]): string {
  const lista = emFalta.join(", ");
  return emFalta.length === 1
    ? `A base de dados não tem a coluna ${lista} — o que se escrever nela perde-se sem dar erro.`
    : `A base de dados não tem ${emFalta.length} colunas (${lista}) — o que se escrever nelas perde-se sem dar erro.`;
}
