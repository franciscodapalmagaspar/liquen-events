// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  AD_CLICK_KEY,
  JANELA_MS,
  capturarClique,
  lerClique,
  serializar,
  desserializar,
  aoMudarConsentimento,
  esquecerClique,
} from "./click-id";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPTURA DO IDENTIFICADOR DE CLIQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Toda a medição de RECEITA da conta de Ads assenta nesta peça. Se ela falhar
 * em silêncio, nada rebenta: os formulários continuam a chegar, os emails
 * continuam a sair, e a única consequência é que as conversões offline vão
 * todas vazias — descoberto três meses depois, quando já se decidiu orçamento
 * com base em dados que não existiam. Daí o teste ser desproporcionado ao
 * tamanho do ficheiro.
 */

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const GCLID = "Cj0KCQjw1JeYBhD9ARIsAHtAtLLxLdummyvalue123";

beforeEach(() => {
  esquecerClique();
  localStorage.clear();
  // Os testes de baixo são do caminho COM consentimento; os sem ele vivem no
  // fim do ficheiro (auditoria legal, 17/11).
  localStorage.setItem("liquen-consent", "granted");
});

describe("captura do identificador de clique", () => {
  it("apanha o gclid do URL e guarda-o", () => {
    const c = capturarClique(`?gclid=${GCLID}&utm_source=google`, "/casamentos/alentejo", T0);
    expect(c).toEqual({
      tipo: "gclid",
      valor: GCLID,
      em: "2026-03-01T10:00:00.000Z",
      pagina: "/casamentos/alentejo",
    });
    expect(lerClique(T0)).toEqual(c);
  });

  it.each(["gbraid", "wbraid"] as const)("apanha também o %s (tráfego de iOS)", (tipo) => {
    // A conta que só capta `gclid` perde a atribuição de parte do tráfego de
    // iPhone sem dar sinal nenhum de que a está a perder.
    const c = capturarClique(`?${tipo}=${GCLID}`, "/", T0);
    expect(c?.tipo).toBe(tipo);
    expect(c?.valor).toBe(GCLID);
  });

  it("o gclid tem precedência quando vêm vários", () => {
    const c = capturarClique(`?wbraid=${GCLID}&gclid=${GCLID}X`, "/", T0);
    expect(c?.tipo).toBe("gclid");
  });

  it("não guarda nada quando o URL não traz identificador", () => {
    expect(capturarClique("?utm_source=instagram", "/", T0)).toBeNull();
    expect(localStorage.getItem(AD_CLICK_KEY)).toBeNull();
  });

  it("recusa um valor que não tenha a forma de identificador", () => {
    // Um parâmetro colado à mão, ou lixo de um redireccionamento, não deve
    // entrar: seria enviado para a Google e rejeitado na importação, e no
    // entretanto teria ocupado o lugar de um clique verdadeiro.
    expect(capturarClique("?gclid=curto", "/", T0)).toBeNull();
    expect(capturarClique("?gclid=" + "x".repeat(300), "/", T0)).toBeNull();
    expect(capturarClique("?gclid=tem espaços aqui", "/", T0)).toBeNull();
  });

  it("PRIMEIRO toque vence — um clique novo não substitui o guardado", () => {
    // É a regra que impede a campanha de marca de roubar o crédito à campanha
    // que descobriu o cliente: quem já nos conhece pesquisa "Líquen Events".
    capturarClique(`?gclid=${GCLID}`, "/casamentos/alentejo", T0);
    const depois = capturarClique("?gclid=SEGUNDOCLIQUE12345678", "/", T0 + 86_400_000);
    expect(depois?.valor).toBe(GCLID);
    expect(depois?.pagina).toBe("/casamentos/alentejo");
  });

  it("um clique expirado é esquecido e dá lugar a um novo", () => {
    capturarClique(`?gclid=${GCLID}`, "/", T0);
    const foraDaJanela = T0 + JANELA_MS + 1;
    expect(lerClique(foraDaJanela)).toBeNull();
    // E o registo é efectivamente apagado, não apenas ignorado.
    expect(localStorage.getItem(AD_CLICK_KEY)).toBeNull();
    const novo = capturarClique("?gclid=NOVOCLIQUE1234567890", "/", foraDaJanela);
    expect(novo?.valor).toBe("NOVOCLIQUE1234567890");
  });

  it("um clique mesmo no limite da janela ainda conta", () => {
    capturarClique(`?gclid=${GCLID}`, "/", T0);
    expect(lerClique(T0 + JANELA_MS)).not.toBeNull();
  });

  it("sobrevive a lixo no armazenamento", () => {
    localStorage.setItem(AD_CLICK_KEY, "{isto não é json");
    expect(lerClique(T0)).toBeNull();
    localStorage.setItem(
      AD_CLICK_KEY,
      JSON.stringify({ tipo: "inventado", valor: GCLID, em: "x" }),
    );
    expect(lerClique(T0)).toBeNull();
    localStorage.setItem(
      AD_CLICK_KEY,
      JSON.stringify({ tipo: "gclid", valor: GCLID, em: "não é data" }),
    );
    expect(lerClique(T0)).toBeNull();
  });

  it("não lança quando o armazenamento está bloqueado", () => {
    // Navegação privada em Safari, ou consentimento de armazenamento negado.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    try {
      expect(() => lerClique(T0)).not.toThrow();
      expect(lerClique(T0)).toBeNull();
      // Sem armazenamento não se consegue ler o «Aceitar» — e negado é o lado
      // seguro (17/11): nada sai, nem no formulário desta visita.
      expect(() => capturarClique(`?gclid=${GCLID}`, "/", T0)).not.toThrow();
      expect(capturarClique(`?gclid=${GCLID}`, "/", T0)).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("ida e volta pela forma compacta", () => {
  it("serializar e desserializar preservam o registo", () => {
    const c = capturarClique(`?gclid=${GCLID}`, "/", T0)!;
    const s = serializar(c);
    expect(s).toBe(`gclid:${GCLID}@2026-03-01T10:00:00.000Z`);
    const volta = desserializar(s);
    expect(volta).toEqual({ tipo: "gclid", valor: GCLID, em: c.em });
  });

  it("desserializar recusa cadeias mal formadas", () => {
    expect(desserializar("")).toBeNull();
    expect(desserializar("gclid:semdata")).toBeNull();
    expect(desserializar(`inventado:${GCLID}@2026-03-01T10:00:00.000Z`)).toBeNull();
    expect(desserializar(`gclid:${GCLID}@não é data`)).toBeNull();
  });
});

/**
 * Auditoria legal (17/11): o gclid ia para o localStorage à chegada, antes de
 * a pessoa escolher no aviso de cookies, e viajava no formulário até à
 * importação das conversões da Google. MEDIDO num Chromium em `/?gclid=…`.
 */
describe("sem consentimento, o gclid não toca no dispositivo nem sai", () => {
  beforeEach(() => {
    localStorage.removeItem("liquen-consent");
  });

  it("antes da escolha: nada guardado, e o formulário não o leva", () => {
    expect(capturarClique(`?gclid=${GCLID}`, "/", T0)).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain(GCLID);
    expect(lerClique(T0)).toBeNull();
  });

  it("aceitar NA MESMA VISITA grava o clique da entrada", () => {
    capturarClique(`?gclid=${GCLID}`, "/servicos", T0);
    localStorage.setItem("liquen-consent", "granted");
    aoMudarConsentimento(true, T0 + 1000);
    const c = lerClique(T0 + 1000);
    expect(c?.valor).toBe(GCLID);
    expect(c?.em).toBe(new Date(T0).toISOString()); // a hora do clique, não a do «Aceitar»
    expect(localStorage.getItem(AD_CLICK_KEY)).toContain(GCLID);
  });

  it("recusar apaga a memória e o que tivesse ficado de uma aceitação anterior", () => {
    localStorage.setItem("liquen-consent", "granted");
    capturarClique(`?gclid=${GCLID}`, "/", T0);
    expect(localStorage.getItem(AD_CLICK_KEY)).toContain(GCLID); // controlo positivo
    localStorage.setItem("liquen-consent", "denied");
    aoMudarConsentimento(false, T0);
    expect(JSON.stringify({ ...localStorage })).not.toContain(GCLID);
    localStorage.setItem("liquen-consent", "granted");
    aoMudarConsentimento(true, T0);
    expect(lerClique(T0)).toBeNull();
  });

  it("um clique guardado antes não se lê depois de retirar o consentimento", () => {
    localStorage.setItem(
      AD_CLICK_KEY,
      JSON.stringify({ tipo: "gclid", valor: GCLID, em: new Date(T0).toISOString() }),
    );
    expect(lerClique(T0)).toBeNull();
  });
});
