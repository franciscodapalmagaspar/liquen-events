// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fonteDoEstudio } from "../../../../../../test/ficheiros-do-estudio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BIBLIOTECA DE TEMAS ERA A ÚLTIMA FOLHA SEM FECHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todas as outras folhas e diálogos desta casa desapareciam por um `return
 * null` DELES PRÓPRIOS, e por isso resolveram-se cada uma no seu ficheiro.
 * Esta não: quem a faz desaparecer é o `ProposalStudio`, ao pôr o `picker` a
 * nulo. Sem uma alteração do lado de lá, a folha nunca chegava a ver a saída.
 *
 * O que este ficheiro guarda é o CONTRATO entre os dois, e guarda-o na fonte
 * de propósito: montar o estúdio inteiro para provar isto custaria minutos e
 * mediria sobretudo o resto do estúdio. As três peças são:
 *
 *   1. a folha ACEITA um estado de saída (`aberto`) e entrega-o ao
 *      `FolhaOuDialogo`, que é quem tem a maquinaria;
 *   2. o estúdio SEGURA o nó enquanto ela sai, em vez de o largar;
 *   3. o nó segurado é o MESMO — nunca um recriado.
 *
 * O ponto 3 não é preciosismo. Esta folha rouba o foco ao montar (está escrito
 * no próprio `ThemePicker`): um nó novo a meio da saída roubava o foco outra
 * vez, para uma caixa que já se está a apagar, e deixava quem usa teclado
 * dentro de um sítio que desapareceu 200 ms depois.
 */

const PASTA = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const fonte = (f: string) => readFileSync(join(PASTA, f), "utf8");

describe("a folha da biblioteca de temas fecha-se", () => {
  it("aceita o estado de saída e entrega-o a quem tem a maquinaria", () => {
    const s = fonte("ThemePicker.tsx");

    expect(
      s,
      "o `ThemePicker` deixou de aceitar `aberto` — o estúdio não tem como lhe dizer que está a sair",
    ).toMatch(/aberto\?: boolean;/);
    expect(
      s,
      "o `FolhaOuDialogo` voltou a receber `aberto` fixo: a folha ignora o estado de saída e volta a fechar num fotograma",
    ).toMatch(/<FolhaOuDialogo\s*\n\s*aberto=\{aberto\}/);
    expect(
      s,
      "a prop perdeu o valor por omissão — quem a monta sem saída deixaria de funcionar",
    ).toMatch(/aberto = true,/);
  });

  it("o estúdio segura o nó enquanto ela sai, e é o MESMO nó", () => {
    const s = fonteDoEstudio();

    expect(
      s,
      "o estúdio deixou de segurar a folha: volta a largá-la no fotograma do gesto",
    ).toMatch(/const aSairDoPicker = useSaidaDeUmSo\(picker !== null\);/);
    expect(
      s,
      "o que se desenha voltou a ser o `picker` cru — a folha desaparece antes de poder animar",
    ).toMatch(/\{pickerNoEcra && \(\s*\n\s*<ThemePicker/);
    expect(s, "o estúdio deixou de dizer à folha que ela está a sair").toMatch(
      /<ThemePicker\s*\n\s*aberto=\{picker !== null\}/,
    );

    // O nó tem de ser o mesmo: nada de `key` nesta folha. Uma `key` que mude
    // com a escolha remonta-a a meio da saída — e ela rouba o foco ao montar.
    const bloco = s.slice(s.indexOf("{pickerNoEcra && ("));
    const ate = bloco.slice(0, bloco.indexOf("\n      )}"));
    expect(
      ate,
      "apareceu uma `key` no `ThemePicker`: o nó passa a ser recriado e o foco é roubado a meio da saída",
    ).not.toMatch(/\bkey=/);
  });

  it("enquanto sai, lê o que estava a mostrar — e não um nulo", () => {
    const s = fonteDoEstudio();
    const bloco = s.slice(s.indexOf("{pickerNoEcra && ("));
    const ate = bloco.slice(0, bloco.indexOf("\n      )}"));

    // Durante os 200 ms da saída o `picker` JÁ É NULO. Tudo o que o bloco
    // desenha tem de vir do que ficou guardado, senão rebenta a ler `.kind` de
    // um nulo no primeiro fotograma da saída.
    expect(
      ate.match(/\bpicker\.\w/g),
      "o bloco voltou a ler `picker.` directamente: a meio da saída isso é ler de um nulo",
    ).toBeNull();
    expect(ate).toMatch(/pickerNoEcra\.kind/);
  });
});
