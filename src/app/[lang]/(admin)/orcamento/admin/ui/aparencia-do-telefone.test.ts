import { describe, expect, it } from "vitest";
import { TELEFONE_EM_CAIXA } from "./aparencia-do-telefone";

/**
 * O `admin.css` dá a todo o `.bo-input` um `width: 100%`. O botão da bandeira
 * não encolhe, e sem o `w-auto` ficava com a linha inteira: o número era
 * esmagado a 26 px e saía da margem a 375 px. Apanhado pelo passeio
 * `admin-mobile` («o painel de um pedido também se toca com o dedo»); isto
 * prende-o sem precisar de um browser.
 */
describe("o botão da bandeira na caixa do back office", () => {
  it("não herda a largura toda do `.bo-input`", () => {
    expect(TELEFONE_EM_CAIXA.botao.split(/\s+/)).toContain("bo-input");
    expect(TELEFONE_EM_CAIXA.botao.split(/\s+/)).toContain("w-auto");
  });
});
