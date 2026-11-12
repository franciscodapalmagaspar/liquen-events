import { describe, expect, it } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { realinharChavesDosTemas } from "./plano";

/** Auditoria de 12/11, n.º 1: as fotos escolhidas seguem o TEMA, não a posição. */
const b = (id: string, title: string, images: string[] = [`${id}.jpg`]) => ({
  id,
  title,
  images,
  annotation: "",
});

const halloween = (
  moodBoards: ReturnType<typeof b>[],
  fotosDasPaginas: ProposalDoc["fotosDasPaginas"],
) =>
  ({
    eventType: "Festa",
    serviceGroups: [],
    moodBoards,
    fotosDasPaginas,
  }) as unknown as ProposalDoc;

describe("realinhar as chaves das fotos escolhidas", () => {
  const bar = b("t-bar", "Bar");
  const arco = b("t-arco", "Arco");
  const mesa = b("t-mesa", "Mesa");
  const fotos = {
    "separador:tema-1": { fotos: ["biblioteca/bar.jpg"] },
    "separador:tema-2": { fotos: ["biblioteca/arco.jpg"] },
    "tema:0": { fotos: ["biblioteca/painel-bar.jpg"] },
    "tema:2": { fotos: ["biblioteca/painel-mesa.jpg"] },
    indice: { fotos: ["biblioteca/indice.jpg"] },
  };
  const antes = halloween([bar, arco, mesa], fotos);

  it("apagado o «Bar», a foto dele NÃO passa para o «Arco»; as do resto acompanham", () => {
    const depois = realinharChavesDosTemas(antes, {
      ...antes,
      moodBoards: [arco, mesa],
    } as ProposalDoc);
    expect(depois.fotosDasPaginas).toEqual({
      "separador:tema-1": { fotos: ["biblioteca/arco.jpg"] },
      "tema:1": { fotos: ["biblioteca/painel-mesa.jpg"] },
      indice: { fotos: ["biblioteca/indice.jpg"] },
    });
  });

  it("mover troca as chaves com os temas", () => {
    const depois = realinharChavesDosTemas(antes, {
      ...antes,
      moodBoards: [arco, bar, mesa],
    } as ProposalDoc);
    expect(depois.fotosDasPaginas?.["separador:tema-2"]?.fotos).toEqual(["biblioteca/bar.jpg"]);
    expect(depois.fotosDasPaginas?.["separador:tema-1"]?.fotos).toEqual(["biblioteca/arco.jpg"]);
    expect(depois.fotosDasPaginas?.["tema:1"]?.fotos).toEqual(["biblioteca/painel-bar.jpg"]);
  });

  it("duplicar não dá à cópia a foto do original", () => {
    const copia = { ...bar, id: "t-bar-copia", title: "Bar (cópia)" };
    const depois = realinharChavesDosTemas(antes, {
      ...antes,
      moodBoards: [bar, copia, arco, mesa],
    } as ProposalDoc);
    expect(depois.fotosDasPaginas?.["separador:tema-1"]?.fotos).toEqual(["biblioteca/bar.jpg"]);
    expect(depois.fotosDasPaginas?.["separador:tema-3"]?.fotos).toEqual(["biblioteca/arco.jpg"]);
    expect(depois.fotosDasPaginas?.["tema:3"]?.fotos).toEqual(["biblioteca/painel-mesa.jpg"]);
    expect(depois.fotosDasPaginas?.["separador:tema-2"]).toBeUndefined();
  });

  it("editar um título no sítio não mexe em nada", () => {
    const depois = realinharChavesDosTemas(antes, {
      ...antes,
      moodBoards: [{ ...bar, title: "Bar de gin" }, arco, mesa],
    } as ProposalDoc);
    expect(depois.fotosDasPaginas).toEqual(fotos);
  });

  it("um tema vazio que ganha a primeira foto empurra os separadores, e as fotos seguem", () => {
    const vazio = b("t-vazio", "", []);
    const comVazio = halloween([vazio, bar, arco, mesa], fotos);
    // Antes: o vazio não tem capítulo, «Bar» é o 1.º. Agora tem uma foto.
    const depois = realinharChavesDosTemas(
      {
        ...comVazio,
        fotosDasPaginas: { "separador:tema-1": { fotos: ["biblioteca/bar.jpg"] } },
      } as ProposalDoc,
      {
        ...comVazio,
        moodBoards: [{ ...vazio, images: ["nova.jpg"] }, bar, arco, mesa],
        fotosDasPaginas: { "separador:tema-1": { fotos: ["biblioteca/bar.jpg"] } },
      } as ProposalDoc,
    );
    expect(depois.fotosDasPaginas).toEqual({
      "separador:tema-2": { fotos: ["biblioteca/bar.jpg"] },
    });
  });

  it("num casamento os separadores são do dia e não se tocam; os temas acompanham", () => {
    const casamento = { ...antes, eventType: "Casamento" } as ProposalDoc;
    const depois = realinharChavesDosTemas(casamento, {
      ...casamento,
      moodBoards: [arco, mesa],
    } as ProposalDoc);
    expect(depois.fotosDasPaginas?.["separador:tema-1"]?.fotos).toEqual(["biblioteca/bar.jpg"]);
    expect(depois.fotosDasPaginas?.["tema:1"]?.fotos).toEqual(["biblioteca/painel-mesa.jpg"]);
    expect(depois.fotosDasPaginas?.["tema:0"]).toBeUndefined();
  });

  it("sem mudanças nos temas devolve o mesmo documento", () => {
    const igual = { ...antes, clientNames: "x" } as unknown as ProposalDoc;
    expect(realinharChavesDosTemas(antes, igual)).toBe(igual);
  });
});
