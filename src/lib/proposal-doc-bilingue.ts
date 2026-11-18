/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROSA DELA NAS DUAS LÍNGUAS — ESCRITAS PELAS MÃOS DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A moldura do documento já sai em inglês (`proposal-doc-textos.ts`): os
 * rótulos, os textos da casa, as condições, a data de validade, e os campos que
 * o NOSSO código escreveu (a data, o tipo de evento, a cerimónia, o número de
 * convidados, a referência). O que faltava era o CONTEÚDO: os títulos dos
 * serviços, as descrições, as legendas dos mood boards, os nomes das rubricas.
 *
 * Decisão dela, posta a escolher entre traduzir-lhe a prosa automaticamente e
 * escrever ela as duas versões: escreve ela as duas. Razão dela, à letra: vai
 * num documento de vinte mil euros sem ninguém a ler.
 *
 * Este ficheiro é a regra dessa segunda versão — onde ela vive, o que conta
 * como falta, e como o documento se projecta para inglês na hora de desenhar.
 *
 * ── SEM `server-only`, E É DE PROPÓSITO ───────────────────────────────────
 *
 * É o mesmo motivo por que `proposal-ordem.ts` existe. A regra da ordem vivia
 * dentro do gerador `server-only`, o editor não a podia ler, e o resultado foi
 * um editor a mostrar uma ordem e um PDF a imprimir outra. O erro está aqui à
 * espera: se a regra do «vazio cai para o português» vivesse dentro do gerador,
 * o estúdio não sabia contar os campos que faltam — e o aviso que ela lê antes
 * de gerar deixava de coincidir com o PDF que sai.
 *
 * ── O QUE A CAIXA INGLESA VAZIA FAZ ───────────────────────────────────────
 *
 * Cai para o português, calada, sem marca nenhuma no papel. É a única resposta
 * que nunca pode produzir um buraco, é o que já acontece hoje com tudo, e um
 * documento de vinte mil euros não leva marcas de revisão. A defesa está toda a
 * MONTANTE — o contador junto ao botão que gera, a verificação da Conferência e
 * o painel «Por traduzir», que são os três a ler o {@link camposPorTraduzir}
 * daqui.
 *
 * ── A CONTAGEM, À LETRA ───────────────────────────────────────────────────
 *
 *   inglês ausente ou vazio, com português escrito  ⇒ POR TRADUZIR (conta)
 *   inglês igual ao português                       ⇒ DECIDIDO (não conta)
 *   português vazio                                 ⇒ o campo não existe
 *
 * O segundo caso é o que o botão «Ficar em português» produz, e é o que evita
 * que um campo que não precisa de tradução («Lisianthus», «Monte da
 * Oliveirinha») conte como falta para sempre — um aviso sempre aceso é um aviso
 * que se aprende a ignorar, incluindo no dia em que está certo.
 *
 * O que esta regra NÃO apanha, e fica dito: traduzir, voltar atrás e reescrever
 * o português deixa o inglês desactualizado e continua a não contar, porque
 * está preenchido. Apanhá-lo obrigava a guardar, por campo, o português contra
 * o qual a tradução foi escrita. O modo de falha é uma frase inglesa que
 * descreve uma versão ligeiramente anterior da portuguesa — incomparavelmente
 * menos grave do que uma secção em branco.
 *
 * ── O MODELO ORGANIZAÇÃO AINDA NÃO TEM SEGUNDA VERSÃO ─────────────────────
 *
 * `CampoDeTexto` não conhece o cronograma (`cronograma[].title`,
 * `cronograma[].items[]`) nem as linhas estimadas (`budgetRows[].item`) — é uma
 * lacuna herdada: hoje as gralhas também não os varrem e o salto «Ver no campo»
 * também não os alcança. Uma proposta de Organização em inglês sai com o
 * cronograma em português, e sem aviso. Está dito aqui de propósito, e não
 * resolvido às escondidas: acrescentar um `cronograma[].titleEn` ao tipo sem o
 * registar em `CampoDeTexto` era ter a tradução no documento e fora de todas as
 * contagens, que é o pior dos dois mundos.
 */

