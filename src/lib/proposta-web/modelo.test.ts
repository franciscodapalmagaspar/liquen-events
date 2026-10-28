import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proposal-doc-render", () => ({ conteudoWebDoDocumento: vi.fn() }));
// O que se guarda (`guardado.ts`) não toca no `data/` da máquina nos testes.
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => null),
  setState: vi.fn(async () => ({ gravado: true })),
}));
vi.mock("@/lib/proposta-fotos", async () => {
  const real = await vi.importActual<typeof import("@/lib/proposta-fotos")>("@/lib/proposta-fotos");
  return { ...real, fotosDaProposta: vi.fn() };
});
vi.mock("@/lib/pdf-editorial/paleta-das-fotos", () => ({
  paletaDasFotos: vi.fn(async () => [
    "#111111",
    "#eeeeee",
    "#a0603b",
    "#2f4f4f",
    "#c9a227",
    "#000000",
  ]),
}));

import { montarPropostaWeb } from "./modelo";
import { textosWeb } from "./textos-web";
import { inventarioDeFotos } from "@/lib/proposta-fotos";
import type { ConteudoWeb } from "@/lib/pdf-editorial/conteudo-web";
import type { ProposalDoc } from "@/lib/proposal-doc";

/** Caminhos do armazenamento — nenhum pode aparecer na página. */
const C = (n: number) => `LQ-TESTE/segredo-${n}.jpg`;
const doc = {
  coverImages: [C(0)],
  moodBoards: [
    { title: "Cerimónia", images: [C(1), C(2), C(3)] },
    { title: "Jantar", images: [C(4), C(5)] },
  ],
  escolhas: [],
} as unknown as ProposalDoc;
const f = (n: number, aspecto = 1.5) => ({ ref: C(n), aspecto });

const conteudo: ConteudoWeb = {
  casamento: true,
  lema: "Decoramos eventos, eternizamos memórias.",
  organizacao: false,
  capa: { sobretitulo: "", nomes: "Ana & Rui", partes: ["Casamento", "10.06.2099"], fundo: f(0) },
  proposta: {
    sobretitulo: "A proposta",
    titulo: "Uma decoração",
    factos: [],
    nota: "",
    foto: f(1),
  },
  servicos: { titulo: "Dois serviços", itens: [{ nome: "Mesa", descricao: "", foto: f(2) }] },
  ambiente: null,
  capitulos: [
    {
      numero: 1,
      nome: "Cerimónia",
      linha: "",
      nota: "n",
      fotos: [f(1), f(2)],
      temas: [{ titulo: "Cerimónia", subtitulo: "", nota: "", fotos: [f(1), f(2, 0.7), f(3)] }],
    },
    {
      numero: 2,
      nome: "Jantar",
      linha: "",
      nota: "",
      fotos: [f(4)],
      temas: [{ titulo: "Jantar", subtitulo: "", nota: "", fotos: [f(4), f(5, 0.7)] }],
    },
  ],
  citacao: {
    sobretitulo: "",
    frase: "Decoramos eventos.",
    assinatura: "Líquen Events",
    foto: f(4),
  },
  investimento: null,
  cronograma: null,
  condicoes: [
    {
      titulo: "Notas e próximos passos",
      pecas: [
        { tipo: "h3", texto: "Notas importantes" },
        { tipo: "item", texto: "a" },
        { tipo: "h3", texto: "Próximos passos" },
        { tipo: "item", texto: "b" },
      ],
    },
    { titulo: "Condições gerais", pecas: [{ tipo: "item", texto: "c" }] },
  ],
  fotoDasCondicoes: f(3),
  fecho: { sobretitulo: "", agradecimento: "", validade: "1 de maio de 2099", fundo: f(0) },
};

/** As assinadas, pela ordem do inventário, como o `fotosDaProposta` as devolve. */
const assinadas = inventarioDeFotos(doc).map((e, i) => ({
  id: e.id,
  marca: `m${i}`,
  miniatura: `https://cdn.teste/mini-${i}.webp?token=x`,
  media: `https://cdn.teste/media-${i}.webp?token=x`,
  original: `https://cdn.teste/orig-${i}.jpg?token=x`,
  largura: 1800,
}));

