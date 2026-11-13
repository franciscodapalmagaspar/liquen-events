import type { MaterialItem, MaterialKind } from "./material-types";
import { MATERIAL_CATEGORIES } from "./material-types";

/**
 * LER UM CSV DE INVENTÁRIO — E DIZER O QUE VAI ACONTECER ANTES DE ACONTECER.
 *
 * Quem carrega isto está a passar uma folha de cálculo com o inventário todo
 * de uma vez. Um ficheiro mal lido escreve centenas de linhas erradas, e
 * desfazer isso à mão custa mais do que escrever tudo de novo. Por isso este
 * módulo **não escreve nada**: devolve um plano — o que entra novo, o que
 * atualiza uma linha existente, e o que não foi percebido e porquê.
 *
 * O ecrã mostra esse plano, e só depois de o verem é que se grava.
 *
 * ── Emparelhamento pelo NOME ──────────────────────────────────────────────
 * Não há ids numa folha de cálculo escrita à mão. O que existe é o nome, e é
 * por ele que se decide entre criar e atualizar — comparado sem maiúsculas,
 * sem acentos e sem espaços a mais, porque "Fita-cola" e "fita cola " são a
 * mesma fita para quem escreveu.
 */

export type LinhaEstado = "novo" | "atualiza" | "erro";

export interface LinhaCsv {
  /** Número da linha no ficheiro, a contar do 1 e incluindo o cabeçalho —
   *  é o que a pessoa vê no Excel quando for corrigir. */
  linha: number;
  estado: LinhaEstado;
  /** A razão, quando `estado` é "erro". Escrita para ser lida por quem corrige. */
  erro?: string;
  /** O que se vai gravar. Ausente nas linhas com erro. */
  item?: Omit<MaterialItem, "id" | "updatedAt">;
  /** O id da linha existente que vai ser atualizada. */
  alvoId?: string;
  /** O que muda, quando atualiza — para o ecrã poder mostrar "12 → 20". */
  antes?: { stock: number; minStock?: number };
}

export interface PlanoCsv {
  linhas: LinhaCsv[];
  novos: number;
  atualizados: number;
  erros: number;
}

/** "Fita-Cola  Dupla " → "fitacoladupla". Só para emparelhar, nunca guardado. */
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Divide uma linha de CSV respeitando aspas.
 *
 * Escrito à mão em vez de `split(",")` porque as notas levam vírgulas — "levar
 * o pequeno, o grande não passa" — e um split ingénuo partia o campo a meio e
 * empurrava metade da frase para a coluna seguinte, calado.
 */
export function dividirLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      // "" dentro de aspas é uma aspa literal (convenção do CSV).
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') {
        dentroDeAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === "," || c === ";") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Números escritos por gente: "1.234,5" e "1234.5" são o mesmo. Vazio → nulo. */