import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import type { ProposalDoc } from "./proposal-doc";
import {
  camposDoDocumento,
  chaveDoCampo,
  escreverCampo,
  lerCampo,
  seccaoDoCampo,
  type CampoDeTexto,
} from "./proposal-ortografia";

/**
 * Este campo tem segunda versão escrita por ela?
 *
 * ── UM `switch` SEM `default`, E É AÍ QUE ESTÁ A DEFESA ───────────────────
 * O dia em que alguém acrescentar um campo de prosa ao documento e o registar
 * em `proposal-ortografia.ts`, isto DEIXA DE COMPILAR até alguém decidir se ele
 * tem ou não segunda versão. É a mesma defesa que o `satisfies` dos arrays
 * paralelos do orçamento já usa, e existe pela mesma razão: um campo novo que
 * nasça mudo é um campo que sai em português numa proposta inglesa sem ninguém
 * saber.
 */
export function temVersaoInglesa(c: CampoDeTexto): boolean {
  switch (c.tipo) {
    // ── Os que o NOSSO código escreve: traduzidos por reconhecimento ───────
    // A referência é composta pelo estúdio e o tipo de evento vem do formulário
    // (ver `referenciaNaLingua` e `camposDoEventoNaLingua`). Dar-lhes uma caixa
    // era ter dois mecanismos a escrever o mesmo campo, e no dia em que
    // discordassem ninguém saberia qual mandava.
    case "ref":
    case "eventType":
      return false;
    // ── A prosa dela ──────────────────────────────────────────────────────
    case "headerTitle":
    case "servico":
    case "totalLabel":
    case "budgetNote":
    case "grupoTitulo":
    case "itemRotulo":
    case "itemDesc":
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota":
    case "linhaDeOrcamento":
    case "extraRotulo":
      return true;
  }
}

/**
 * O inglês deste campo, ou `undefined` quando não foi escrito. Espelha o
 * `lerCampo` de `proposal-ortografia.ts`, campo a campo.
 *
 * O `null` de uma posição do `budgetItemsEn` sai como `undefined`: para quem lê
 * são a mesma coisa — «não foi traduzida» —, e é a escrita que precisa de os
 * distinguir (ver {@link escreverEn}).
 */
export function lerEn(doc: Partial<ProposalDoc>, campo: CampoDeTexto): string | undefined {
  switch (campo.tipo) {
    case "ref":
    case "eventType":
      return undefined;
    case "headerTitle":
      return doc.headerTitleEn;
    case "servico":
      return doc.servicoEn;
    case "totalLabel":
      return doc.totalLabelEn;
    case "budgetNote":
      return doc.budgetNoteEn;
    case "grupoTitulo":
      return doc.serviceGroups?.[campo.gi]?.titleEn;
    case "itemRotulo":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.labelEn;
    case "itemDesc":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.descEn;
    case "boardTitulo":
      return doc.moodBoards?.[campo.bi]?.titleEn;
    case "boardSubtitulo":
      return doc.moodBoards?.[campo.bi]?.subtituloEn;
    case "boardNota":
      return doc.moodBoards?.[campo.bi]?.annotationEn;
    case "linhaDeOrcamento":
      return doc.budgetItemsEn?.[campo.i] ?? undefined;
    case "extraRotulo":
      return doc.budgetExtras?.[campo.i]?.labelEn;
  }
}

/**
 * O array paralelo das rubricas inglesas com o tamanho das rubricas, com a
 * posição `i` reescrita.
 *
 * `null` nas posições que ninguém traduziu — e não `""`: é essa diferença que
 * faz a contagem distinguir «esquecida» de «decidida». Um array mais curto do
 * que as rubricas (ou mais comprido, vindo de um documento estragado) é
 * acertado aqui, e não em cada leitor.
 */
