import "server-only";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { guardarPdfDaProposta, lerPdfDaProposta } from "@/lib/proposal-pdf-guardado";
import { log } from "@/lib/logger";
import { chaveDoPdf, PropostaIncompleta } from "@/lib/proposal-pdf-chave";

/**
 * Reexportados do `proposal-pdf-chave`, que não traz o `pdf-lib` nem o `sharp`
 * atrás. Quem só precisa da chave — os dois `route.ts` que servem o PDF já
 * guardado — deve importar de LÁ; a razão está escrita nesse ficheiro. Aqui
 * ficam para não obrigar a mudar quem já os importava daqui.
 */
export { chaveDoPdf, PropostaIncompleta };

/**
 * O PDF já desenhado, guardado por conteúdo.
 *
 * ── Porque é que isto tem de existir ──────────────────────────────────────
 * Desenhar uma proposta não é ler um ficheiro: vai buscar até 80 fotos ao
 * Storage (4 de cada vez) e reencoda cada uma com o sharp. São segundos e
 * dezenas de MB de trabalho.
 *
 * A partir do momento em que as rotas anunciam `Accept-Ranges`, o leitor de PDF
 * do cliente deixa de fazer UM pedido e passa a fazer vários — primeiro o fim
 * do ficheiro (a tabela de referências), depois os objectos de cada página. Sem
 * esta cache, cada um desses pedidos voltava a desenhar o documento inteiro, e
 * a melhoria virava uma degradação de cinco ou seis vezes.
 *
 * Por isso a cache e os pedaços entram juntos. Não é uma optimização solta.
 *
 * ── A chave é o CONTEÚDO ──────────────────────────────────────────────────
 * O documento guardado (`ProposalDoc`) traz caminhos do Storage, não bytes, por
 * isso serializá-lo é barato e o resumo é estável. Uma proposta revista muda o
 * documento e portanto muda a chave — não há como servir uma versão velha, e
 * não é preciso invalidar nada à mão.
 *
 * A chave NÃO é a autorização. Quem chama já validou o token antes de aqui
 * chegar; isto é só memória. Dois clientes com o mesmo documento partilham a
 * entrada, e é o mesmo ficheiro para os dois.
 *
 * ── Os limites, e porquê ──────────────────────────────────────────────────
 * Uma função serverless tem pouca memória e isto guarda buffers de MB. O tecto
 * é por BYTES e não por número de entradas, porque é a memória que acaba — seis
 * propostas de 500 KB e seis de 4 MB não são o mesmo risco. Ao passar do tecto,
 * sai a entrada usada há mais tempo.
 *
 * Vive por processo: um arranque a frio começa vazia, e isso está certo. Não é
 * uma cache de que a correcção dependa — é só a diferença entre desenhar uma
 * vez ou seis dentro da mesma sessão de leitura.
 */

/** ~24 MB. Cabem várias propostas típicas (0,5–3 MB) sem ameaçar o tecto de
 *  memória da função, que costuma ser 1 GB mas é partilhado com o sharp. */
const TECTO_BYTES = 24 * 1024 * 1024;

/** Nenhuma proposta razoável passa disto. Um documento maior não entra na
 *  cache (serve-se à mesma, só não fica guardado) para uma proposta anormal
 *  não expulsar todas as outras sozinha. */
const MAXIMO_POR_ENTRADA = 8 * 1024 * 1024;

/** `Map` preserva a ordem de inserção — é o que dá o "usado há mais tempo"
 *  sem estrutura nenhuma: apagar e voltar a pôr manda a entrada para o fim. */
const cache = new Map<string, Buffer<ArrayBuffer>>();
let bytesGuardados = 0;

