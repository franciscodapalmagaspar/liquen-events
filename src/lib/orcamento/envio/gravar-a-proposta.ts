import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import { createProposal, updateProposal } from "@/lib/proposals-store";
import { isMissingTable, nomeDaColunaEmFalta } from "@/lib/repository";
import { avisoDeColunasPerdidas } from "@/lib/estado-das-colunas";
import { log } from "@/lib/logger";
import { paraComFalha, segue, type Passo } from "./passo";

/**
 * Etapa 9 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): a proposta fica
 * guardada COM o documento (`doc`), antes de o email sair.
 *
 * É a única cópia DURÁVEL do que seguiu para o cliente (o rascunho do estúdio
 * vive em `app_state`, apaga-se e não vai na cópia de segurança), e é dela que
 * sai o botão "ver a proposta em PDF" do link do cliente. `docSaved` diz se
 * isso aconteceu mesmo.
 */
export interface PropostaGravada {
  docSaved: boolean;
  docError?: string;
}

/**
 * Gravar ESTA proposta: uma linha nova, ou a que ficou por enviar.
 *
 * ── UMA GRAVAÇÃO QUE NÃO ACONTECEU NÃO PODE PASSAR POR UMA QUE ACONTECEU ─
 *
 * O `updateProposal` devolve `null` — SEM lançar — quando a linha que se ia
 * actualizar já não existe (`repository.updateWith`: «const current = await
 * backend.get(id); if (!current) return null»). O valor de retorno era
 * ignorado, e o desfecho era o pior que esta rota tem:
 *
 *   1. um envio anterior falhou o email e deixou uma proposta em rascunho;
 *   2. essa linha é apagada noutro separador (o quadro «Propostas» deixa,
 *      e não pergunta nada);
 *   3. este pedido, que a leu no princípio, passa 15 a 40 segundos a
 *      desenhar o PDF e só depois tenta gravar;
 *   4. a gravação não faz nada, `docSaved` fica `true`, e o email SEGUE com
 *      um link assinado sobre um id que não existe. O casal abre-o e lê
 *      «proposta não encontrada».
 *
 * A rota irmã tem escrito, em comentário, que isto nunca pode acontecer —
 * «A persistence failure here is fatal — we do not send an un-acceptable
 * proposal» — e a de baixo já verifica o retorno. Faltava aqui.
 *
 * E a resposta certa não é recusar o envio: a linha antiga já não existe,
 * portanto não há duplicado nenhum a criar. Cria-se uma. É a correcção que
 * mantém a regra da casa — uma proposta que não sai é um negócio parado.
 */
async function guardar(pedidoId: string, p: Proposal, porEnviar: Proposal | null): Promise<void> {
  if (!porEnviar) {
    await createProposal(p);
    return;
  }
  const gravado = await updateProposal(p.id, p);
  if (gravado) return;
  log.warn("proposta-doc: a proposta por enviar desapareceu a meio — cria-se de novo", {
    id: pedidoId,
    proposta: p.id,
  });
  await createProposal(p);
}

/**
 * ════════════════════════════════════════════════════════════════════════
 * UMA COLUNA QUE FALTA NÃO PODE LEVAR AS OUTRAS À FRENTE
 * ════════════════════════════════════════════════════════════════════════
 *
 * O `db/schema.sql` é corrido À MÃO no editor de SQL do Supabase. Numa base
 * onde a versão nova ainda não foi aplicada, as colunas novas não existem e
 * a gravação rebenta. A resposta certa nunca foi recusar o envio — «uma
 * proposta que não sai é um negócio parado» — mas era demasiado bruta:
 * tirava-se TUDO o que fosse recente de uma vez.
 *
 * ── O QUE ISSO CUSTOU, MEDIDO ─────────────────────────────────────────
 *
 * A coluna `proposals.doc` existe naquela base desde 30 de julho. As do
 * selo da versão (`versao_selo`, `versao_numero`, `versao_em`) nasceram a
 * 20 de agosto. No primeiro envio depois disso, a base recusou o
 * `versao_selo` — e o resgate, para salvar três colunas que não existiam,
 * deitou fora a única que existia e a única que o casal vê.
 *
 * O casal recebeu a proposta em anexo, com quinze páginas e mood boards, e
 * o link ao lado abriu uma página com a saudação, o subtotal, o IVA e o
 * total. Nada disto deu erro: a proposta gerou-se, o email saiu, o quadro
 * disse «enviada». A única coisa que dizia o que se tinha perdido era um
 * aviso vermelho no fim do envio, entre outros quatro.
 *
 * ── A REGRA NOVA ──────────────────────────────────────────────────────
 *
 * Tira-se O QUE FALTA, e só isso. O erro nomeia a coluna
 * (`nomeDaColunaEmFalta`); tira-se essa, tenta-se outra vez, e assim por
 * diante até a base aceitar. Uma base a três colunas de distância paga três
 * tentativas — e fica com o documento, que é o que interessa.
 *
 * O tecto de tentativas não é defensivo por hábito: é o que impede um erro
 * que nomeia sempre a mesma coluna (ou uma que não sabemos desmontar) de
 * dar uma volta infinita. Chegando lá, cai-se no resgate largo de antes,
 * que é o comportamento que esta casa já tinha.
 */
/** Coluna da base → campo do `Proposal` que a escreve (todos opcionais: são
 *  os que uma base mais antiga pode não ter). */