function comRubricaInglesa(doc: Partial<ProposalDoc>, i: number, texto: string): (string | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = doc.budgetItemsEn ?? [];
  return Array.from({ length: n }, (_, j) => (j === i ? texto : (guardado[j] ?? null)));
}

/**
 * O mesmo documento com o inglês deste campo reescrito. Espelha o
 * `escreverCampo`, incluindo a disciplina de copiar só o caminho que muda — o
 * resto vem por referência, que é o que mantém as fotos e os arrays paralelos
 * exactamente como estavam.
 *
 * Os campos sem segunda versão devolvem o documento INTACTO: não há sítio onde
 * escrever, e inventar um seria criar uma tradução que nenhuma contagem vê.
 */
export function escreverEn<T extends Partial<ProposalDoc>>(
  doc: T,
  campo: CampoDeTexto,
  texto: string,
): T {
  // A cada escrita do inglês fica registado o português contra o qual ele foi
  // escrito. É o que permite, mais tarde, saber que o português mudou por baixo
  // dele — ver `estadoDoIngles`.
  const comMarca = limpo(texto) ? confirmarTraducao(doc, campo) : doc;
  return escreverInglesNoCampo(comMarca, campo, texto);
}

function escreverInglesNoCampo<T extends Partial<ProposalDoc>>(
  doc: T,
  campo: CampoDeTexto,
  texto: string,
): T {
  switch (campo.tipo) {
    case "ref":
    case "eventType":
      return doc;
    case "headerTitle":
      return { ...doc, headerTitleEn: texto };
    case "servico":
      return { ...doc, servicoEn: texto };
    case "totalLabel":
      return { ...doc, totalLabelEn: texto };
    case "budgetNote":
      return { ...doc, budgetNoteEn: texto };
    case "grupoTitulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi ? { ...g, titleEn: texto } : g,
        ),
      };
    // Cada campo escrito pelo NOME, à letra — sem chaves calculadas. É a mesma
    // regra que `escreverCampo` já segue, e pela mesma razão: uma escrita com
    // chave calculada num objecto vindo de fora é a forma exacta de um defeito
    // que a análise do GitHub procura, e uma defesa que depende de o próximo
    // leitor reparar que o ternário só devolve dois literais perde-se.
    case "itemRotulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, labelEn: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "itemDesc":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, descEn: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "boardTitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, titleEn: texto } : b,
        ),
      };
    case "boardSubtitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, subtituloEn: texto } : b,
        ),
      };
    case "boardNota":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, annotationEn: texto } : b,
        ),
      };
    case "linhaDeOrcamento":
      return { ...doc, budgetItemsEn: comRubricaInglesa(doc, campo.i, texto) };
    case "extraRotulo":
      return {
        ...doc,
        budgetExtras: (doc.budgetExtras ?? []).map((e, i) =>
          i === campo.i ? { ...e, labelEn: texto } : e,
        ),
      };
  }
}

/** Um campo de prosa com as duas versões à mão, como o painel precisa de as
 *  mostrar. O `rotulo` é o mesmo que as Gralhas usam — um nome só por campo. */
export interface CampoBilingue {
  campo: CampoDeTexto;
  /** Como se chama este campo no ecrã, em pt-PT. */
  rotulo: string;
  /** O que está escrito em português. */
  texto: string;
  /** O que está escrito em inglês, se alguma coisa estiver. */
  ingles?: string;
}

/**
 * Os campos deste documento que ganham segunda caixa — o inventário, pela ordem
 * em que aparecem no ecrã.
 *
 * Sai de `camposDoDocumento` e não de uma segunda lista: os campos de prosa que
 * saem impressos são exactamente os que precisam de par. Duas listas
 * divergiriam, e o sintoma seria um campo traduzível que nenhuma contagem via.
 */
export function camposComVersaoInglesa(doc: Partial<ProposalDoc>): CampoBilingue[] {
  const out: CampoBilingue[] = [];
  for (const { campo, rotulo } of camposDoDocumento(doc)) {
    if (!temVersaoInglesa(campo)) continue;
    out.push({ campo, rotulo, texto: "", ingles: lerEn(doc, campo) });
  }
  return out;
}

