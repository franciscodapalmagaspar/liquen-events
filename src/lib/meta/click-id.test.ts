// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  capturarClique,
  lerClique,
  construirFbc,
  lerCookie,
  lerIdentificadores,
  serializar,
  desserializar,
  META_CLICK_KEY,
  JANELA_MS,
  INDICE_SUBDOMINIO,
  aoMudarConsentimento,
  esquecerClique,
} from "./click-id";
import { CHAVE_CONSENTIMENTO } from "./consentimento";

const FBCLID = "IwAR0abcDEF123456789_-.xyz";
const AGORA = Date.parse("2026-03-01T10:00:00.000Z");

beforeEach(() => {
  esquecerClique();
  localStorage.clear();
  // Os testes de baixo são do caminho COM consentimento; os sem ele vivem no
  // fim do ficheiro e tiram-no eles próprios.
  localStorage.setItem(CHAVE_CONSENTIMENTO, "granted");
  // Limpa os cookies que os testes deixam.
  for (const c of document.cookie.split(";")) {
    const nome = c.split("=")[0]?.trim();
    if (nome) document.cookie = `${nome}=; max-age=0; path=/`;
  }
});

describe("capturar o fbclid", () => {
  it("guarda o que vem no URL", () => {
    const r = capturarClique(`?fbclid=${FBCLID}&utm_source=ig`, "/s/comporta", AGORA);
    expect(r?.fbclid).toBe(FBCLID);
    expect(r?.pagina).toBe("/s/comporta");
    expect(lerClique(AGORA)?.fbclid).toBe(FBCLID);
  });

  it("devolve null quando não há fbclid nenhum", () => {
    expect(capturarClique("?utm_source=ig", "/s/comporta", AGORA)).toBeNull();
    expect(capturarClique("", "/", AGORA)).toBeNull();
  });

  it("O PRIMEIRO TOQUE VENCE: um clique novo não substitui o guardado", () => {
    // Dar o crédito ao segundo clique faria a campanha de remarketing parecer
    // brilhante e a campanha que faz o trabalho real parecer inútil.
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    const depois = capturarClique("?fbclid=OUTRO_CLIQUE_123", "/s/lisboa", AGORA + 86_400_000);
    expect(depois?.fbclid).toBe(FBCLID);
    expect(depois?.pagina).toBe("/s/comporta");
  });

  it("um clique expirado é apagado e deixa entrar o novo", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    const muitoDepois = AGORA + JANELA_MS + 1000;
    expect(lerClique(muitoDepois)).toBeNull();
    expect(localStorage.getItem(META_CLICK_KEY)).toBeNull();
    const novo = capturarClique("?fbclid=CLIQUE_NOVO_456", "/s/lisboa", muitoDepois);
    expect(novo?.fbclid).toBe("CLIQUE_NOVO_456");
  });

  it("recusa um valor com forma absurda", () => {
    expect(capturarClique("?fbclid=ab", "/", AGORA)).toBeNull();
    expect(capturarClique(`?fbclid=${"x".repeat(600)}`, "/", AGORA)).toBeNull();
    expect(capturarClique("?fbclid=<script>", "/", AGORA)).toBeNull();
  });

  it("não lança sobre um registo corrompido", () => {
    localStorage.setItem(META_CLICK_KEY, "isto não é JSON");
    expect(lerClique(AGORA)).toBeNull();
    localStorage.setItem(META_CLICK_KEY, JSON.stringify({ fbclid: 123 }));
    expect(lerClique(AGORA)).toBeNull();
  });
});

describe("construir o fbc", () => {
  it("tem a forma fb.<indice>.<milissegundos>.<fbclid>", () => {
    const c = { fbclid: FBCLID, em: new Date(AGORA).toISOString() };
    expect(construirFbc(c)).toBe(`fb.${INDICE_SUBDOMINIO}.${AGORA}.${FBCLID}`);
  });

  it("usa MILISSEGUNDOS, não segundos", () => {
    // Segundos aqui dariam um instante em 1970 e a Meta descartava a
    // correspondência sem dizer nada.
    const partes = construirFbc({ fbclid: FBCLID, em: new Date(AGORA).toISOString() }).split(".");
    expect(Number(partes[2])).toBe(AGORA);
    expect(String(partes[2]).length).toBeGreaterThanOrEqual(13);
  });

  it("o índice de subdomínio é 1, como a Meta manda para valores construídos", () => {
    expect(INDICE_SUBDOMINIO).toBe(1);
  });
});

describe("ler os identificadores do dispositivo", () => {
  it("o _fbc do COOKIE ganha ao construído", () => {
    // Quando o pixel correu, foi ele que gravou o cookie, e é esse o valor
    // canónico que a Meta reconhece sem margem para dúvida.
    document.cookie = "_fbp=fb.1.1700000000000.111222333; path=/";
    document.cookie = "_fbc=fb.1.1699999999999.DO_COOKIE; path=/";
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    const id = lerIdentificadores(AGORA);
    expect(id.fbc).toBe("fb.1.1699999999999.DO_COOKIE");
    expect(id.fbp).toBe("fb.1.1700000000000.111222333");
  });

  it("sem cookie, constrói o fbc a partir do clique guardado", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    expect(lerIdentificadores(AGORA).fbc).toBe(`fb.1.${AGORA}.${FBCLID}`);
  });

  it("sem cookie e sem clique, devolve os dois vazios", () => {
    expect(lerIdentificadores(AGORA)).toEqual({ fbp: "", fbc: "" });
  });

  it("lerCookie não confunde um nome que é prefixo de outro", () => {
    const cru = "_fbp_outro=errado; _fbp=certo; outra=coisa";
    expect(lerCookie("_fbp", cru)).toBe("certo");
  });
});