/**
 * A chave é o CONTEÚDO **mais a LÍNGUA**.
 *
 * A língua não está dentro do `doc` (o documento guardado é um só, em
 * português — ver `proposal-doc-textos`), portanto sem ela na chave as duas
 * versões do mesmo documento partilhavam entrada: quem pedisse a inglesa a
 * seguir a uma portuguesa recebia a portuguesa, de memória, sem desenhar nada e
 * sem erro nenhum. É a mesma falha do «documento revisto» que a chave por
 * conteúdo já evita, só que por um eixo que o JSON do documento não vê.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ORDEM DAS CHAVES NÃO PODE ENTRAR NA CONTA — E ENTRAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «para ver a proposta em PDF quando carrego demora mesmo muito
 * tempo a abrir» — e, depois de tudo o que se lhe fez, continuava a demorar.
 *
 * O `JSON.stringify` escreve as chaves pela ordem em que elas estão no objecto.
 * O documento que se desenha no ENVIO é o objecto que veio do estúdio, com a
 * ordem em que o estúdio o montou. O documento que se lê DEPOIS vem da coluna
 * `proposals.doc`, que é `jsonb` — e o Postgres não guarda `jsonb` como texto:
 * normaliza-o, e essa normalização REORDENA as chaves (por comprimento e
 * depois por bytes).
 *
 * Mesmo documento, mesmíssimo conteúdo, dois resumos diferentes. Consequência,
 * e é a que ela sentia:
 *
 *   · o PDF guardado no envio ficava com uma chave que mais ninguém calculava;
 *   · `lerPdfDaProposta` procurava pela outra e não encontrava nada;
 *   · `pdfGuardadoEmFluxo` — o atalho que serve o ficheiro guardado sem o
 *     redesenhar, e que existe precisamente para isto não demorar — nunca
 *     disparava;
 *   · e cada abertura redesenhava o documento inteiro, oitenta fotografias
 *     pelo `sharp`, num processo a frio.
 *
 * As três camadas de cache estavam escritas, testadas, e a fila do meio nunca
 * acertava. A cache por processo funcionava (as duas pontas lêem o mesmo
 * `proposal.doc`), e é por isso que isto se escondeu: dentro de uma sessão de
 * leitura parecia tudo bem.
 *
 * ── A CORRECÇÃO ────────────────────────────────────────────────────────────
 * O resumo passa a ser do CONTEÚDO e não da arrumação: as chaves de cada
 * objecto são ordenadas antes de escrever. As LISTAS ficam como estão — a
 * ordem de uma lista é conteúdo (a ordem das páginas, a das fotografias de um
 * mood board), e ordená-la faria duas propostas diferentes partilharem
 * ficheiro, que é o defeito grave que esta chave existe para não ter.
 *
 * O que já está guardado com a chave antiga fica órfão: a primeira abertura de
 * cada proposta desenha uma vez e grava com a chave nova. A partir daí é o
 * atalho. Não é preciso migrar nada.
 */
function guardar(chave: string, pdf: Buffer<ArrayBuffer>): void {
  if (pdf.length > MAXIMO_POR_ENTRADA) return;
  const jaLa = cache.get(chave);
  if (jaLa) {
    cache.delete(chave);
    bytesGuardados -= jaLa.length;
  }
  cache.set(chave, pdf);
  bytesGuardados += pdf.length;
  while (bytesGuardados > TECTO_BYTES) {
    const maisAntiga = cache.keys().next();
    if (maisAntiga.done) break;
    const saiu = cache.get(maisAntiga.value)!;
    cache.delete(maisAntiga.value);
    bytesGuardados -= saiu.length;
  }
}

/**
 * O PDF deste documento, desenhado agora ou reaproveitado.
 *
 * Substitui `renderStoredProposalDocPdf` nas rotas que servem o mesmo documento
 * ao mesmo leitor várias vezes seguidas (portal e link da proposta). Onde o
 * documento é desenhado UMA vez — a pré-visualização do back office, o email —
 * continua a chamar-se o renderizador directamente: guardar ali só gastava
 * memória.
 */