export function lerNumero(bruto: string): number | null {
  const s = bruto.trim();
  if (!s) return null;
  // Com vírgula E ponto, o último separador é o decimal.
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  let normal = s;
  if (temVirgula && temPonto) {
    normal =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (temVirgula) {
    normal = s.replace(",", ".");
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    // Só pontos, em grupos de três: milhares à portuguesa. «1.200»
    // guardanapos são mil e duzentos, não 1,2 (achado n.º 16 da auditoria 6).
    // A mesma regra do `parseMoney` do back office; «12.5» e «0.500»
    // (zero à frente) continuam decimais.
    normal = s.replace(/\./g, "");
  }
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "consumivel"/"consumível"/"c" → consumível; tudo o resto → reutilizável. */
export function lerTipo(bruto: string): MaterialKind {
  const s = chaveDeNome(bruto);
  return s.startsWith("consum") || s === "c" ? "consumivel" : "reutilizavel";
}

/** A categoria escrita, emparelhada com o catálogo sem ligar a acentos. */
export function lerCategoria(bruto: string): string | null {
  const alvo = chaveDeNome(bruto);
  if (!alvo) return null;
  return MATERIAL_CATEGORIES.find((c) => chaveDeNome(c) === alvo) ?? null;
}

const COLUNAS = ["nome", "categoria", "unidade", "tipo", "stock", "minimo", "notas"] as const;

/**
 * Lê o texto do CSV e devolve o plano, sem tocar em nada.
 *
 * `existentes` é o catálogo atual, para se saber o que é criação e o que é
 * atualização — e para o ecrã poder mostrar o antes e o depois do stock.
 */
export function planearImportacao(texto: string, existentes: MaterialItem[]): PlanoCsv {
  const porNome = new Map(existentes.map((i) => [chaveDeNome(i.name), i]));
  // Nomes já vistos NESTE ficheiro: duas linhas para o mesmo item são um erro
  // de quem escreveu, e importá-las às duas deixava o stock pelo valor da
  // última, sem ninguém saber que houve duas.
  const vistos = new Map<string, number>();

  const linhasBrutas = texto.split(/\r?\n/);
  const linhas: LinhaCsv[] = [];

  // Cabeçalho: aceita-se em qualquer ordem, e o que não se reconhecer é
  // ignorado em vez de deslocar as colunas seguintes.
  const primeira = linhasBrutas.findIndex((l) => l.trim() !== "");
  if (primeira === -1) return { linhas: [], novos: 0, atualizados: 0, erros: 0 };

  const cabecalho = dividirLinha(linhasBrutas[primeira]).map(chaveDeNome);
  const indice: Partial<Record<(typeof COLUNAS)[number], number>> = {};
  for (const col of COLUNAS) {
    const at = cabecalho.indexOf(chaveDeNome(col));
    if (at >= 0) indice[col] = at;
  }

  for (let i = primeira + 1; i < linhasBrutas.length; i++) {
    const bruta = linhasBrutas[i];
    if (bruta.trim() === "") continue;
    const numeroLinha = i + 1;
    const campos = dividirLinha(bruta);
    const campo = (col: (typeof COLUNAS)[number]) => {
      const at = indice[col];
      return at === undefined ? "" : (campos[at] ?? "");
    };

    const nome = campo("nome");
    if (!nome) {
      linhas.push({ linha: numeroLinha, estado: "erro", erro: "Sem nome." });
      continue;
    }

    const chave = chaveDeNome(nome);
    const jaVisto = vistos.get(chave);
    if (jaVisto !== undefined) {
      linhas.push({
        linha: numeroLinha,
        estado: "erro",
        erro: `Nome repetido (já aparece na linha ${jaVisto}).`,
      });
      continue;
    }
    vistos.set(chave, numeroLinha);

    const categoriaBruta = campo("categoria");
    const categoria = lerCategoria(categoriaBruta);
    if (categoriaBruta && !categoria) {
      linhas.push({
        linha: numeroLinha,
        estado: "erro",
        erro: `Categoria desconhecida: "${categoriaBruta}".`,
      });
      continue;
    }

    const stock = lerNumero(campo("stock"));
    const minimo = lerNumero(campo("minimo"));
    const existente = porNome.get(chave);

    const item: Omit<MaterialItem, "id" | "updatedAt"> = {
      name: nome.slice(0, 120),
      category: categoria ?? existente?.category ?? "Ferramentas",
      kind: campo("tipo") ? lerTipo(campo("tipo")) : (existente?.kind ?? "reutilizavel"),
      unit: campo("unidade").slice(0, 24) || existente?.unit || undefined,
      stock: stock ?? existente?.stock ?? 0,
      minStock: minimo ?? existente?.minStock,
      notes: campo("notas").slice(0, 500) || existente?.notes || undefined,
    };

    linhas.push(
      existente
        ? {
            linha: numeroLinha,
            estado: "atualiza",
            item,
            alvoId: existente.id,
            antes: { stock: existente.stock, minStock: existente.minStock },
          }
        : { linha: numeroLinha, estado: "novo", item },
    );
  }

  return {
    linhas,
    novos: linhas.filter((l) => l.estado === "novo").length,
    atualizados: linhas.filter((l) => l.estado === "atualiza").length,
    erros: linhas.filter((l) => l.estado === "erro").length,
  };
}