describe("a proposta online pronta a desenhar", () => {
  it("a capa leva as suas AVIF (27/10, «Mais rápida») — e só a capa", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
      {
        avif: "https://cdn.teste/capa-1200.avif?token=x",
        grande: "https://cdn.teste/capa-2000.avif?token=x",
      },
    );
    // Um só `srcset` em AVIF, com as duas e as larguras (28/10).
    expect(p.capa.fundo?.avif).toMatch(
      /^https:\/\/cdn\.teste\/capa-1200\.avif\?token=x \d+w, https:\/\/cdn\.teste\/capa-2000\.avif\?token=x \d+w$/,
    );
    expect(p.capa.fundo?.avifGrande).toBe(true);
    // A mesma fotografia no fecho continua sem a grande.
    expect(p.fecho.foto?.avifGrande ?? p.citacao?.foto.avifGrande).toBeUndefined();
    expect(JSON.stringify(p).match(/capa-2000/g)).toHaveLength(1);
  });

  it("o srcset diz a largura REAL de cada ficheiro, também ao alto (28/10)", async () => {
    const aoAlto = assinadas.map((a) => ({ ...a, largura: 1600, altura: 2400 }));
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      aoAlto,
    );
    // A «1200» de uma foto ao alto tem 800 de largura; a «400», 267.
    expect(p.capa.fundo?.srcSet).toMatch(
      /mini-0\.webp\?token=x 267w, .*media-0\.webp\?token=x 800w, .* 1600w$/,
    );
  });

  it("sem AVIF da capa, a capa fica como estava", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.capa.fundo?.avif).toBeUndefined();
    expect(p.capa.fundo?.avifGrande).toBeUndefined();
  });

  it("nenhum caminho do armazenamento sai para a página — só endereços assinados e rotas do link", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(JSON.stringify(p)).not.toMatch(/segredo/);
    expect(p.capa.fundo?.srcSet).toMatch(/400w, .*1200w, .*1800w/);
    expect(p.proposta.fundo).toMatch(/^\/api\/proposta\/TOKEN\/fundo\//);
    expect(p.pdf).toBe("/api/proposta/TOKEN/pdf");
  });

  it("num casamento os nomes partem-se no «&», e a saudação é aos dois", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.capa.nomes).toEqual({ um: "Ana", outro: "Rui" });
    expect(p.saudacao).toBe("Olá, Ana e Rui.");
  });

  it("as condições: um bloco por título; a citação a meio dos capítulos; sem orçamento, sem investimento", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.condicoes.blocos.map((b) => b.titulo)).toEqual([
      "Notas importantes",
      "Próximos passos",
      "Condições gerais",
    ]);
    expect(p.citacaoDepoisDe).toBe(1);
    expect(p.investimento).toBeNull();
  });

  it("cada capítulo tem o seu mosaico, com uma célula de texto e todas as fotografias", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.capitulos[0].mosaico.filter((c) => c.texto)).toHaveLength(1);
    expect(p.capitulos[0].mosaico.filter((c) => c.imagem)).toHaveLength(3);
    expect(p.capitulos.map((c) => c.fotoAEsquerda)).toEqual([false, true]);
  });

  it("o «Quero avançar» leva a uma conversa: WhatsApp e email da casa, nunca um aceite", async () => {
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.fecho.whatsapp).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(p.fecho.mailto).toMatch(/^mailto:/);
  });

  it("o rodapé leva o Instagram e o LinkedIn da casa (pedido dela, 25/10)", async () => {
    const { SITE } = await import("@/lib/site");
    const p = await montarPropostaWeb(
      conteudo,
      { id: "p1", doc },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.redes.instagram).toBe(SITE.instagram);
    expect(p.redes.linkedin).toBe(SITE.linkedin);
    expect(textosWeb("pt").redes.instagram).toMatch(/Instagram/);
    expect(textosWeb("en").redes.linkedin).toMatch(/LinkedIn/);
  });
});
