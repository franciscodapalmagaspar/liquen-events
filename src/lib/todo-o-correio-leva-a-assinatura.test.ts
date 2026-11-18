import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUALQUER MENSAGEM QUE SAIA PARA UM CLIENTE LEVA A ASSINATURA DA CASA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Instrução dela, 20-08-2026: «quero que qualquer mensagem que seja mandada
 * tenha isto sempre predefinido».
 *
 * A assinatura já vive num sítio só (`email-assinatura.ts`), e isso resolve
 * metade: quem a usa tem-na sempre certa. A outra metade é a que este teste
 * prende — que ninguém escreva um caminho NOVO de correio ao cliente sem ela.
 * Foi exactamente assim que a casa chegou a ter cinco rodapés diferentes: cada
 * rota nova copiava o que tivesse mais à mão.
 *
 * A regra: quem chama o `sendMail` ou passa pelo `emailAoCliente`, ou está
 * nesta lista com a razão à frente. Não é uma tolerância — é uma decisão
 * escrita, e mudá-la obriga a escrever aqui porquê.
 */

/**
 * O correio que NÃO leva a assinatura, e porquê. Todos têm a mesma razão de
 * fundo: não vão para um cliente, vão para dentro de casa. Uma faixa de marca
 * e três ícones sociais num alerta que a equipa lê a si própria é peso e ruído
 * — em TODOS os envios — para não dizer nada a ninguém.
 */
const SO_PARA_DENTRO_DE_CASA: Readonly<Record<string, string>> = {
  "src/app/api/admin/recuperar/route.ts":
    "recuperação de acesso: vai para o endereço de uma pessoa da equipa, e é uma mensagem de segurança — quanto menos tiver, melhor se lê o que interessa.",
  "src/app/api/cron/backup/route.ts":
    "relatório da cópia de segurança diária: vai para a caixa da casa, não para um cliente.",
  "src/app/api/orcamento/route.ts":
    "esta rota manda DUAS mensagens: a confirmação ao cliente (que passa pelo `buildClientConfirmation` → `assinaturaDeEmail`, e leva a assinatura) e o aviso do lead à equipa, que é para dentro de casa. Ver `client-confirmation.ts`.",
};

/**
 * O correio que chega JÁ EMOLDURADO de outro ficheiro, e quem o emoldura.
 *
 * Fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`: o envio da proposta partiu-se em
 * etapas, e quem escreve o email (`email-da-proposta.ts`, que passa pelo
 * `emailAoCliente`) deixou de ser quem o manda (`mandar-o-email.ts`, que só
 * recebe o `EmailDaProposta` pronto). Aqui a guarda é o TIPO: o
 * `mandarOEmail` só aceita um `EmailEmoldurado`, que só o `emoldurar` (por
 * cima do `emailAoCliente`) cria — um email montado à mão não compila. Este
 * mapa diz à guarda de texto onde está esse ficheiro, para ela o ler também.
 */
const EMOLDURADO_POR: Readonly<Record<string, string>> = {
  "src/lib/orcamento/envio/mandar-o-email.ts": "src/lib/orcamento/envio/email-da-proposta.ts",
};

const REPO = process.cwd();

/** Os ficheiros que chamam o `sendMail`, lidos do próprio código. */
function quemMandaCorreio(): string[] {
  const saida = execFileSync("git", ["grep", "-l", "-e", "sendMail(", "--", "src/app", "src/lib"], {
    cwd: REPO,
    encoding: "utf8",
  });
  return (
    saida
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes(".test."))
      // O próprio `mail.ts` é quem o define, e o `email-logo.ts` só o menciona
      // num comentário.
      .filter((f) => f !== "src/lib/mail.ts" && f !== "src/lib/email-logo.ts")
  );
}

describe("todo o correio ao cliente leva a assinatura da casa", () => {
  const ficheiros = quemMandaCorreio();

  it("encontrou mesmo os caminhos de correio (controlo positivo)", () => {
    expect(ficheiros.length).toBeGreaterThan(5);
    // O envio da proposta saiu da rota na fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`.
    expect(ficheiros).toContain("src/lib/orcamento/envio/mandar-o-email.ts");
  });

  for (const ficheiro of ficheiros) {
    it(`${ficheiro}`, () => {
      const quemEscreve = EMOLDURADO_POR[ficheiro] ?? ficheiro;
      const fonte = readFileSync(path.join(REPO, quemEscreve), "utf8");
      const usa = fonte.includes("emailAoCliente(");
      const razao = SO_PARA_DENTRO_DE_CASA[ficheiro];
      expect(
        usa || !!razao,
        `\`${ficheiro}\` manda correio sem passar pelo \`emailAoCliente\`. ` +
          "Ou passa a usá-lo (é o que faz a assinatura, a faixa e as redes irem em todos os " +
          "emails, que é a instrução dela), ou entra em `SO_PARA_DENTRO_DE_CASA` com a razão.",
      ).toBe(true);
    });
  }

  /**
   * A lista de excepções não pode envelhecer em silêncio: um ficheiro que
   * deixe de mandar correio (ou que seja renomeado) tem de sair dela, senão a
   * próxima pessoa lê uma decisão sobre um caminho que já não existe.
   */
  it("a lista de excepções não tem entradas mortas", () => {
    for (const ficheiro of [
      ...Object.keys(SO_PARA_DENTRO_DE_CASA),
      ...Object.keys(EMOLDURADO_POR),
    ]) {
      expect(ficheiros, `\`${ficheiro}\` já não manda correio — tire-o da lista`).toContain(
        ficheiro,
      );
    }
  });

  it("cada excepção tem uma razão escrita, e não uma palavra", () => {
    for (const [ficheiro, razao] of Object.entries(SO_PARA_DENTRO_DE_CASA)) {
      expect(razao.length, `a razão de \`${ficheiro}\` é curta de mais`).toBeGreaterThan(40);
    }
  });
});