export async function pdfDaPropostaEmCache(
  doc: ProposalDoc,
  /**
   * A língua em que a proposta foi feita (`proposals.idioma`, lida com o
   * `idiomaDaProposta`). Por omissão português, que é o que todas as propostas
   * anteriores a essa coluna são — e o que esta função sempre desenhou.
   */
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
  /**
   * Servir o documento mesmo que lhe falte uma fotografia?
   *
   * `true` nos botões que REDESENHAM para ecrã um documento que o casal já
   * recebeu — dar-lhes o documento sem uma foto vale mais do que dar-lhes um
   * botão que não faz nada. `false` (o que fica por omissão) em tudo o que
   * seja o documento de registo. Ver a nota longa lá em baixo.
   */
  servirIncompleto = false,
  /**
   * O id da proposta, para se poder procurar (e guardar) o desenho no Storage.
   *
   * Opcional de propósito: quem não o tiver continua a ter exactamente o
   * comportamento anterior — memória e desenho. Não se inventa aqui um id a
   * partir do documento, porque duas propostas podem partilhar conteúdo (uma
   * cópia) e o ficheiro é o mesmo; o que muda é só onde fica arrumado.
   */
  proposalId?: string,
): Promise<Buffer<ArrayBuffer>> {
  return (await pdfDaPropostaComEstado(doc, idioma, servirIncompleto, proposalId)).pdf;
}

/**
 * O mesmo, e se o documento saiu COMPLETO.
 *
 * Com `servirIncompleto`, um documento a que falte uma fotografia sai na
 * mesma — e quem guarda o que daqui deriva (as páginas em imagem, no telemóvel
 * do casal, por um ano) tem de o saber: a chave é a do conteúdo, e não muda
 * quando ela repõe a fotografia. Só o que vem completo se pode guardar para
 * sempre. O que está em memória ou no armazenamento é sempre completo: um
 * documento com buracos nunca lá entra.
 */