/** O texto de um campo, sem espaços à volta e sem `undefined`. */
const limpo = (s: string | undefined) => (typeof s === "string" ? s.trim() : "");

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O INGLÊS QUE FICOU PARA TRÁS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para o estúdio: «o serviço "Reunião Inicial" tem como
 * tradução "Ceremony Decor". Alguém traduziu, mudou depois o texto em
 * português, e o inglês ficou desatualizado sem nada avisar».
 *
 * É o defeito mais grave deste ecrã porque produz uma proposta ERRADA que passa
 * em todas as verificações: o campo inglês não está vazio — está errado, e uma
 * contagem de caixas vazias não tem como o ver.
 *
 * E estava escrito, no cabeçalho deste ficheiro, que ele existia: «traduzir,
 * voltar atrás e reescrever o português deixa o inglês desactualizado e
 * continua a não contar, porque está preenchido. Apanhá-lo obrigava a guardar,
 * por campo, o português contra o qual a tradução foi escrita». É exactamente
 * isso que passa a acontecer.
 *
 * ── UMA IMPRESSÃO DIGITAL, E NÃO O TEXTO ────────────────────────────────
 *
 * Guarda-se um número por campo, e não uma segunda cópia do português. O
 * documento viaja inteiro em cada gravação do rascunho — para o `localStorage`
 * e para o servidor, a cada oitocentos milissegundos — e duplicar a prosa toda
 * era duplicar o que se grava, para responder a uma pergunta de sim ou não.
 *
 * Não é uma função de segurança e não precisa de ser: o que se pergunta é «é o
 * mesmo texto?». Duas frases diferentes com o mesmo número dariam um campo dado
 * por fresco estando velho — uma hipótese em quatro mil milhões, contra a
 * certeza de que hoje NENHUM é apanhado.
 */
