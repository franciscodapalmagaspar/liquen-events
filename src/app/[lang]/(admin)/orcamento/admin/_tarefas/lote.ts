import type { Task } from "@/lib/orcamento/types";

/** Os títulos para a pergunta de eliminar o lote, cortados a seis. */
export function nomesAMostrar(tarefas: readonly Task[] | null): string[] {
  if (!tarefas) return [];
  const nomes = tarefas.map((t) => t.title || "Sem título");
  return nomes.length <= 6 ? nomes : [...nomes.slice(0, 6), `… e mais ${nomes.length - 6}`];
}

/**
 * Um pedido de uma acção em lote, sem aviso por pedido: quem chama junta as N
 * respostas e diz UMA frase. Nunca atira — a rede em baixo é `ok: false`.
 */
export async function pedirEmSilencio(
  url: string,
  method: "PATCH" | "DELETE",
  corpo?: Record<string, unknown>,
): Promise<{ ok: boolean; corpo: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      ...(corpo
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }
        : {}),
    });
    return { ok: res.ok, corpo: await res.json().catch(() => null) };
  } catch {
    return { ok: false, corpo: null };
  }
}
