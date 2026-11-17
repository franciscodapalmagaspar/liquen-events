"use client";
import { useEffect, useState } from "react";
import { rolarAteVer } from "@/lib/motion/rolar";
import { chaveDoCampo, seccaoDoCampo, type CampoPublicado } from "@/lib/proposal-ortografia";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaDobrasDosBoards {
  campoAVisitar: { campo: CampoPublicado; pedido: number; versao?: "pt" | "en" } | null;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  faltaAVisitar: { seccao?: string; campo?: string; pedido: number } | null;
}

export function useDobrasDosBoards({
  campoAVisitar,
  documento,
  faltaAVisitar,
}: EntradaDobrasDosBoards) {
  const { doc } = documento;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS BOARDS FECHADOS — NESTA SESSÃO, E SÓ NESTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * A mesma regra das secções (ver `Section`), e pela mesma razão: um mood
   * board fechado é uma pilha de fotografias que não se vê, e reabrir a
   * proposta tem de mostrar a proposta.
   *
   * Isto ficava guardado no `localStorage` por proposta. Um «Fechar todos» de
   * há três semanas — feito uma vez para chegar depressa ao fundo da página —
   * continuava a esconder as páginas de inspiração hoje, sem nada no ecrã que
   * o explicasse. E foi a mesma memória que apareceu no relato dela como
   * «secções colapsadas».
   *
   * O gesto fica: fechar um board, ou fechá-los todos, continua a valer
   * enquanto ela lá está. Deixa é de atravessar visitas.
   *
   * A chave é o ID do board e não a posição: arrastar um board para outro
   * sítio trocaria as dobras todas de lugar.
   */
  const [dobrados, setDobrados] = useState<Record<string, boolean>>({});

  function escreverDobras(proximas: Record<string, boolean>) {
    setDobrados(proximas);
  }

  /**
   * O salto para o campo, DEPOIS de ele estar desenhado.
   *
   * O controlo leva a chave num `data-campo`; quando o campo não tem controlo
   * próprio no editor — as linhas do quadro do orçamento são semeadas a partir
   * do pedido — cai-se na SECÇÃO, que é onde a resposta está. Não fazer nada
   * seria a pior das três hipóteses.
   *
   * `focus` depois do `scrollIntoView` e com `preventScroll`: o foco sozinho
   * salta a página de golpe e sem margem nenhuma; assim o campo fica ao centro
   * e a escrita começa onde ela está a olhar.
   */
  useEffect(() => {
    if (!campoAVisitar) return;
    // A caixa inglesa leva o mesmo `data-campo` com `:en` colado — o salto
    // encontra-a com a maquinaria que já existe, sem uma segunda.
    const chave = chaveDoCampo(campoAVisitar.campo) + (campoAVisitar.versao === "en" ? ":en" : "");
    const alvo =
      document.querySelector<HTMLElement>(`[data-campo="${chave}"]`) ??
      document.getElementById(`seccao-${seccaoDoCampo(campoAVisitar.campo)}`);
    rolarAteVer(alvo, { block: "center" });
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
      alvo.focus({ preventScroll: true });
      alvo.select();
    }
  }, [campoAVisitar]);

  /** O salto da Conferência, depois de a secção estar aberta e desenhada. */
  useEffect(() => {
    if (!faltaAVisitar) return;
    const { seccao, campo } = faltaAVisitar;
    const cartao = seccao ? document.getElementById(`seccao-${seccao}`) : null;
    // `:scope > div >` e não um `querySelector` solto: dentro de uma secção há
    // outros botões com `aria-expanded` (os mood boards têm as suas dobras), e
    // o primeiro fechado que aparecesse era o que abria — que podia ser outro
    // qualquer, algures no meio do cartão.
    cartao
      ?.querySelector<HTMLButtonElement>(':scope > div > button[aria-expanded="false"]')
      ?.click();
    // Num tique a seguir: o campo só está VISÍVEL depois de o clique acima ter
    // sido processado, e focar um elemento escondido não faz nada.
    const espera = setTimeout(() => {
      const alvo =
        (campo && document.querySelector<HTMLElement>(`[data-campo="${campo}"]`)) || cartao;
      rolarAteVer(alvo, { block: "center" });
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
        alvo.focus({ preventScroll: true });
        alvo.select();
      }
    }, 0);
    return () => clearTimeout(espera);
  }, [faltaAVisitar]);

  function alternarDobra(id: string) {
    escreverDobras({ ...dobrados, [id]: !dobrados[id] });
  }

  function dobrarTodos(fechar: boolean) {
    const proximas: Record<string, boolean> = {};
    for (const b of doc.moodBoards) if (b.id) proximas[b.id] = fechar;
    escreverDobras(proximas);
  }

  return { alternarDobra, dobrados, dobrarTodos, escreverDobras };
}
