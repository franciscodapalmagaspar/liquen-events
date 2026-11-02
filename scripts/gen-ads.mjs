/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GERA OS CSV DE IMPORTAÇÃO PARA O GOOGLE ADS EDITOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/gen-ads.mjs [orçamento MENSAL em euros] [fase 1|2|3]
 *
 * O orçamento é MENSAL porque é assim que ela pensa no dinheiro e é assim que a
 * fatura chega. O gerador converte para euros/dia, que é o que a Google recebe.
 *
 * O número de campanhas NÃO é escolhido aqui: é o orçamento que o decide (ver
 * `campanhasQueCabem`). Com 50 €/mês sai UMA campanha. Não é uma limitação do
 * gerador — é a aritmética de quantos cliques são precisos para se poder
 * concluir alguma coisa.
 *
 * Escreve /ads-output/csv/*.csv a partir de src/lib/ads/campanhas.ts, que por
 * sua vez deriva de src/lib/ads/polos.ts — o mesmo ficheiro que gera as landing
 * pages. É por isso que um anúncio nunca pode apontar para uma página que não
 * existe: o URL final é derivado do slug que gera a página.
 *
 * ── PORQUÊ FICHEIROS SEPARADOS ─────────────────────────────────────────────
 * O Ads Editor aceita um CSV único com todas as entidades misturadas, mas isso
 * é uma péssima ideia na prática: quando UMA linha está mal, o Editor recusa o
 * lote todo e não diz qual. Com ficheiros separados por entidade, importa-se
 * por ordem (campanhas → grupos → keywords → anúncios → negativas) e um erro
 * fica confinado ao ficheiro onde está.
 *
 * ── ORDEM DE IMPORTAÇÃO (obrigatória) ──────────────────────────────────────
 *   1. 1-campanhas.csv
 *   2. 2-grupos.csv
 *   3. 3-keywords.csv
 *   4. 4-anuncios.csv
 *   5. 5-negativas.csv
 *   6. 6-sitelinks.csv
 * Um grupo não pode ser criado antes da campanha dele. O Editor não reordena.
 *
 * ── UMA ADVERTÊNCIA HONESTA SOBRE OS CABEÇALHOS ────────────────────────────
 * Os nomes das colunas do Ads Editor dependem do IDIOMA em que a aplicação
 * está. Estes ficheiros usam os cabeçalhos ingleses, que são os que o Editor
 * aceita em qualquer instalação desde que a importação seja feita com o Editor
 * em inglês (Tools → Settings → Language). Se o teu Editor estiver em
 * português, ou mudas o idioma antes de importar, ou o Editor vai pedir para
 * mapear as colunas à mão — funciona na mesma, dá é mais trabalho.
 *
 * ── O QUE ESTE GERADOR NÃO PODE FAZER ──────────────────────────────────────
 * As localizações vão por NOME e não por ID de critério. Os IDs canónicos da
 * Google publicam-se num CSV em developers.google.com que este ambiente não
 * consegue descarregar, e inventar IDs seria pior do que não os pôr: um ID
 * errado segmenta silenciosamente a região errada. O Editor resolve os nomes
 * ao importar e assinala os ambíguos, o que é o comportamento seguro.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";

const RAIZ = process.cwd();
const SAIDA = path.join(RAIZ, "ads-output", "csv");

// Os módulos das campanhas e das negativas são TypeScript, e são os MESMOS que
// geram as landing pages. Em vez de duplicar a estrutura aqui — que é como as
// duas versões se separam ao fim de um mês e o anúncio passa a apontar para uma
// página que já não existe — carregam-se ao vivo com o jiti, que resolve o
// TypeScript e o atalho "@/" tal como o resto do projecto.
const jiti = createJiti(path.join(RAIZ, "scripts/gen-ads.mjs"), {
  alias: { "@": path.join(RAIZ, "src") },
});
const carregar = (rel) => jiti(path.join(RAIZ, rel));

/** Escapa um campo para CSV: aspas duplicadas e envolvido quando é preciso. */
function campo(valor) {
  const s = String(valor ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(cabecalhos, linhas) {
  // BOM no início: sem ele, o Excel em Windows lê "Évora" como "Ã‰vora" e ela
  // abriria estes ficheiros para conferir antes de importar.
  return "﻿" + [cabecalhos, ...linhas].map((l) => l.map(campo).join(",")).join("\r\n") + "\r\n";
}

const CORRESPONDENCIA = { exata: "Exact", frase: "Phrase" };

async function main() {
  const mensal = Number(process.argv[2]) || 50;
  const ateFase = Math.min(3, Math.max(1, Number(process.argv[3]) || 3));
  const { planoParaOrcamento, urlFinal, DIAS_POR_MES, MINIMO_MENSAL_POR_CAMPANHA } = carregar(
    "src/lib/ads/campanhas.ts",
  );
  const plano = planoParaOrcamento(mensal, ateFase);
  const campanhas = plano.campanhas;

  await fs.mkdir(SAIDA, { recursive: true });

  // ── 1. CAMPANHAS ────────────────────────────────────────────────────────
  // Estado "Paused": NUNCA gerar campanhas activas. Uma importação que começa
  // a gastar no segundo em que termina não dá hipótese de conferir nada, e a
  // primeira coisa a conferir é sempre a segmentação geográfica.
  const linhasCampanhas = [];
  for (const c of campanhas) {
    for (const geo of c.geo) {
      linhasCampanhas.push([
        c.nome,
        "Search",
        c.orcamento.toFixed(2),
        "Manual CPC", // ver a nota sobre licitação em estrutura.md
        "Paused",
        "Google search",
        c.idioma === "en" ? "English" : "Portuguese",
        geo,
        c.modoLocalizacao === "presenca"
          ? "People in or regularly in your targeted locations"
          : "People in, or who show interest in, your targeted locations",
      ]);
    }
  }
  await fs.writeFile(
    path.join(SAIDA, "1-campanhas.csv"),
    csv(
      [
        "Campaign",
        "Campaign Type",
        "Budget",
        "Bid Strategy Type",
        "Campaign Status",
        "Networks",
        "Languages",
        "Location",
        "Location Target Type",
      ],
      linhasCampanhas,
    ),
  );

  // ── 2. GRUPOS ───────────────────────────────────────────────────────────
  const linhasGrupos = campanhas.flatMap((c) =>
    c.grupos.map((g) => [c.nome, g.nome, "Enabled", "0.60"]),
  );
  await fs.writeFile(
    path.join(SAIDA, "2-grupos.csv"),
    csv(["Campaign", "Ad Group", "Ad Group Status", "Max CPC"], linhasGrupos),
  );

  // ── 3. KEYWORDS ─────────────────────────────────────────────────────────
  const linhasKeywords = campanhas.flatMap((c) =>
    c.grupos.flatMap((g) =>
      g.keywords.map((k) => [
        c.nome,
        g.nome,
        k.texto,
        CORRESPONDENCIA[k.correspondencia],
        "Enabled",
        urlFinal(g.caminho, c.idioma),
      ]),
    ),
  );
  await fs.writeFile(
    path.join(SAIDA, "3-keywords.csv"),
    csv(["Campaign", "Ad Group", "Keyword", "Match Type", "Status", "Final URL"], linhasKeywords),
  );

  // ── 4. ANÚNCIOS RESPONSIVOS ─────────────────────────────────────────────
  const cabecalhoAnuncios = [
    "Campaign",
    "Ad Group",
    "Ad type",
    ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    "Final URL",
    "Path 1",
    "Path 2",
  ];
  const linhasAnuncios = campanhas.flatMap((c) =>
    c.grupos.map((g) => [
      c.nome,
      g.nome,
      "Responsive search ad",
      ...Array.from({ length: 15 }, (_, i) => g.titulos[i] ?? ""),
      ...Array.from({ length: 4 }, (_, i) => g.descricoes[i] ?? ""),
      urlFinal(g.caminho, c.idioma),
      c.idioma === "en" ? "weddings" : "casamentos",
      "",
    ]),
  );
  await fs.writeFile(path.join(SAIDA, "4-anuncios.csv"), csv(cabecalhoAnuncios, linhasAnuncios));

  // ── 5. NEGATIVAS ────────────────────────────────────────────────────────
  const { NEGATIVAS_CONTA, negativasCruzadas } = carregar("src/lib/ads/negativas.ts");
  const linhasNegativas = [];
  // Ao nível da conta, na prática: aplicadas a TODAS as campanhas. O Editor
  // não importa listas partilhadas por CSV — isso faz-se uma vez na interface
  // (Ferramentas → Listas de exclusão de palavras-chave). Estas linhas são o
  // recurso para quem prefira tê-las por campanha, e a lista partilhada está
  // em 5b-lista-partilhada.txt para colar de uma vez.
  for (const c of campanhas) {
    for (const n of NEGATIVAS_CONTA) {
      linhasNegativas.push([c.nome, "", n.texto, CORRESPONDENCIA[n.correspondencia]]);
    }
    for (const n of negativasCruzadas(c.nome)) {
      linhasNegativas.push([c.nome, "", n.texto, CORRESPONDENCIA[n.correspondencia]]);
    }
    for (const g of c.grupos) {
      for (const n of g.negativas ?? []) {
        linhasNegativas.push([c.nome, g.nome, n, "Phrase"]);
      }
    }
  }
  await fs.writeFile(
    path.join(SAIDA, "5-negativas.csv"),
    csv(["Campaign", "Ad Group", "Keyword", "Match Type"], linhasNegativas),
  );
  await fs.writeFile(
    path.join(SAIDA, "5b-lista-partilhada.txt"),
    NEGATIVAS_CONTA.map((n) =>
      n.correspondencia === "exata" ? `[${n.texto}]` : `"${n.texto}"`,
    ).join("\n") + "\n",
  );

  // ── 6. SITELINKS ────────────────────────────────────────────────────────
  const linhasSitelinks = campanhas.flatMap((c) => {
    const en = c.idioma === "en";
    const links = en
      ? [
          ["Portfolio", "Real weddings we designed", "Photographs, not mood boards", "/galeria"],
          [
            "How we work",
            "Concept, florals, production",
            "And who is there on the day",
            "/servicos/casamentos",
          ],
          ["About us", "A team based in Évora", "Producing across Portugal", "/sobre"],
          ["Request a proposal", "Four questions", "Answered within two days", "/orcamento"],
        ]
      : [
          ["Portefólio", "Casamentos que desenhámos", "Fotografias, não inspirações", "/galeria"],
          [
            "Como trabalhamos",
            "Conceito, flores, produção",
            "E quem está lá no dia",
            "/servicos/casamentos",
          ],
          ["Sobre nós", "Equipa com base em Évora", "Produção em todo o país", "/sobre"],
          ["Pedir proposta", "Quatro perguntas", "Resposta em 48 horas úteis", "/orcamento"],
        ];
    return links.map(([texto, d1, d2, caminho]) => [
      c.nome,
      "Sitelink",
      texto,
      d1,
      d2,
      urlFinal(caminho, c.idioma),
    ]);
  });
  await fs.writeFile(
    path.join(SAIDA, "6-sitelinks.csv"),
    csv(
      ["Campaign", "Asset type", "Sitelink text", "Description 1", "Description 2", "Final URL"],
      linhasSitelinks,
    ),
  );

  // ── 7. SEMENTE PARA O KEYWORD PLANNER ───────────────────────────────────
  // TODAS as keywords do plano completo, sem o corte de orçamento e sem os
  // sinais de correspondência — é o que se cola no Planeador de palavras-chave
  // para obter volume de pesquisa e custo por clique REAIS da conta dela. É a
  // única forma honesta de preencher as colunas que este trabalho não pode
  // preencher de fora; ver mercado.md.
  const { todasAsCampanhas } = carregar("src/lib/ads/campanhas.ts");
  const todas = todasAsCampanhas(1000);
  const semente = [
    ...new Set(todas.flatMap((c) => c.grupos.flatMap((g) => g.keywords.map((k) => k.texto)))),
  ].sort();
  await fs.writeFile(
    path.join(SAIDA, "keywords-seed.csv"),
    csv(
      ["Keyword"],
      semente.map((k) => [k]),
    ),
  );

  const totalKeywords = linhasKeywords.length;
  const totalGrupos = linhasGrupos.length;
  console.log(
    `gen-ads: ${campanhas.length} campanhas, ${totalGrupos} grupos, ` +
      `${totalKeywords} keywords, ${linhasAnuncios.length} anúncios, ` +
      `${linhasNegativas.length} negativas, ${semente.length} termos para o Planner ` +
      "→ ads-output/csv/",
  );
  console.log(
    `gen-ads: ${plano.mensalPedido} €/mês pedidos, ${plano.mensalAtribuido.toFixed(2)} € atribuídos ` +
      `a ${campanhas.length} de ${plano.pedidas} campanhas possíveis.`,
  );
  for (const c of campanhas) {
    console.log(
      `         ${c.nome}: ${(c.orcamento * DIAS_POR_MES).toFixed(0)} €/mês ` +
        `(${c.orcamento.toFixed(2)} €/dia)`,
    );
  }
  if (plano.abaixoDoViavel) {
    console.warn(
      `gen-ads: AVISO — ${plano.mensalPedido} €/mês ficam abaixo do mínimo viável de ` +
        `${MINIMO_MENSAL_POR_CAMPANHA} €/mês para UMA campanha. A campanha é gerada à mesma, ` +
        "mas não vai juntar cliques suficientes para se concluir nada. Vale mais juntar " +
        "dois meses de verba e correr um mês a sério.",
    );
  }
  console.log(
    "gen-ads: TODAS as campanhas saem em PAUSA. Confere a segmentação geográfica antes de activar.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
