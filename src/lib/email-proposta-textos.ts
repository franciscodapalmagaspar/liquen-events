import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  isoDaDataPorExtenso,
  type IdiomaDaProposta,
} from "./proposal-doc-textos";
import type { Mudanca } from "./orcamento/diferencas";
import type { ProposalMoney } from "./proposal-doc";
import { eurDocumento, montanteNaLingua, round2 } from "./money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO DO EMAIL QUE LEVA A PROPOSTA — NAS DUAS LÍNGUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A proposta podia sair em inglês e o email que a transportava saía sempre em
 * português: o assunto, o «Olá», a frase do anexo, o botão e até o nome do
 * ficheiro. O casal inglês abria uma mensagem que não percebia para chegar a um
 * PDF que percebia. Estas são as frases que faltavam.
 *
 * ── PORQUE É QUE ISTO NÃO ESTÁ NO `proposal-doc-textos` ───────────────────
 *
 * Aquele ficheiro traduz o DOCUMENTO: os títulos das secções, o quadro do
 * orçamento, as condições. Isto é a mensagem que o acompanha, que não aparece
 * em página nenhuma do PDF e muda por razões completamente diferentes (o botão
 * do link, o nome do anexo, a linha de assunto). Duas coisas com ciclos de vida
 * diferentes não partilham ficheiro.
 *
 * ── E PORQUE É QUE NÃO ESTÁ NOS DICIONÁRIOS DO SITE ───────────────────────
 *
 * O `i18n/pt.ts` e o `i18n/en.ts` alimentam PÁGINAS, e há testes que os
 * percorrem inteiros a exigir regras de escrita do site (por exemplo, sem
 * travessões). O assunto deste email tem um travessão desde o primeiro dia e
 * tem de continuar a tê-lo: mudá-lo mudava o email que chega a toda a gente,
 * para satisfazer uma regra que é sobre outra coisa.
 *
 * ── A REGRA DE ESCRITA DO INGLÊS ──────────────────────────────────────────
 *
 * Inglês britânico («personalised»), como o documento — que escreve a validade
 * à maneira britânica, e pela razão que lá está explicada. O nome da casa não
 * se traduz nem se desacentua: é «Líquen Events» nas duas línguas, tal como sai
 * na assinatura e no logótipo.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NOME DO FICHEIRO — QUE É O QUE O CLIENTE ARQUIVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vive aqui — e não em cada rota — porque tem de ser O MESMO em três sítios: o
 * anexo do email, a descarga pelo link do casal e a descarga pelo portal. O
 * casal já tem um ficheiro na caixa de correio; o que descarrega meses depois
 * tem de ser reconhecível como o mesmo documento, e não um segundo ficheiro
 * com outro nome.
 *
 * ── O QUE ESTAVA LÁ ───────────────────────────────────────────────────────
 * A referência INTERNA do pedido: `Proposta-Liquen-8f3c1a2e-….pdf` em
 * produção, onde o identificador é um `randomUUID()`. Do lado do casal, o
 * ficheiro que fica guardado na pasta de transferências e reencaminhado para
 * os pais chama-se por um número que não é de ninguém — e que a rota irmã já
 * tinha decidido não mostrar ao cliente («o `randomUUID()` da nossa base não é
 * referência de ninguém»). O nome do ficheiro tinha ficado de fora dessa
 * decisão.
 *
 * Passa a ser o que o casal reconhece: a casa, o nome deles e a data do
 * evento — `Proposta-Liquen-Events-Maria-e-Ze-12-09-2026.pdf`.
 *
 * ── PORQUE É QUE NÃO LEVA ACENTOS NEM «&» ─────────────────────────────────
 * «Liquen» sem acento é como sempre esteve, e a razão continua de pé: um
 * acento num anexo ainda hoje chega partido a alguns clientes de correio. O
 * mesmo nome viaja também num cabeçalho `Content-Disposition` (é assim que o
 * link do casal e o portal o servem), e por isso fica-se por letras, números e
 * hífenes — «Zé» é «Ze», o «&» é «e». O que se ganha em legibilidade perde-se
 * todo se o ficheiro chegar com o nome partido a meio.
 *
 * ── E QUANDO NÃO HÁ NOME NENHUM ───────────────────────────────────────────
 * Cai na referência, exactamente como antes. Um documento a meio de ser
 * escrito não tem casal nem data, e um ficheiro chamado
 * `Proposta-Liquen-Events-.pdf` era pior do que o identificador.
 */
