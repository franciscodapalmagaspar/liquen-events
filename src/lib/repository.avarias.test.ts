import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Repository,
  SupabaseBackend,
  isCredencialRecusada,
  isSessaoExpirada,
  isBaseInacessivel,
  isTempoEsgotado,
  isLeituraNegada,
  isMissingTable,
  descricaoTecnica,
  type Mapper,
} from "./repository";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO HTTP TEM DE SOBREVIVER À VIAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `PostgrestError` traz código, frase e dicas — e NÃO traz o estado da
 * resposta. Medido contra o cliente real: uma chave recusada chega como
 * `{ message: "Invalid API key" }` e um erro interno do Postgres como
 * `{ code: "XX000", message: "…" }`. Sem o 401 ao lado do primeiro, quem decide
 * o que dizer ao ecrã não consegue separar «vai buscar a chave certa» de «isto
 * avariou», e ambos saíam como o mesmo 500 anónimo.
 *
 * O estado é colado ao erro no único sítio onde ainda se sabe — o backend, onde
 * a resposta é destruturada. Este ficheiro prende essa junção e prende os
 * reconhecedores que dela dependem.
 */

interface Coisa {
  id: string;
  nome: string;
}

const mapper: Mapper<Coisa> = {
  table: "coisas",
  fileName: "coisas.json",
  getId: (c) => c.id,
  toRow: (c) => ({ id: c.id, nome: c.nome }),
  fromRow: (r) => ({ id: String(r.id), nome: String(r.nome ?? "") }),
};

/** Um cliente que responde sempre a mesma recusa, com estado. */
function clienteQueRecusa(error: unknown, status: number): SupabaseClient {
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    then: <R>(f: (v: unknown) => R) => Promise.resolve({ data: null, error, status }).then(f),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

const lerCom = (error: unknown, status: number) =>
  new Repository<Coisa>(
    mapper,
    () => new SupabaseBackend<Coisa>(mapper, clienteQueRecusa(error, status)),
  )
    .list()
    .then(
      () => null,
      (e: unknown) => e,
    );

describe("o estado da resposta chega a quem decide a mensagem", () => {
  it("um 401 sem código nenhum é reconhecido como chave recusada", async () => {
    const err = await lerCom({ message: "Invalid API key" }, 401);
    expect((err as { status?: number }).status).toBe(401);
    expect(isCredencialRecusada(err)).toBe(true);
    expect(isMissingTable(err)).toBe(false);
  });

  it("um estado que o erro já traga não é sobreposto", async () => {
    const err = await lerCom({ message: "qualquer coisa", status: 418 }, 500);
    expect((err as { status?: number }).status).toBe(418);
  });

  it("um 500 com código do Postgres NÃO é confundido com chave recusada", async () => {
    const err = await lerCom({ code: "XX000", message: "internal error" }, 500);
    expect(isCredencialRecusada(err)).toBe(false);
    expect(descricaoTecnica(err)).toContain("XX000");
    expect(descricaoTecnica(err)).toContain("HTTP 500");
  });
});

describe("cada reconhecedor apanha a sua avaria e só a sua", () => {
  const casos: {
    nome: string;
    err: unknown;
    quem: (e: unknown) => boolean;
  }[] = [
    {
      nome: "sessão expirada",
      err: { code: "PGRST301", message: "JWT expired" },
      quem: isSessaoExpirada,
    },
    {
      nome: "projecto em pausa (HTML em vez de JSON)",
      err: { message: "<html><body>Project is paused</body></html>" },
      quem: isBaseInacessivel,
    },
    {
      nome: "ligação recusada",
      err: { message: "TypeError: fetch failed", code: "" },
      quem: isBaseInacessivel,
    },
    {
      nome: "tempo esgotado na base de dados",
      err: { code: "57014", message: "canceling statement due to statement timeout" },
      quem: isTempoEsgotado,
    },
    {
      nome: "leitura negada pelas políticas",
      err: { code: "42501", message: "permission denied for table proposal_themes" },
      quem: isLeituraNegada,
    },
  ];

  const todos = [
    isMissingTable,
    isCredencialRecusada,
    isSessaoExpirada,
    isBaseInacessivel,
    isTempoEsgotado,
    isLeituraNegada,
  ];

  for (const { nome, err, quem } of casos) {
    it(nome, () => {
      expect(quem(err), nome).toBe(true);
      // Um erro reconhecido por dois é um erro com duas resoluções — e o ecrã
      // acaba a dizer a errada, consoante a ordem dos `if`.
      expect(todos.filter((f) => f(err)).length, `${nome}: reconhecido por mais do que um`).toBe(1);
    });
  }

  it("um erro que não é nenhuma destas não é acusado por nenhuma", () => {
    const err = { code: "XX000", message: "internal error", status: 500 };
    expect(todos.filter((f) => f(err))).toEqual([]);
  });
});
