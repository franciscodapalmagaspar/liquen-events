import {
  COVER_SLOTS,
  DEFAULT_VALID_DAYS,
  depositPercentOf,
  type ProposalDoc,
} from "@/lib/proposal-doc";
import { dinheiroDaProposta, precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE MUDOU DE UMA VERSÃO PARA A OUTRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma negociação de casamento tem três ou quatro rondas. Ao fim da terceira,
 * a pergunta que se faz ao telefone é sempre a mesma — "o que é que mudou desde
 * a que vos mandei?" — e a resposta hoje é abrir as duas e comparar de olho.
 *
 * ── EM PORTUGUÊS, NÃO EM CAMPOS ────────────────────────────────────────────
 * Isto não é um `diff` de JSON. Um "budgetAmounts[3]: 800 → 950" é verdade e
 * não serve para nada ao telefone. O que sai daqui são frases: "Arranjos de
 * mesa passou de 800 € para 950 €", "saiu a linha Wedding Coordinator".
 *
 * ── SÓ O QUE O CLIENTE VÊ, MAIS O DINHEIRO ─────────────────────────────────
 * Não se comparam custos nem notas internas: mudaram, mas não são o que ela
 * precisa de explicar. Compara-se o que muda a proposta aos olhos de quem a
 * recebeu — os serviços, as linhas do orçamento, o total, a validade — e o
 * dinheiro, que é o que a conversa é.
 *
 * ── O QUE ISTO NÃO COMPARAVA, E CUSTOU ─────────────────────────────────────
 * Comparava quatro coisas: o `totalAmount`, as linhas do orçamento, os títulos
 * dos grupos e quatro campos do evento. Tudo o resto passava calado. O
 * percurso real: ela troca as três fotos do mood board e as duas de capa,
 * acrescenta «Wedding Coordinator 1.500 €», baixa a validade de 30 para 5 dias
 * e o sinal de 30% para 50% — e o painel Versões dizia, a verde, «Esta versão
 * está igual à última enviada». Um painel que diz que nada mudou quando mudou
 * tudo é pior do que não existir: ela deixa de abrir as duas para comparar
 * porque já tem quem lhe diga, e o que lhe dizem é falso.
 *
 * Passam por aqui, agora: as fotos (mood boards e capas), os valores
 * adicionais, a validade, a percentagem do sinal e os textos das condições.
 * Continuam de fora, e de propósito: os custos e as notas internas (não são o
 * que se explica ao telefone), e os `budgetAmounts` de linhas em branco.
 *
 * ── O TOTAL COMPARA-SE PELO BRUTO ──────────────────────────────────────────
 * O `totalAmount` cru não é comparável entre versões: em modo "acrescer" é a
 * base e em "incluído" é o bruto. O estúdio guarda SEMPRE a mesma base ao
 * trocar de modo, portanto trocar só o modo — em que o cliente paga
 * exactamente o mesmo — produzia «O total passou de 10.000,00 € para
 * 12.300,00 €». O que se compara é o que o cliente paga.
 */

export type TipoDeMudanca = "acrescentado" | "removido" | "alterado";

export interface Mudanca {
  /** Onde: "Orçamento", "Serviços", "Evento", "Total". */
  onde: string;
  tipo: TipoDeMudanca;
  /** A frase, já pronta para se ler. */
  texto: string;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Compara nomes ignorando acentos, maiúsculas e espaços a mais. */
function mesmo(a: string, b: string): boolean {
  const n = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

/** As linhas do orçamento com o preço ao lado, indexadas pelo nome. */
function linhasPorNome(doc: ProposalDoc): Map<string, { nome: string; preco: number | null }> {
  const precos = precosDe(doc);
  const mapa = new Map<string, { nome: string; preco: number | null }>();
  (doc.budgetItems ?? []).forEach((item, i) => {
    const nome = texto(item);
    if (!nome) return;
    // Uma linha repetida conta uma vez: comparar duplicados por nome daria
    // "acrescentado" e "removido" para a mesma coisa.
    if (!mapa.has(nome.toLowerCase())) mapa.set(nome.toLowerCase(), { nome, preco: precos[i] });
  });
  return mapa;
}

/** Os títulos dos grupos de serviços, para ver o que entrou e saiu. */
function gruposDe(doc: ProposalDoc): string[] {
  return (doc.serviceGroups ?? []).map((g) => texto(g.title)).filter(Boolean);
}

/** "3 fotos" / "1 foto" — o plural certo, que é o que faz uma frase ser lida. */
function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

/** O que entrou e o que saiu entre duas listas, comparadas como conjuntos. */
function entrouEsaiu(antes: readonly string[], depois: readonly string[]) {
  const a = new Set(antes);
  const b = new Set(depois);
  return {
    entraram: [...b].filter((x) => !a.has(x)),
    sairam: [...a].filter((x) => !b.has(x)),
  };
}

/**
 * Os mood boards indexados pelo título.
 *
 * Pelo título e não pela posição: arrastar um board para cima não é uma
 * alteração de conteúdo, e comparar por posição anunciava as duas trocas.
 * Um board sem título nenhum cai para a posição, que é o único nome que tem.
 */
function boardsPorNome(doc: ProposalDoc) {
  const mapa = new Map<string, { nome: string; images: string[]; annotation: string }>();
  (doc.moodBoards ?? []).forEach((b, i) => {
    const nome = texto(b.title);
    const chave = (nome || `#${i + 1}`).toLowerCase();
    if (mapa.has(chave)) return;
    mapa.set(chave, {
      nome: nome || `mood board ${i + 1}`,
      images: (b.images ?? []).filter((x) => typeof x === "string" && x !== ""),
      annotation: texto(b.annotation),
    });
  });
  return mapa;
}

/** Os valores adicionais indexados pelo rótulo (o `valueText` é texto livre). */
function extrasPorNome(doc: ProposalDoc) {
  const mapa = new Map<string, { nome: string; valor: string }>();
  for (const e of doc.budgetExtras ?? []) {
    const nome = texto(e.label);
    if (!nome || mapa.has(nome.toLowerCase())) continue;
    mapa.set(nome.toLowerCase(), { nome, valor: texto(e.valueText) });
  }
  return mapa;
}

/**
 * A validade, dita como ela a escreveu.
 *
 * Uma data explícita ganha aos dias — é a regra de `resolveValidUntil`, e
 * dizer aqui outra coisa punha o painel a discordar do PDF.
 */
function validadeDe(doc: ProposalDoc): { chave: string; frase: string } {
  const data = texto(doc.validUntil);
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return { chave: `data:${data}`, frase: data };
  const dias =
    typeof doc.validUntilDays === "number" && doc.validUntilDays > 0
      ? Math.floor(doc.validUntilDays)
      : DEFAULT_VALID_DAYS;
  return { chave: `dias:${dias}`, frase: `${dias} dias` };
}

/**
 * Os blocos de texto fixo, com o nome por que ela lhes chama no estúdio.
 *
 * São listas de frases inteiras. Comparar frase a frase e citá-las na íntegra
 * encheria o painel com parágrafos de condições gerais por cima do que
 * interessa — por isso o que sai daqui é quantos pontos entraram e saíram.
 */
const BLOCOS: [keyof ProposalDoc, string][] = [
  ["notasImportantes", "as Notas Importantes"],
  ["incluido", "o «Incluído na proposta»"],
  ["naoIncluido", "o «Não incluído»"],
  ["condicoesGerais", "as Condições Gerais"],
  ["observacoesGerais", "as Observações Gerais"],
  ["faseamento", "o Faseamento do Pagamento"],
  ["cancelamento", "o Cancelamento"],
];

/**
 * O que mudou entre duas versões, em frases.
 *
 * A ordem é a da conversa: primeiro o dinheiro (é o que ele vai perguntar),
 * depois as linhas do orçamento, depois os serviços, e por fim o evento.
 */
export function diferencas(antes: ProposalDoc, depois: ProposalDoc): Mudanca[] {
  const m: Mudanca[] = [];

  // ── O total ─────────────────────────────────────────────────────────────
  // Pelo BRUTO: é o que o cliente paga, e é o único número comparável quando
  // as duas versões não estão no mesmo modo de IVA (ver o cabeçalho).
  // `dinheiroDaProposta` e não `resolveProposalMoney`: ligar ou desligar «os
  // adicionais somam ao valor escrito» muda o que o casal paga sem tocar no
  // `totalAmount`. Com a leitura crua, uma revisão que subia 1.906,50 € era
  // resumida como «nada mudou no total» a quem a estava a rever.
  const dinheiroAntes = dinheiroDaProposta(antes);
  const dinheiroDepois = dinheiroDaProposta(depois);
  if (Math.abs(dinheiroAntes.gross - dinheiroDepois.gross) > 0.01) {
    m.push({
      onde: "Total",
      tipo: "alterado",
      texto: `O total passou de ${eur(dinheiroAntes.gross)} para ${eur(dinheiroDepois.gross)}`,
    });
  } else if (dinheiroAntes.mode !== dinheiroDepois.mode) {
    // O cliente paga o mesmo, mas o PDF passou a dizê-lo de outra maneira —
    // e é a folha que ele tem em mãos. Calar isto era voltar a dizer "está
    // igual à última enviada" a uma versão que não está.
    m.push({
      onde: "Total",
      tipo: "alterado",
      texto:
        dinheiroDepois.mode === "incluido"
          ? "O total passou a ser apresentado com o IVA incluído (o cliente paga o mesmo)"
          : "O total passou a ser apresentado com o IVA à parte (o cliente paga o mesmo)",
    });
  }

  // ── As linhas do orçamento ──────────────────────────────────────────────
  const linhasAntes = linhasPorNome(antes);
  const linhasDepois = linhasPorNome(depois);

  for (const [chave, l] of linhasDepois) {
    const anterior = linhasAntes.get(chave);
    if (!anterior) {
      m.push({
        onde: "Orçamento",
        tipo: "acrescentado",
        texto: l.preco === null ? `Entrou "${l.nome}"` : `Entrou "${l.nome}" por ${eur(l.preco)}`,
      });
    } else if (anterior.preco !== l.preco) {
      // Um preço que aparece ou desaparece não é o mesmo que um preço que muda,
      // e ao telefone essa diferença nota-se.
      if (anterior.preco === null) {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" passou a ter preço: ${eur(l.preco ?? 0)}`,
        });
      } else if (l.preco === null) {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" ficou sem preço (estava ${eur(anterior.preco)})`,
        });
      } else {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" passou de ${eur(anterior.preco)} para ${eur(l.preco)}`,
        });
      }
    }
  }
  for (const [chave, l] of linhasAntes) {
    if (!linhasDepois.has(chave)) {
      m.push({ onde: "Orçamento", tipo: "removido", texto: `Saiu "${l.nome}"` });
    }
  }

  // ── Os valores adicionais ───────────────────────────────────────────────
  // O `valueText` é texto livre ("896,00 €", "895,00 € + IVA", "a definir"),
  // por isso cita-se tal como ela o escreveu em vez de o passar por um
  // formatador que lhe deitaria fora o "+ IVA".
  const exAntes = extrasPorNome(antes);
  const exDepois = extrasPorNome(depois);
  for (const [chave, e] of exDepois) {
    const anterior = exAntes.get(chave);
    if (!anterior) {
      m.push({
        onde: "Orçamento",
        tipo: "acrescentado",
        texto: e.valor
          ? `Entrou o valor adicional "${e.nome}" (${e.valor})`
          : `Entrou o valor adicional "${e.nome}"`,
      });
    } else if (anterior.valor !== e.valor) {
      m.push({
        onde: "Orçamento",
        tipo: "alterado",
        texto: `O valor adicional "${e.nome}" passou de "${anterior.valor}" para "${e.valor}"`,
      });
    }
  }
  for (const [chave, e] of exAntes) {
    if (!exDepois.has(chave)) {
      m.push({
        onde: "Orçamento",
        tipo: "removido",
        texto: `Saiu o valor adicional "${e.nome}"`,
      });
    }
  }

  // ── A validade e o sinal ────────────────────────────────────────────────
  // São as duas condições comerciais que se negoceiam ao telefone, e as duas
  // que ela mexe entre rondas: "dou-vos cinco dias" e "o sinal sobe para 50%".
  const vAntes = validadeDe(antes);
  const vDepois = validadeDe(depois);
  if (vAntes.chave !== vDepois.chave) {
    // "de 30 para 5 dias", e não "de 30 dias para 5 dias": quando as duas são
    // contagens de dias a palavra chega uma vez. Com uma data pelo meio já não
    // dá, e aí vale cada uma por extenso.
    const ambasEmDias = vAntes.chave.startsWith("dias:") && vDepois.chave.startsWith("dias:");
    m.push({
      onde: "Condições",
      tipo: "alterado",
      texto: ambasEmDias
        ? `A validade passou de ${vAntes.frase.replace(" dias", "")} para ${vDepois.frase}`
        : `A validade passou de ${vAntes.frase} para ${vDepois.frase}`,
    });
  }
  // `depositPercentOf` e não o campo cru: um documento antigo não tem
  // percentagem nenhuma escrita e vale a da casa. Comparar os campos crus
  // anunciava «o sinal passou de nada para 30%» a quem não mexeu em nada.
  const sinalAntes = depositPercentOf(antes);
  const sinalDepois = depositPercentOf(depois);
  if (sinalAntes !== sinalDepois) {
    m.push({
      onde: "Condições",
      tipo: "alterado",
      texto: `O sinal passou de ${sinalAntes}% para ${sinalDepois}%`,
    });
  }

  // ── Os grupos de serviços ───────────────────────────────────────────────
  const gAntes = gruposDe(antes);
  const gDepois = gruposDe(depois);
  for (const g of gDepois) {
    if (!gAntes.some((x) => mesmo(x, g))) {
      m.push({ onde: "Serviços", tipo: "acrescentado", texto: `Entrou o grupo "${g}"` });
    }
  }
  for (const g of gAntes) {
    if (!gDepois.some((x) => mesmo(x, g))) {
      m.push({ onde: "Serviços", tipo: "removido", texto: `Saiu o grupo "${g}"` });
    }
  }

  // ── As fotos dos mood boards ────────────────────────────────────────────
  // As fotos SÃO a proposta de decoração — é por elas que o casal decide. Não
  // se comparavam de todo, e trocar as três fotos de um mood board dava «Esta
  // versão está igual à última enviada». Contam-se, não se listam: um caminho
  // de ficheiro não diz nada a ninguém ao telefone.
  const bAntes = boardsPorNome(antes);
  const bDepois = boardsPorNome(depois);
  for (const [chave, b] of bDepois) {
    const anterior = bAntes.get(chave);
    if (!anterior) {
      m.push({
        onde: "Mood boards",
        tipo: "acrescentado",
        texto:
          b.images.length > 0
            ? `Entrou o mood board "${b.nome}" com ${plural(b.images.length, "foto", "fotos")}`
            : `Entrou o mood board "${b.nome}"`,
      });
      continue;
    }
    const { entraram, sairam } = entrouEsaiu(anterior.images, b.images);
    if (entraram.length > 0 || sairam.length > 0) {
      const partes: string[] = [];
      if (sairam.length > 0) partes.push(`${plural(sairam.length, "foto saiu", "fotos saíram")}`);
      if (entraram.length > 0) {
        partes.push(`${plural(entraram.length, "foto entrou", "fotos entraram")}`);
      }
      m.push({
        onde: "Mood boards",
        tipo: "alterado",
        texto: `As fotos do mood board "${b.nome}" mudaram: ${partes.join(", ")}`,
      });
    }
    if (anterior.annotation !== b.annotation) {
      m.push({
        onde: "Mood boards",
        tipo: "alterado",
        texto: `A descrição do mood board "${b.nome}" mudou`,
      });
    }
  }
  for (const [chave, b] of bAntes) {
    if (!bDepois.has(chave)) {
      m.push({ onde: "Mood boards", tipo: "removido", texto: `Saiu o mood board "${b.nome}"` });
    }
  }

  // ── As fotos de capa ────────────────────────────────────────────────────
  // A POSIÇÃO é que decide o lado onde a foto é impressa (ver
  // `normaliseCoverImages`), por isso diz-se de que lado — "trocaram as fotos
  // de capa" obrigava a abrir as duas versões para descobrir qual.
  const LADO = ["esquerda", "direita"];
  for (let i = 0; i < COVER_SLOTS; i++) {
    const a = texto((antes.coverImages ?? [])[i]);
    const b = texto((depois.coverImages ?? [])[i]);
    if (a === b) continue;
    m.push({
      onde: "Capas",
      tipo: !a ? "acrescentado" : !b ? "removido" : "alterado",
      texto: !a
        ? `Entrou a foto de capa da ${LADO[i]}`
        : !b
          ? `Saiu a foto de capa da ${LADO[i]}`
          : `A foto de capa da ${LADO[i]} mudou`,
    });
  }

  // ── Os textos das condições ─────────────────────────────────────────────
  // Quantos pontos entraram e saíram, não os pontos em si: uma condição geral
  // é um parágrafo, e citá-los enchia o painel por cima do que interessa.
  for (const [campo, comoSeChama] of BLOCOS) {
    const a = (antes[campo] as string[] | undefined) ?? [];
    const b = (depois[campo] as string[] | undefined) ?? [];
    // Um documento antigo pode não ter o bloco de todo; ganhá-lo por omissão
    // não é uma alteração que alguém tenha feito.
    if (a.length === 0 && b.length === 0) continue;
    const { entraram, sairam } = entrouEsaiu(a.map(texto), b.map(texto));
    if (entraram.length === 0 && sairam.length === 0) continue;
    const partes: string[] = [];
    if (sairam.length > 0) partes.push(`${plural(sairam.length, "ponto saiu", "pontos saíram")}`);
    if (entraram.length > 0) {
      partes.push(`${plural(entraram.length, "ponto entrou", "pontos entraram")}`);
    }
    m.push({
      onde: "Condições",
      tipo: "alterado",
      texto: `Mudaram ${comoSeChama}: ${partes.join(", ")}`,
    });
  }
  if (texto(antes.budgetNote) !== texto(depois.budgetNote)) {
    m.push({ onde: "Condições", tipo: "alterado", texto: "A nota do orçamento mudou" });
  }

  // ── O evento ────────────────────────────────────────────────────────────
  const campos: [keyof ProposalDoc, string][] = [
    ["eventDate", "A data"],
    ["location", "O local"],
    ["guests", "O número de convidados"],
    ["clientNames", "O nome dos clientes"],
  ];
  for (const [campo, comoSeChama] of campos) {
    const a = texto(antes[campo]);
    const b = texto(depois[campo]);
    if (a !== b && (a || b)) {
      m.push({
        onde: "Evento",
        tipo: "alterado",
        texto: !a
          ? `${comoSeChama} passou a ser "${b}"`
          : !b
            ? `${comoSeChama} ficou por preencher (era "${a}")`
            : `${comoSeChama} passou de "${a}" para "${b}"`,
      });
    }
  }

  return m;
}

/** Uma frase única para a lista de versões ("3 alterações no orçamento"). */
export function resumo(mudancas: Mudanca[]): string {
  if (mudancas.length === 0) return "Sem alterações";
  const total = mudancas.find((x) => x.onde === "Total");
  if (total) return total.texto;
  const n = mudancas.length;
  return n === 1 ? mudancas[0].texto : `${n} alterações`;
}