export interface DadosDoNomeDoFicheiro {
  /** «Maria & Zé», tal como está no documento. */
  clientNames?: string;
  /** «12 de setembro de 2026», tal como o estúdio a escreve. */
  eventDate?: string;
  /** A referência interna — o que fica no nome quando não há casal nenhum. */
  ref: string;
  /**
   * ── O NOME ESCRITO POR ELA, QUANDO O ESCREVE ────────────────────────────
   *
   * Pedido dela: «gostava de poder editar o nome do pdf que vai ser gerado».
   *
   * A composição automática acerta na maioria dos casos e não acerta em todos:
   * duas propostas para o mesmo casal, uma versão para os pais e outra para
   * eles, um nome que ela quer arrumado de outra maneira na pasta. Escrito
   * aqui, manda — e manda em TODOS os sítios, porque é este o único sítio onde
   * o nome se decide (o anexo do email, a descarga do link do casal, o portal e
   * o botão do estúdio).
   *
   * Passa pela MESMA limpeza da composição automática (letras, números e
   * hífenes): o que ela escreve é o nome que quer, e o que sai é um nome que
   * chega inteiro a qualquer cliente de correio. O ecrã mostra-lhe o resultado
   * enquanto escreve, para a limpeza nunca ser uma surpresa.
   *
   * Vazio, ou só com sinais que não sobrevivem à limpeza, vale o mesmo que não
   * ter escrito nada: volta a composição automática. Um ficheiro chamado
   * `-.pdf` era pior do que qualquer nome que se componha.
   */
  escolhido?: string;
}

/**
 * O nome escrito à mão, limpo e sem a extensão. Vazio quando não sobra nada.
 *
 * Tira um `.pdf` escrito no fim — quem escreve o nome de um PDF escreve-lhe a
 * extensão metade das vezes, e `Proposta.pdf.pdf` é o género de detalhe que faz
 * uma funcionalidade nova parecer partida à primeira utilização.
 *
 * O tecto é o mesmo do nome do casal, pela mesma razão: um nome que não cabe na
 * coluna do gestor de ficheiros não serve para arrumar nada.
 */
export function nomeEscolhidoParaFicheiro(
  escrito: unknown,
  idioma: IdiomaDaProposta = "pt",
): string {
  const texto = String(escrito ?? "")
    .trim()
    .replace(/\.pdf$/i, "");
  return paraNomeDeFicheiro(texto, idioma).slice(0, MAX_NOME_ESCOLHIDO).replace(/-+$/, "");
}

/**
 * Quanto do nome escrito à mão cabe.
 *
 * Mais folgado do que o do casal (44) porque aqui não há casa nem data à volta
 * — o que ela escreve é o nome todo. Oitenta caracteres é o que ainda se lê de
 * uma vez num cartão de anexo de telemóvel.
 */
const MAX_NOME_ESCOLHIDO = 80;

/**
 * Letras, números e hífenes, e mais nada — ver o porquê acima.
 *
 * O «&» diz-se na língua do documento: «Anna & John» numa proposta inglesa é
 * `Anna-and-John`, e não `Anna-e-John` (auditoria de 13/11).
 */