describe("serializar para viajar dentro do formulário", () => {
  it("ida e volta", () => {
    const id = { fbp: "fb.1.1.aaa", fbc: "fb.1.2.bbb" };
    expect(desserializar(serializar(id))).toEqual(id);
  });

  it("omite as partes vazias", () => {
    expect(serializar({ fbp: "fb.1.1.aaa", fbc: "" })).toBe("fbp=fb.1.1.aaa");
    expect(serializar({ fbp: "", fbc: "" })).toBe("");
  });

  it("desserializar nunca lança sobre lixo", () => {
    expect(desserializar("")).toEqual({ fbp: "", fbc: "" });
    expect(desserializar("qualquer coisa sem igual")).toEqual({ fbp: "", fbc: "" });
    expect(desserializar("fbp=;fbc=")).toEqual({ fbp: "", fbc: "" });
  });

  it("o fbc sobrevive à ida e volta apesar de ter pontos", () => {
    // O separador é `;` e o `=` só o primeiro conta — um fbc tem pontos e pode
    // ter `-` e `_`, e um separador mal escolhido partia-o a meio.
    const fbc = `fb.1.${AGORA}.${FBCLID}`;
    expect(desserializar(serializar({ fbp: "", fbc })).fbc).toBe(fbc);
  });
});

describe("armazenamento bloqueado", () => {
  it("sem armazenamento não há consentimento provado: nada sai nem se grava", () => {
    // Até 17/11 o clique viajava à mesma no formulário. Mas sem armazenamento
    // não se consegue ler o «Aceitar» — e negado é o lado seguro.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      expect(capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA)).toBeNull();
      expect(lerClique(AGORA)).toBeNull();
      expect(lerIdentificadores(AGORA)).toEqual({ fbp: "", fbc: "" });
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

/**
 * Auditoria legal (17/11): o `fbclid` ia para o localStorage à chegada, antes
 * de a pessoa escolher no aviso de cookies. MEDIDO num Chromium em
 * `/s/comporta?fbclid=…`: `liquen-meta-click` gravado antes de qualquer toque.
 */
describe("sem consentimento, o clique não toca no dispositivo", () => {
  beforeEach(() => {
    localStorage.removeItem(CHAVE_CONSENTIMENTO);
  });

  /** Tudo o que o browser guarda, numa cadeia, para procurar o fbclid. */
  const tudoOQueFicou = () =>
    JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage }, c: document.cookie });

  it("antes da escolha: nada no localStorage, no sessionStorage nem em cookies", () => {
    expect(capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA)).toBeNull();
    expect(tudoOQueFicou()).not.toContain(FBCLID);
    expect(localStorage.getItem(META_CLICK_KEY)).toBeNull();
    expect(lerIdentificadores(AGORA)).toEqual({ fbp: "", fbc: "" });
  });

  it("aceitar NA MESMA VISITA grava o clique da entrada, que estava só em memória", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    expect(localStorage.getItem(META_CLICK_KEY)).toBeNull();
    localStorage.setItem(CHAVE_CONSENTIMENTO, "granted");
    aoMudarConsentimento(true, AGORA + 5000);
    expect(lerClique(AGORA + 5000)?.fbclid).toBe(FBCLID);
    // A hora do clique é a da ENTRADA, não a do «Aceitar».
    expect(lerIdentificadores(AGORA + 5000).fbc).toBe(`fb.${INDICE_SUBDOMINIO}.${AGORA}.${FBCLID}`);
  });

  it("recusar: nada gravado, nada a enviar, e a memória é apagada", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    localStorage.setItem(CHAVE_CONSENTIMENTO, "denied");
    aoMudarConsentimento(false, AGORA);
    expect(tudoOQueFicou()).not.toContain(FBCLID);
    expect(lerIdentificadores(AGORA)).toEqual({ fbp: "", fbc: "" });
    // Nem uma aceitação posterior ressuscita o clique esquecido.
    localStorage.setItem(CHAVE_CONSENTIMENTO, "granted");
    aoMudarConsentimento(true, AGORA);
    expect(localStorage.getItem(META_CLICK_KEY)).toBeNull();
  });

  it("recusar depois de ter aceitado apaga o clique gravado e os cookies do pixel", () => {
    localStorage.setItem(CHAVE_CONSENTIMENTO, "granted");
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta", AGORA);
    document.cookie = `_fbc=fb.1.${AGORA}.${FBCLID}; path=/`;
    document.cookie = "_fbp=fb.1.123.456; path=/";
    expect(lerIdentificadores(AGORA).fbc).toContain(FBCLID); // controlo positivo
    localStorage.setItem(CHAVE_CONSENTIMENTO, "denied");
    aoMudarConsentimento(false, AGORA);
    expect(tudoOQueFicou()).not.toContain(FBCLID);
    expect(document.cookie).not.toContain("_fbp");
  });

  it("um clique antigo gravado com consentimento não se lê depois de o retirar", () => {
    localStorage.setItem(
      META_CLICK_KEY,
      JSON.stringify({ fbclid: FBCLID, em: new Date(AGORA).toISOString() }),
    );
    document.cookie = `_fbc=fb.1.${AGORA}.${FBCLID}; path=/`;
    expect(lerClique(AGORA)).toBeNull();
    expect(lerIdentificadores(AGORA)).toEqual({ fbp: "", fbc: "" });
  });
});