function marcaDoTexto(s: string): number {
  // FNV-1a de 32 bits. Escolhida por ser curta, determinista e igual nos dois
  // lados da fronteira: isto corre no browser a cada tecla e no servidor a
  // contar o que falta, e as duas contas têm de dar o mesmo número.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A chave por que o português de um campo é registado. */
const chaveDaMarca = (campo: CampoDeTexto) => chaveDoCampo(campo);

/**
 * O estado da versão inglesa de um campo.
 *
 * `nao-se-sabe` é o caso das propostas ANTERIORES a este registo, e é uma
 * resposta a sério: elas têm inglês escrito e nenhuma marca do português contra
 * o qual ele foi escrito. Acusá-las todas de desactualizadas era acender um
 * aviso em cada campo de cada proposta antiga — e um aviso que toca sempre
 * deixa de se ler, incluindo no dia em que está certo.
 */
export type EstadoDoIngles = "sem-portugues" | "por-traduzir" | "desactualizado" | "em-dia";

export function estadoDoIngles(doc: Partial<ProposalDoc>, campo: CampoDeTexto): EstadoDoIngles {
  const pt = limpo(lerCampo(doc, campo));
  if (!pt) return "sem-portugues";
  if (!limpo(lerEn(doc, campo))) return "por-traduzir";
  const registada = doc.traducoesFeitas?.[chaveDaMarca(campo)];
  if (registada === undefined) return "em-dia";
  return registada === marcaDoTexto(pt) ? "em-dia" : "desactualizado";
}

/**
 * O documento com a tradução deste campo DADA POR REVISTA.
 *
 * É o que o botão «já está bem assim» escreve: não muda o inglês, muda o que
 * ele promete — passa a valer para o português que lá está agora.
 */
export function confirmarTraducao<T extends Partial<ProposalDoc>>(doc: T, campo: CampoDeTexto): T {
  const pt = limpo(lerCampo(doc, campo));
  if (!pt) return doc;
  return {
    ...doc,
    traducoesFeitas: { ...(doc.traducoesFeitas ?? {}), [chaveDaMarca(campo)]: marcaDoTexto(pt) },
  };
}

/**
 * Os campos com português escrito e sem inglês — é esta a lista dos avisos, e é
 * a mesma nos três sítios onde o aviso aparece.
 *
 * Um campo por entrada, com o rótulo e o texto português: o painel mostra-o
 * truncado, e sem ele «Serviços · linha 3» não diz nada a quem não tem o
 * documento à frente.
 */
export function camposPorTraduzir(doc: Partial<ProposalDoc>): CampoBilingue[] {
  const out: CampoBilingue[] = [];
  for (const { campo, rotulo } of camposDoDocumento(doc)) {
    if (!temVersaoInglesa(campo)) continue;
    const pt = limpo(lerCampo(doc, campo));
    // Português vazio: o campo não existe neste documento. Não há nada a
    // traduzir, e contá-lo era acender um aviso sobre uma caixa em branco.
    if (!pt) continue;
    if (limpo(lerEn(doc, campo))) continue;
    out.push({ campo, rotulo, texto: pt });
  }
  return out;
}

/**
 * Os campos cuja versão inglesa PRECISA de atenção: os vazios e os que ficaram
 * para trás.
 *
 * ── PORQUE É QUE NÃO SUBSTITUI O `camposPorTraduzir` ────────────────────
 *
 * Porque as duas listas dizem coisas diferentes a quem as lê, e a diferença
 * importa no sítio onde cada uma aparece.
 *
 * A Conferência escreve «N campos não têm versão inglesa e vão sair em
 * português» — e isso é verdade sobre um campo vazio e é FALSO sobre um campo
 * desactualizado, que tem inglês e vai sair em inglês. É outra frase, com outro
 * remédio: o primeiro traduz-se, o segundo relê-se.
 *
 * Quem quer os dois — o botão de traduzir, que preenche vazios e refaz
 * desactualizados, e o contador do índice — pede esta.
 */
export function camposPorRever(
  doc: Partial<ProposalDoc>,
): Array<CampoBilingue & { estado: EstadoDoIngles }> {
  const out: Array<CampoBilingue & { estado: EstadoDoIngles }> = [];
  for (const { campo, rotulo } of camposDoDocumento(doc)) {
    if (!temVersaoInglesa(campo)) continue;
    const estado = estadoDoIngles(doc, campo);
    if (estado !== "por-traduzir" && estado !== "desactualizado") continue;
    out.push({
      campo,
      rotulo,
      texto: limpo(lerCampo(doc, campo)),
      ...(estado === "desactualizado" ? { ingles: lerEn(doc, campo) } : {}),
      estado,
    });
  }
  return out;
}

/**
 * Este documento já tem alguma tradução escrita?
 *
 * É o {@link camposPorTraduzir} ao contrário, e existe porque o estúdio precisa
 * dele para abrir o interruptor «Proposta bilingue» LIGADO quando o documento
 * traz inglês e o `meta` do rascunho não existe — abrir noutro portátil,
 * restaurar do servidor, ou abrir uma proposta copiada de outra. Sem isto, os
 * textos ingleses existiam no documento e o ecrã não os mostrava: invisíveis e
 * editáveis por acidente, que é a pior combinação.
 *
 * Uma função e não duas verdades.
 */
/**
 * Quantas traduções faltam em CADA secção do estúdio.
 *
 * ── Porquê por secção ────────────────────────────────────────────────────
 * O painel «Por traduzir» já lista tudo — mas vive no passo do ENVIO, que é o
 * último sítio onde se olha. A meio de escrever, a pergunta é outra: «desta
 * secção, o que é que ainda falta?». Sem resposta, ou se percorre o documento
 * inteiro à procura de caixas inglesas vazias, ou se vai ao fim e volta.
 *
 * As duas peças já existiam e é só o cruzamento delas: `camposPorTraduzir` diz
 * QUAIS faltam e `seccaoDoCampo` diz ONDE vive cada um — a MESMA função que o
 * salto do painel usa, para o número e o salto nunca poderem discordar.
 *
 * Só entram as secções com contagem: um `0` no índice ao lado de cinco secções
 * seria uma fila de zeros a dizer que não há nada a fazer.
 */
export function porTraduzirPorSeccao(doc: Partial<ProposalDoc>): Record<string, number> {
  const conta: Record<string, number> = {};
  // O `camposPorRever` e não o `camposPorTraduzir`: o contador do índice conta o
  // que ela tem para FAZER na tradução, e um inglês que ficou para trás dá-lhe
  // tanto trabalho como um que falta — mais, até, porque o primeiro não se vê.
  for (const c of camposPorRever(doc)) {
    const seccao = seccaoDoCampo(c.campo);
    conta[seccao] = (conta[seccao] ?? 0) + 1;
  }
  return conta;
}

export function docTemIngles(doc: Partial<ProposalDoc>): boolean {
  // As alternativas contam (A6-011): uma proposta cujo único inglês escrito
  // estava nas escolhas do casal era dada como «sem inglês nenhum».
  const nasAlternativas = (doc.escolhas ?? []).some(
    (e) =>
      limpo(e.tituloEn) !== "" ||
      limpo(e.notaEn) !== "" ||
      (e.opcoes ?? []).some((o) => limpo(o.rotuloEn) !== "" || limpo(o.descricaoEn) !== ""),
  );
  return (
    nasAlternativas ||
    camposDoDocumento(doc).some(
      ({ campo }) => temVersaoInglesa(campo) && limpo(lerEn(doc, campo)) !== "",
    )
  );
}

/**
 * O documento na língua pedida.
 *
 *  - `"pt"`: devolve o MESMO objecto, por referência. Sem cópia, sem nada — o
 *    caminho de 100% das propostas existentes e da esmagadora maioria das novas
 *    não desenha nada de diferente porque não faz nada de novo. Mesma
 *    disciplina de `blocosFixosNaLingua` e de `stripPendingImages`, e é ela que
 *    mantém limpas as comparações por referência de quem grava o rascunho.
 *  - `"en"`: um documento novo em que cada campo com versão inglesa ESCRITA foi
 *    substituído por ela. O que não tem fica em português, sem marca nenhuma.
 *
 * ── O INVARIANTE, E PORQUE É QUE ELE NÃO É UMA ELEGÂNCIA ──────────────────
 *
 * Nunca acrescenta, nunca remove e nunca reordena: só troca strings no sítio.
 * Todos os arrays saem com o mesmo comprimento e a mesma ordem.
 *
 * É o que torna legítimo calcular a ORDEM do documento (`proposal-ordem.ts`,
 * que alinha o orçamento e os mood boards pelos NOMES dos serviços) sobre o
 * documento PORTUGUÊS e aplicar os índices ao inglês. Sem o invariante, as
 * chaves inglesas deixavam de casar com as portuguesas, o «sem correspondência
 * não se mexe» punha o orçamento e os mood boards por outra ordem no PDF
 * inglês — e ninguém via, porque quem confere lê o português. Era exactamente o
 * defeito da proposta da Tara e do Marty, de volta e mudo.
 *
 * A escrita passa toda pelo {@link escreverEn}, que é o mesmo escritor campo a
 * campo do resto da casa: é por construção que nenhum array muda de tamanho.
 */
export function docNaLingua(doc: ProposalDoc, idioma: IdiomaDaProposta): ProposalDoc {
  if (idioma !== "en") return doc;
  let saida = doc;
  for (const { campo } of camposDoDocumento(doc)) {
    if (!temVersaoInglesa(campo)) continue;
    const en = limpo(lerEn(doc, campo));
    // Vazia cai para o português — a regra de desenho, e a única que nunca
    // produz um buraco.
    if (!en) continue;
    // Um campo português vazio não ganha texto por ter tradução: acrescentar
    // aqui um rótulo que o documento não tem era desenhar uma linha que a
    // pré-visualização portuguesa não mostra.
    if (!limpo(lerCampo(doc, campo))) continue;
    saida = escreverCampo(saida, campo, en);
  }
  return saida;
}