const COLUNAS_RECENTES = {
  doc: "doc",
  pdf_sha256: "pdfSha256",
  pdf_bytes: "pdfBytes",
  idioma: "idioma",
  versao_selo: "versaoSelo",
  versao_numero: "versaoNumero",
  versao_em: "versaoEm",
} as const satisfies Record<string, keyof Proposal>;
type CampoRecente = (typeof COLUNAS_RECENTES)[keyof typeof COLUNAS_RECENTES];
const CAMPO_DA_COLUNA = new Map<string, CampoRecente>(Object.entries(COLUNAS_RECENTES));
/** Tudo o que se pode tirar, quando não se sabe o que tirar. */
const TUDO_O_QUE_E_RECENTE: readonly CampoRecente[] = Object.values(COLUNAS_RECENTES);

/** A proposta sem estes campos — só os recentes, que são opcionais. */
function semOsCampos(proposal: Proposal, campos: readonly CampoRecente[]): Proposal {
  const sem = { ...proposal };
  for (const campo of campos) sem[campo] = undefined;
  return sem;
}

/**
 * Tira uma coluna de cada vez, até a base aceitar. Devolve as colunas que
 * ficaram de fora; atira o erro quando não há progresso possível.
 */
async function gravarTirandoOQueFalta(
  pedidoId: string,
  proposal: Proposal,
  porEnviar: Proposal | null,
): Promise<string[]> {
  const colunasPerdidas: string[] = [];
  let candidata = proposal;
  /** O último erro de coluna em falta, para o poder atirar tal e qual se as
   *  tentativas acabarem — o resgate largo precisa de o reconhecer. */
  let ultimoErro: unknown = null;
  // Sete colunas removíveis: oito voltas chegam para as tirar todas uma a
  // uma e ainda sobra a última tentativa.
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    try {
      await guardar(pedidoId, candidata, porEnviar);
      return colunasPerdidas;
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      const coluna = nomeDaColunaEmFalta(e);
      const campo = coluna ? CAMPO_DA_COLUNA.get(coluna) : undefined;
      if (!coluna || !campo) throw e;
      /**
       * PROGRESSO OU NADA FEITO.
       *
       * O erro pode nomear uma coluna que já se tirou — acontece quando o
       * que a base recusa não é a coluna que o erro nomeia (mensagens de
       * driver, erros em cadeia). Sem esta guarda, tirava-se a mesma coluna
       * oito vezes seguidas, sempre com o mesmo resultado, e o envio pagava
       * oito idas à base para acabar no mesmo sítio.
       *
       * Não havendo progresso possível, atira-se o erro ORIGINAL — que é um
       * erro de coluna em falta — para o resgate largo lá fora fazer o que
       * sabe: tirar tudo, gravar o que a base aceitar, e dizer o que se
       * perdeu.
       */
      if (candidata[campo] === undefined) throw e;
      log.warn("proposta-doc: coluna em falta — tira-se só essa e tenta-se de novo", {
        id: pedidoId,
        coluna,
      });
      colunasPerdidas.push(coluna);
      candidata = semOsCampos(candidata, [campo]);
      ultimoErro = e;
    }
  }
  // O tecto foi ao fundo sem a base aceitar. Não se declara guardada uma
  // coisa que não foi: atira-se o último erro DE COLUNA, para o resgate
  // largo lá fora o reconhecer como tal — um `Error` genérico aqui dava
  // um 503 «tenta outra vez» sobre um problema que tentar não resolve.
  throw ultimoErro ?? new Error("proposta-doc: a base recusou todas as tentativas");
}

export async function gravarAProposta(
  pedidoId: string,
  proposal: Proposal,
  porEnviar: Proposal | null,
): Promise<Passo<PropostaGravada>> {
  try {
    const colunasPerdidas = await gravarTirandoOQueFalta(pedidoId, proposal, porEnviar);
    if (colunasPerdidas.length === 0) return segue({ docSaved: true });
    log.error(
      "proposta-doc: colunas em falta na tabela `proposals` — proposta guardada sem elas; corra db/schema.sql",
      null,
      { id: pedidoId, colunas: colunasPerdidas },
    );
    return segue({
      docSaved: !colunasPerdidas.includes("doc"),
      docError: avisoDeColunasPerdidas(colunasPerdidas),
    });
  } catch (e) {
    if (!isMissingTable(e)) {
      log.error("proposta-doc: guardar falhou", e, { id: pedidoId });
      return paraComFalha({
        status: 503,
        corpo: { error: "Não foi possível guardar a proposta. Tenta novamente." },
      });
    }
    /**
     * O RESGATE LARGO, para o caso em que o erro não nomeia a coluna.
     *
     * Acontece com uma tabela inteira em falta e com mensagens que não
     * sabemos desmontar. Aqui não há como escolher o que tirar, portanto
     * tira-se tudo o que possa não existir — a proposta é gravada com o
     * que a base aceitar, o email segue, e o que se perdeu é DITO.
     */
    log.error(
      "proposta-doc: a base recusou os campos novos sem dizer qual — proposta guardada sem eles; corra db/schema.sql",
      e,
      { id: pedidoId },
    );
    try {
      await guardar(pedidoId, semOsCampos(proposal, TUDO_O_QUE_E_RECENTE), porEnviar);
      return segue({
        docSaved: false,
        docError: avisoDeColunasPerdidas(Object.keys(COLUNAS_RECENTES)),
      });
    } catch (e2) {
      log.error("proposta-doc: guardar falhou mesmo sem os campos novos", e2, { id: pedidoId });
      return paraComFalha({
        status: 503,
        corpo: {
          error:
            "Não foi possível guardar a proposta — a base de dados recusou a gravação. " +
            "Verifica se o db/schema.sql foi corrido nesta base.",
        },
      });
    }
  }
}