function paraNomeDeFicheiro(texto: string, idioma: IdiomaDaProposta = "pt"): string {
  const e = ehIdiomaDaProposta(idioma) && idioma === "en" ? " and " : " e ";
  return (
    texto
      .normalize("NFD")
      // Os diacríticos decompostos («é» → «e» + acento) saem aqui.
      .replace(/[\u0300-\u036f]/g, "")
      // Estes não se decompõem, e sem eles «Nørgaard» ficava «Nrgaard».
      .replace(/[øØ]/g, "o")
      .replace(/[æÆ]/g, "ae")
      .replace(/ß/g, "ss")
      .replace(/&/g, e)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/** «12 de setembro de 2026» → «12-09-2026». Vazio para tudo o resto. */
function dataParaNomeDeFicheiro(texto: string | undefined): string {
  const iso = texto ? isoDaDataPorExtenso(texto) : null;
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}-${mes}-${ano}`;
}

/**
 * Quanto do nome do casal cabe no ficheiro.
 *
 * Quarenta e quatro caracteres. «Maria da Conceição Gonçalves Ançã &
 * Jean-François Ålström-Nørgaard» dá sessenta e seis depois de limpo, e com a
 * casa e a data à volta o ficheiro passava dos noventa — deixa de caber na
 * coluna do gestor de ficheiros, que é exactamente o problema que isto vem
 * resolver. Aos quarenta e quatro sobrevivem os dois primeiros nomes, que é o
 * que se diz ao telefone. Corta-se num hífen, nunca a meio de uma palavra.
 */
const MAX_NOME = 44;

export function nomeDoFicheiroDaProposta(
  dados: DadosDoNomeDoFicheiro,
  idioma: IdiomaDaProposta,
): string {
  // O nome dela primeiro. Não leva prefixo, nem casa, nem data: quem escreve o
  // nome de um ficheiro escreve-o inteiro, e acrescentar-lhe coisas seria
  // desfazer a escolha que este campo existe para permitir.
  const dela = nomeEscolhidoParaFicheiro(dados.escolhido, idioma);
  if (dela) return `${dela}.pdf`;

  const prefixo = ehIdiomaDaProposta(idioma) && idioma === "en" ? "Proposal" : "Proposta";
  const nomes = paraNomeDeFicheiro(dados.clientNames ?? "", idioma);
  if (!nomes) return `${prefixo}-Liquen-${dados.ref}.pdf`;
  const cortado =
    nomes.length <= MAX_NOME
      ? nomes
      : nomes
          .slice(0, MAX_NOME)
          .replace(/-[^-]*$/, "")
          .replace(/-+$/, "");
  const data = dataParaNomeDeFicheiro(dados.eventDate);
  return `${prefixo}-Liquen-Events-${cortado}${data ? `-${data}` : ""}.pdf`;
}

export interface TextosDoEmailDaProposta {
  /** A linha que o cliente lê ANTES de abrir. */
  assunto: string;
  /** O título dentro do corpo (o `<h2>`). */
  titulo: string;
  /** O cumprimento, sem o nome («Olá», «Hello»). */
  ola: string;
  /** A frase que explica o anexo e o botão (versão HTML, com a menção ao botão). */
  intro: string;
  /** A mesma frase para quem lê em texto simples, onde não há botão nenhum. */
  introEmTexto: string;
  /** O texto do botão. */
  botao: string;
  /** O que precede o endereço na versão em texto simples. */
  verOnline: string;
  /** O nome do PDF em anexo — ver {@link nomeDoFicheiroDaProposta}. */
  nomeDoAnexo: (dados: DadosDoNomeDoFicheiro) => string;
  /**
   * A etiqueta do cartão que põe o PDF à vista DENTRO do corpo.
   *
   * O ficheiro segue em anexo, mas quem decide onde o anexo aparece é o leitor
   * de correio: no Gmail do telemóvel cai depois da assinatura e do banner, e
   * é preciso rolar a mensagem inteira para dar com ele.
   */
  anexoEtiqueta: string;
  /** O botão desse cartão. */
  anexoBotao: string;
}

const PT: TextosDoEmailDaProposta = {
  assunto: "A vossa proposta — Líquen Events",
  titulo: "A vossa proposta — Líquen Events",
  ola: "Olá",
  intro:
    "Segue em anexo a proposta que preparámos para o vosso dia. Podem vê-la e responder online no botão abaixo.",
  introEmTexto: "Segue em anexo a proposta que preparámos para o vosso dia.",
  botao: "Ver a proposta →",
  verOnline: "Ver online:",
  nomeDoAnexo: (dados) => nomeDoFicheiroDaProposta(dados, "pt"),
  anexoEtiqueta: "Proposta em PDF",
  anexoBotao: "Descarregar a proposta em PDF →",
};

const EN: TextosDoEmailDaProposta = {
  assunto: "Proposal for your event — Líquen Events",
  titulo: "Your proposal — Líquen Events",
  ola: "Hello",
  intro:
    "Please find attached the proposal we have prepared for your event. You can also view it and reply online using the button below.",
  introEmTexto: "Please find attached the proposal we have prepared for your event.",
  botao: "View the proposal →",
  verOnline: "View online:",
  /**
   * O nome do ficheiro também muda. Não é um enfeite: ela gera as duas versões
   * da mesma proposta (a portuguesa para os pais, a inglesa para o casal), e com
   * o mesmo nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de
   * transferências de quem as receba.
   */
  nomeDoAnexo: (dados) => nomeDoFicheiroDaProposta(dados, "en"),
  anexoEtiqueta: "Proposal PDF",
  anexoBotao: "Download the proposal (PDF) →",
};

/**
 * As frases do email desta proposta.
 *
 * O que não for uma língua conhecida cai no português — a mesma escolha que a
 * rota e o gerador do documento já fazem. Quem chama resolve a língua com o
 * `idiomaDaProposta`, portanto isto é defesa em profundidade: esta folha nunca
 * pode devolver `undefined` e fazer sair um email com buracos onde deviam estar
 * o assunto e o botão.
 */
export function textosDoEmailDaProposta(
  idioma: IdiomaDaProposta,
  casamento = true,
): TextosDoEmailDaProposta {
  const escolhida = ehIdiomaDaProposta(idioma) ? idioma : IDIOMA_POR_OMISSAO;
  if (escolhida === "en") return EN;
  // «O vosso dia» é de um casamento. Num restaurante, numa empresa, numa festa,
  // é «o vosso evento» — que é o que o inglês sempre disse.
  if (casamento) return PT;
  return {
    ...PT,
    intro: PT.intro.replace("o vosso dia", "o vosso evento"),
    introEmTexto: PT.introEmTexto.replace("o vosso dia", "o vosso evento"),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   O RESUMO PARA COLAR NO WHATSAPP
   ═══════════════════════════════════════════════════════════════════════════

   Toda a comunicação saía por email, e quando o casal prefere WhatsApp — o que
   em Portugal é a norma, não a excepção — ela reescrevia à mão o que já está
   no documento: o nome do casal, a data, o valor. Isto é só as PALAVRAS FIXAS
   à volta desses números; os números em si (o `aPagar`) vêm de
   `totaisDaProposta`, no estúdio, para nunca haver uma segunda conta.

   O nome do casal e a data do evento não se traduzem — são texto dela, como em
   todo o resto do documento (ver `proposal-doc-textos.ts`). Só os RÓTULOS
   mudam de língua. */

/** Os rótulos do resumo, para colar tal como estão. */
const RESUMO_PT = {
  titulo: "Proposta Líquen Events, ",
  data: "Data do evento",
  valor: "Valor a pagar",
  link: "Proposta",
  semData: "por marcar",
};

const RESUMO_EN = {
  titulo: "Líquen Events proposal, ",
  data: "Event date",
  valor: "Amount to pay",
  link: "Proposal",
  semData: "to be confirmed",
};

/** O que o resumo precisa de saber, já calculado por quem chama. */
export interface DadosDoResumoDaProposta {
  /** O nome do casal, tal como está escrito no documento. */
  clientNames: string;
  /** A data do evento, tal como está escrita no documento (texto dela, não se
   *  traduz). */
  eventDate: string;
  /** O valor a pagar, já formatado — sai de `totaisDaProposta(doc,
   *  pctSinal).aPagar`, nunca de uma segunda conta feita aqui. */
  aPagar: string;
  /**
   * O link de aceitação da proposta, só quando ela já foi enviada e tem um
   * token válido. `undefined` (ou vazio) tira a linha do resumo em vez de
   * deixar um link partido — um link que não abre é pior do que não haver
   * nenhum, porque parece que a proposta desapareceu.
   */
  link?: string;
}

/**
 * As três ou quatro linhas prontas a colar no WhatsApp: o nome do casal, a
 * data, o valor a pagar, e o link, quando existe.
 */
export function resumoDaPropostaParaCopiar(
  dados: DadosDoResumoDaProposta,
  idioma: IdiomaDaProposta,
): string {
  const t = ehIdiomaDaProposta(idioma) && idioma === "en" ? RESUMO_EN : RESUMO_PT;
  const nome = dados.clientNames.trim();
  // Sem nome (não devia acontecer: o envio exige `clientNames`), a linha fica
  // só com "Proposta Líquen Events" em vez de terminar numa vírgula a apontar
  // para nada.
  const linhas = [
    nome ? `${t.titulo}${nome}` : t.titulo.replace(/,\s*$/, ""),
    `${t.data}: ${dados.eventDate.trim() || t.semData}`,
    `${t.valor}: ${dados.aPagar}`,
  ];
  if (dados.link?.trim()) linhas.push(`${t.link}: ${dados.link.trim()}`);
  return linhas.join("\n");
}

/* ═══════════════════════════════════════════════════════════════════════════
   O PARÁGRAFO DO QUE MUDOU, PARA O EMAIL DA REVISÃO
   ═══════════════════════════════════════════════════════════════════════════

   Uma proposta muda três vezes antes de fechar, e o email que a leva era
   sempre o mesmo texto fixo — ela reescrevia de cabeça o que o painel Versões
   já sabe, ou mandava sem dizer nada e deixava o casal a comparar dois PDFs.

   Isto NÃO lista os itens um a um. Um nome de serviço («Arranjos de Mesa») é
   texto dela, escrito numa língua só (`budgetItems` não tem segunda versão
   inglesa — ver `proposal-doc-bilingue.ts`), e citá-lo dentro de um parágrafo
   inglês misturava as duas línguas no meio da frase. O que se diz é a
   CATEGORIA do que mudou («o orçamento», «os serviços») — sempre traduzível,
   nunca errado — e o número que interessa mais: o total. O resto (que serviço
   exactamente, que foto) está no PDF em anexo e na lista "Ver o que mudou" do
   painel Versões, que ela pode copiar à mão para aqui se quiser ser mais
   específica.

   NASCE EDITÁVEL e nunca se envia sozinho: isto devolve TEXTO, para entrar na
   caixa "Mensagem para o cliente" do estúdio — a mesma porta por onde as
   sugestões da Ortografia (`Gralhas.tsx`) já entram nesta casa. Quem decide se
   fica, se se apaga ou se se reescreve é ela, com o dedo no botão Enviar.

   ── O DINHEIRO ─────────────────────────────────────────────────────────────
   Os dois montantes vêm de `dinheiroDaProposta` (nunca `resolveProposalMoney`)
   — a mesma correcção que `diferencas.ts` levou hoje pela mesma razão: ligar
   ou desligar "os adicionais somam ao total" muda o que o casal paga sem
   tocar no `totalAmount` escrito. Comparar o valor errado dizia "nada mudou no
   total" a uma revisão que subia milhares de euros. */

/** As categorias que interessam a um casal, e as duas línguas em que se dizem.
 *  Fora, de propósito: "Total" (tem a sua própria frase, com os números) e
 *  qualquer `onde` que uma versão futura de `diferencas.ts` venha a
 *  acrescentar sem se registar aqui — cai fora do parágrafo em vez de aparecer
 *  como categoria desconhecida. */
const CATEGORIAS_DO_PARAGRAFO: Record<string, { pt: string; en: string }> = {
  Orçamento: { pt: "o orçamento", en: "the budget" },
  Serviços: { pt: "os serviços", en: "the services" },
  "Mood boards": { pt: "os mood boards", en: "the mood boards" },
  Capas: { pt: "as fotos de capa", en: "the cover photos" },
  Condições: { pt: "as condições", en: "the terms" },
  Evento: { pt: "os dados do evento", en: "the event details" },
};

/** "a, b e c" / "a, b and c" — a lista tal como se lê numa frase. */
function juntarLista(partes: string[], idioma: "pt" | "en"): string {
  if (partes.length <= 1) return partes[0] ?? "";
  const ultima = partes.at(-1);
  const resto = partes.slice(0, -1).join(", ");
  return `${resto} ${idioma === "en" ? "and" : "e"} ${ultima}`;
}

/**
 * O parágrafo do que mudou desde a última proposta enviada, nas duas línguas,
 * ou `null` quando não há nada que valha a pena dizer.
 *
 * `null` acontece em dois casos: a primeira versão (`mudancas` vazio, não há
 * "última" com quem comparar) e uma revisão cuja única mudança seja algo que
 * este parágrafo não sabe dizer sem inventar (por exemplo, só o MODO de IVA
 * mudou, e o casal continua a pagar exactamente o mesmo). Nenhum dos dois é um
 * erro — é este ficheiro a preferir calar-se a arriscar uma frase errada.
 */
export function paragrafoDoQueMudou(
  mudancas: Mudanca[],
  dinheiro: { antes: ProposalMoney; depois: ProposalMoney },
  idioma: IdiomaDaProposta,
): string | null {
  if (mudancas.length === 0) return null;
  const lingua = ehIdiomaDaProposta(idioma) && idioma === "en" ? "en" : "pt";

  // As categorias tocadas, pela ordem em que `diferencas` as produz (o
  // dinheiro primeiro, o resto depois) — é a mesma ordem "da conversa" que o
  // cabeçalho de `diferencas.ts` explica.
  const categorias: string[] = [];
  for (const m of mudancas) {
    if (m.onde === "Total" || !CATEGORIAS_DO_PARAGRAFO[m.onde]) continue;
    if (!categorias.includes(m.onde)) categorias.push(m.onde);
  }

  const diferenca = round2(dinheiro.depois.gross - dinheiro.antes.gross);
  const totalMudou = Math.abs(diferenca) > 0.01;

  const frases: string[] = [];
  if (categorias.length > 0) {
    const nomes = juntarLista(
      categorias.map((c) => CATEGORIAS_DO_PARAGRAFO[c][lingua]),
      lingua,
    );
    frases.push(
      lingua === "en" ? `there were changes to ${nomes}` : `houve alterações em ${nomes}`,
    );
  }
  if (totalMudou) {
    // `montanteNaLingua` para escrever a inglesa em inglês, como o PDF já
    // escreve o resto do dinheiro do documento (ver `money.ts`).
    const antes = montanteNaLingua(eurDocumento(dinheiro.antes.gross), lingua);
    const depois = montanteNaLingua(eurDocumento(dinheiro.depois.gross), lingua);
    frases.push(
      lingua === "en"
        ? `the total went from ${antes} to ${depois}`
        : `o total passou de ${antes} para ${depois}`,
    );
  }
  if (frases.length === 0) return null;

  const abre = lingua === "en" ? "Since the last proposal" : "Desde a última proposta";
  return `${abre}: ${frases.join("; ")}.`;
}