export async function pdfDaPropostaComEstado(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
  servirIncompleto = false,
  proposalId?: string,
): Promise<{ pdf: Buffer<ArrayBuffer>; completo: boolean }> {
  const chave = chaveDoPdf(doc, idioma);
  const guardado = cache.get(chave);
  if (guardado) {
    // Reinserir para ficar no fim da fila — foi usado agora.
    cache.delete(chave);
    cache.set(chave, guardado);
    return { pdf: guardado, completo: true };
  }

  /**
   * ── E ANTES DE DESENHAR, O QUE FICOU GUARDADO NO ENVIO ─────────────────
   *
   * A cache acima vive por processo, e isso resolve o leitor de PDF a pedir o
   * ficheiro aos bocados. Não resolve o caso que interessa: o casal abre o
   * link do email às onze da noite, três dias depois, num processo que acabou
   * de arrancar. Aí a memória está vazia e ele paga o desenho inteiro —
   * oitenta fotografias reencodadas — atrás de um link que não diz nada
   * enquanto trabalha.
   *
   * O ficheiro já foi desenhado uma vez, no envio, e está guardado com esta
   * mesma chave. Ver `proposal-pdf-guardado.ts`, incluindo a razão de a chave
   * ser o CONTEÚDO: um documento revisto não encontra nada e desenha-se, em
   * vez de servir a versão que o casal não viu.
   *
   * `proposalId` opcional porque nem todos os caminhos o têm à mão — sem ele
   * salta-se esta camada e faz-se o que se fazia antes.
   */
  if (proposalId) {
    const doStorage = await lerPdfDaProposta(proposalId, chave);
    if (doStorage) {
      guardar(chave, doStorage as Buffer<ArrayBuffer>);
      return { pdf: doStorage as Buffer<ArrayBuffer>, completo: true };
    }
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * UM PDF COM BURACOS NÃO SAI DAQUI
   * ════════════════════════════════════════════════════════════════════════
   *
   * Esta função serve o documento **ao casal**. Até aqui chamava
   * `renderStoredProposalDocPdf`, que deita fora o relatório: uma fotografia
   * que não resolvesse desaparecia da proposta e o ficheiro seguia na mesma,
   * bonito e incompleto, sem ninguém saber. O ecrã do back office já avisava
   * (cabeçalho `X-Fotos-Em-Falta`); a porta do cliente não avisava nada.
   *
   * UMA SEGUNDA TENTATIVA, E DEPOIS PÁRA. A causa mais comum de uma foto não
   * resolver é passageira — um pedido ao Storage que expirou, uma ligação que
   * caiu a meio de oitenta. Repetir apanha esse caso, e não custa nada quando
   * não é esse (o caminho normal é zero em falta e não repete).
   *
   * Se à segunda continuar a faltar, **não se serve**. É o pedido dela, e está
   * certo: uma proposta com fotos a menos enviada a um casal é pior do que um
   * erro, porque o erro vê-se e a falta não — nem ela nem o casal sabem o que
   * era suposto lá estar.
   *
   * O que NÃO se faz aqui é guardar em cache o que falhou. A falha é
   * passageira por definição; guardá-la fixava-a até ao próximo arranque a
   * frio — o mesmo erro de gravar uma falha como se fosse um facto que já
   * apareceu na cache de fotografias e na célula do estúdio.
   */
  let ultimo = await renderStoredEditorialPdfWithReport(doc, idioma);
  if (ultimo.missingImages > 0) {
    log.warn("proposta-pdf: fotos em falta, a tentar segunda vez", {
      emFalta: ultimo.missingImages,
    });
    // A repetição é para apanhar uma foto que não resolveu, não para mudar o
    // que sai: MESMO documento, MESMA língua.
    ultimo = await renderStoredEditorialPdfWithReport(doc, idioma);
  }
  if (ultimo.missingImages > 0) {
    /**
     * ── E AQUI A REGRA MUDOU, POR UMA RAZÃO MEDIDA NO TELEMÓVEL DELA ──────
     *
     * «Quero que este botão ver a proposta de PDF funcione porque não está a
     * funcionar.» Estava: uma proposta com quatro fotografias em falta no
     * armazenamento fazia isto atirar, a rota respondia 503 sem corpo, e o
     * botão «VER A PROPOSTA COMPLETA (PDF)» não fazia **nada**. Nem abria, nem
     * explicava. Um botão que não faz nada é a pior das saídas: o casal
     * conclui que o link está partido, e ninguém do lado de cá fica a saber.
     *
     * A recusa continua a ser a regra onde ela foi pedida — o ANEXO DO EMAIL,
     * que é o documento de registo, e que passa por outro caminho
     * (`api/orcamento/[id]/proposta-doc`). Aqui é outra coisa: este botão
     * REDESENHA, para ecrã, um documento que o casal já recebeu. Entre não lhe
     * dar nada e dar-lhe o documento sem uma fotografia, dá-se o documento.
     *
     * E o aviso não se perdeu: mudou de sítio e de destinatário. Passou para
     * ANTES do envio, no estúdio, com o nome do mood board e a posição da foto
     * (`proposta-fotos-verificacao.ts`) — que é onde ela o pode corrigir em
     * trinta segundos, em vez de o casal tropeçar nele semanas depois.
     */
    if (servirIncompleto) {
      log.error("proposta-pdf: servido INCOMPLETO — o link vale mais do que um 503", null, {
        emFalta: ultimo.missingImages,
      });
      // NÃO se guarda em cache. Uma falta é passageira por definição, e fixá-la
      // punha o documento com buracos a durar até ao próximo arranque a frio —
      // mesmo depois de ela repor a fotografia.
      return { pdf: ultimo.pdf, completo: false };
    }
    log.error("proposta-pdf: RECUSADO — o documento sairia com fotos a menos", null, {
      emFalta: ultimo.missingImages,
    });
    throw new PropostaIncompleta(ultimo.missingImages);
  }

  guardar(chave, ultimo.pdf);
  // E fica também no Storage, para o próximo processo não voltar a desenhar.
  // Sem `await` no caminho de leitura seria uma escrita a apanhar o fim da
  // função; com `await` são uns milissegundos numa resposta que acabou de
  // gastar segundos a desenhar.
  if (proposalId) await guardarPdfDaProposta(proposalId, chave, ultimo.pdf);
  return { pdf: ultimo.pdf, completo: true };
}

/**
 * O documento não pode ser servido porque sairia com fotografias a menos.
 *
 * Tem tipo próprio para quem chama poder distinguir isto de uma avaria
 * qualquer: a resposta ao cliente é diferente (isto é temporário e tem
 * conserto) e a mensagem para os registos também.
 */

/** Só para os testes: esvaziar entre casos. */
export function esvaziarCachePdf(): void {
  cache.clear();
  bytesGuardados = 0;
}

/** Só para os testes: o que está guardado agora. */
export function estadoCachePdf(): { entradas: number; bytes: number } {
  return { entradas: cache.size, bytes: bytesGuardados };
}
