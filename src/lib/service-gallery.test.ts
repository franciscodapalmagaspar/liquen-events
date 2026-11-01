import { describe, it, expect } from "vitest";
import {
  pickServiceGallery,
  pickServiceGalleryPool,
  SERVICE_GALLERY_ROTATION,
  SERVICE_GALLERY_SIZE,
} from "./service-gallery";
import { PHOTOS } from "@/app/[lang]/(site)/galeria/photos-data";
import { SERVICES } from "./services-data";
import dims from "./image-dims.json";

const DIMENSOES = dims as Record<string, number[]>;

const srcOf = (labels: string[]) =>
  new Set(PHOTOS.filter((p) => labels.includes(p.label)).map((p) => p.src));

describe("pickServiceGallery", () => {
  it("dá seis fotos, sem repetir nenhuma", () => {
    const g = pickServiceGallery("casamentos")!;
    expect(g).toHaveLength(SERVICE_GALLERY_SIZE);
    expect(new Set(g).size).toBe(SERVICE_GALLERY_SIZE);
  });

  it("só tira fotos do conjunto do serviço", () => {
    const casamentos = srcOf(["Casamento"]);
    for (const src of pickServiceGallery("casamentos")!) expect(casamentos.has(src)).toBe(true);

    const corporativo = srcOf(["Corporativo", "Conferência"]);
    for (const src of pickServiceGallery("eventos-corporativos")!) {
      expect(corporativo.has(src)).toBe(true);
    }
  });

  it("varia entre visitas", () => {
    // O ponto todo da alteração. Com 333 fotografias, vinte sorteios seguidos
    // darem exatamente o mesmo conjunto seria um sorteio partido, não azar.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(pickServiceGallery("casamentos")!.join("|"));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("cobre todo o conjunto ao longo do tempo, não só o início da lista", () => {
    // Um Fisher-Yates parcial mal escrito tende a devolver sempre as primeiras
    // posições; isto obriga o sorteio a alcançar o fim da lista.
    // O fim da lista das que o sorteio PODE escolher — deitadas e grandes, como
    // o `serve()` pede. Medido sobre todas, as 900 px ao alto vindas do
    // Instagram enchiam a metade de trás e o teste deixava de medir o sorteio.
    const pool = [...srcOf(["Casamento"])].filter((src) => {
      const d = DIMENSOES[src];
      return !!d && d[0] / d[1] >= 1.4 && d[0] >= 2000;
    });
    const tail = new Set(pool.slice(Math.floor(pool.length / 2)));
    const hits = new Set<string>();
    for (let i = 0; i < 60; i++) {
      for (const src of pickServiceGallery("casamentos")!) if (tail.has(src)) hits.add(src);
    }
    expect(hits.size).toBeGreaterThan(20);
  });

  it("nunca põe uma fotografia vertical num mosaico deitado", () => {
    // A queixa que originou o filtro: "coloca fotos que se adequem em termos
    // de posição". O mosaico grande é 2,8:1; uma fotografia vertical lá dentro
    // aparece como uma tira do meio dela, e é isso que se vê na página.
    //
    // Vinte sorteios por serviço, e não um: o defeito era probabilístico —
    // com 254 verticais em 333, um único sorteio limpo não provava nada.
    const problemas: string[] = [];
    for (const svc of SERVICES) {
      for (let i = 0; i < 20; i++) {
        for (const src of pickServiceGallery(svc.slug) ?? []) {
          const d = DIMENSOES[src];
          if (!d) {
            problemas.push(`${svc.slug}: ${src} não tem dimensões conhecidas`);
            continue;
          }
          if (d[0] / d[1] < 1.4) {
            problemas.push(`${svc.slug}: ${src} é ${d[0]}x${d[1]}, vertical`);
          }
        }
      }
    }
    expect([...new Set(problemas)], problemas.join("\n")).toEqual([]);
  });

  it("usa sempre as maiores que o conjunto do serviço tiver", () => {
    // Um mosaico servido a 67vw num portátil de 1440 px com ecrã de densidade
    // dupla pede quase 2000 px de largura real; abaixo disso o browser amplia.
    // Mas isso é uma PREFERÊNCIA, não uma exigência, e o teste tem de dizer o
    // mesmo que o código — senão passa a proibir o degrau de recurso.
    //
    // MEDIDO: o conjunto "Evento" tem catorze fotografias deitadas e só UMA
    // com 2000 px ou mais. Exigir os 2000 lá seria exigir uma grelha com
    // buracos. Portanto o que se verifica é outra coisa: que o sorteio usa
    // sempre o MELHOR degrau que aquele conjunto consegue encher.
    const problemas: string[] = [];
    for (const svc of SERVICES) {
      const escolhas = pickServiceGallery(svc.slug);
      if (!escolhas) continue; // serve-se da lista à mão; não é este o assunto

      const conjunto = PHOTOS.filter((p) => escolhas.includes(p.src)).map((p) => p.label);
      const irmas = PHOTOS.filter((p) => conjunto.includes(p.label)).map((p) => p.src);
      const grandesEDeitadas = irmas.filter((s) => {
        const d = DIMENSOES[s];
        return d && d[0] / d[1] >= 1.4 && d[0] >= 2000;
      });
      if (grandesEDeitadas.length < SERVICE_GALLERY_SIZE) continue; // degrau legítimo

      for (let i = 0; i < 20; i++) {
        for (const src of pickServiceGallery(svc.slug) ?? []) {
          const d = DIMENSOES[src];
          if (d && d[0] < 2000) {
            problemas.push(
              `${svc.slug}: ${src} tem ${d[0]} px, e este conjunto tem ` +
                `${grandesEDeitadas.length} fotografias deitadas com 2000 px ou mais`,
            );
          }
        }
      }
    }
    expect([...new Set(problemas)], problemas.join("\n")).toEqual([]);
  });

  it("recusa-se a servir um serviço sem conjunto próprio", () => {
    // As viaturas clássicas não têm etiqueta na galeria: preferimos devolver
    // `null` (e a página fica com a lista escolhida à mão) a encher a secção
    // de fotos de casamento sem um único carro.
    expect(pickServiceGallery("aluguer-de-viaturas-classicas")).toBeNull();
    expect(pickServiceGallery("servico-que-nao-existe")).toBeNull();
  });

  it("todo o serviço acaba com seis fotos, por sorteio ou pela lista à mão", () => {
    for (const svc of SERVICES) {
      const g = pickServiceGallery(svc.slug) ?? svc.gallery;
      expect(g.length, `${svc.slug} ficou com ${g.length}`).toBe(SERVICE_GALLERY_SIZE);
    }
  });
});

describe("pickServiceGalleryPool (a grelha que vai trocando, 1/11)", () => {
  it("dá até 18, sem repetir, todas do conjunto do serviço e todas deitadas", () => {
    const g = pickServiceGalleryPool("casamentos")!;
    expect(g).toHaveLength(SERVICE_GALLERY_ROTATION);
    expect(new Set(g).size).toBe(g.length);
    const casamentos = srcOf(["Casamento"]);
    for (const src of g) {
      expect(casamentos.has(src)).toBe(true);
      const [w, h] = DIMENSOES[src];
      expect(w / h).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("com menos de 18 deitadas, fica com as que há (nunca mete verticais para encher)", () => {
    const g = pickServiceGalleryPool("festas-e-aniversarios")!;
    expect(g.length).toBeGreaterThanOrEqual(SERVICE_GALLERY_SIZE);
    expect(g.length).toBeLessThanOrEqual(SERVICE_GALLERY_ROTATION);
    for (const src of g) {
      const [w, h] = DIMENSOES[src];
      expect(w / h).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("um serviço sem conjunto próprio devolve null (fica a lista escolhida à mão)", () => {
    expect(pickServiceGalleryPool("aluguer-de-viaturas-classicas")).toBeNull();
  });
});
