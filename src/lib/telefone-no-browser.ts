import { useEffect, useState } from "react";
import type { Dict } from "./i18n/pt";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS REGRAS DOS TELEFONES, NO BROWSER — SÓ QUANDO SÃO PRECISAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras de todos os países (`contacto-do-pedido.ts`, em cima da
 * `libphonenumber-js/max`) pesam ~150 KB. O `/orcamento` e a página inicial
 * abrem sem elas: este módulo só traz o `import()` e a promessa partilhada, e
 * o pedaço pesado chega quando a pessoa toca no campo do telefone (ou quando o
 * campo já abre com um número, como um rascunho reposto).
 *
 * É o MESMO módulo que o servidor usa — não uma cópia mais leve. Os metadados
 * pequenos da biblioteca só contam dígitos, e um browser a dizer «está bem» a
 * um número que o servidor recusa depois do clique é o pior desfecho possível.
 */

export type Telefones = typeof import("./contacto-do-pedido");

let carregado: Telefones | null = null;
let aCarregar: Promise<Telefones> | null = null;

/** Traz as regras (uma vez por página; as chamadas seguintes esperam pela mesma). */
export function carregarTelefones(): Promise<Telefones> {
  if (carregado) return Promise.resolve(carregado);
  aCarregar ??= import("./contacto-do-pedido").then(
    (m) => (carregado = m),
    (e) => {
      // Uma rede que falhou não pode deixar a promessa rejeitada para sempre:
      // o próximo toque no campo volta a tentar.
      aCarregar = null;
      throw e;
    },
  );
  return aCarregar;
}

/** As regras, se já chegaram; `null` se ainda não. */
export function telefonesJaCarregados(): Telefones | null {
  return carregado;
}

/**
 * As regras dentro de um componente: `null` até chegarem. Com `precisa` a
 * `false` não carrega nada — é o campo vazio, que ainda não foi tocado.
 */
export function useTelefones(precisa: boolean): Telefones | null {
  const [m, setM] = useState<Telefones | null>(carregado);
  useEffect(() => {
    if (m || !precisa) return;
    let vivo = true;
    carregarTelefones().then(
      (t) => {
        if (vivo) setM(t);
      },
      () => {
        /* sem rede: o campo fica «a verificar», e o servidor confere no envio */
      },
    );
    return () => {
      vivo = false;
    };
  }, [m, precisa]);
  return m;
}

export type EstadoDoTelefone = "vazio" | "valido" | "invalido" | "a-verificar";

/**
 * O estado de um telefone tal como o `CampoTelefone` o entrega (E.164 quando é
 * válido; senão o que está escrito, com o indicativo à frente quando o país
 * não é Portugal). Lê-se com a MESMA regra do servidor — Portugal quando não
 * há «+» —, e é por isso que o pai do campo não precisa de saber que bandeira
 * está escolhida.
 */
export function useEstadoDoTelefone(valor: string): EstadoDoTelefone {
  const vazio = !(valor ?? "").trim();
  const m = useTelefones(!vazio);
  if (vazio) return "vazio";
  if (!m) return "a-verificar";
  return m.normalizarTelefone(valor) ? "valido" : "invalido";
}

export type TextosDoTelefone = Dict["common"]["campoTelefone"];

/**
 * As frases quando não há `<LocaleProvider>` por cima — só num ecrã montado
 * sozinho num teste: na aplicação, o site e o back office têm-no sempre. São
 * as MESMAS do `pt.ts`, e o `CampoTelefone.test.tsx` prende-as lá.
 */
export const TEXTOS_DE_RECURSO: TextosDoTelefone = {
  pais: "País do número",
  procurar: "Procurar país ou indicativo",
  semResultados: "Nenhum país com esse nome.",
  invalido: "Este número não é válido para {pais} (+{codigo}).",
};

/**
 * «Este número não é válido para Reino Unido (+44).» — com o nome do país na
 * língua de quem lê (`Intl.DisplayNames`, do browser).
 */
export function fraseDoTelefoneInvalido(
  modelo: string,
  pais: string,
  codigo: string,
  locale: string,
): string {
  let nome = pais;
  try {
    nome = new Intl.DisplayNames([locale], { type: "region" }).of(pais) ?? pais;
  } catch {
    /* sem nomes no browser, fica o código do país */
  }
  return modelo.replace("{pais}", nome).replace("{codigo}", codigo);
}
