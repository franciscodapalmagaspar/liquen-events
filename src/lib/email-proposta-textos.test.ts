import { describe, it, expect } from "vitest";
import {
  nomeDoFicheiroDaProposta,
  paragrafoDoQueMudou,
  resumoDaPropostaParaCopiar,
  textosDoEmailDaProposta,
} from "./email-proposta-textos";
import type { Mudanca } from "./orcamento/diferencas";
import type { ProposalMoney } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE LEVA A PROPOSTA FALA A LÍNGUA DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas exigências, e são as duas que este ficheiro guarda:
 *
 *  1. O PORTUGUÊS NÃO MUDA UMA VÍRGULA. Estas frases são as que saem desde
 *     sempre no email da proposta; foram tiradas da rota para aqui sem lhes
 *     tocar. Um casal português tem de receber, palavra por palavra, o email
 *     que receberia antes desta funcionalidade existir.
 *  2. O INGLÊS É INGLÊS ATÉ AO FIM. Não é meio traduzido: o assunto, o título,
 *     o cumprimento, a frase, o botão e o nome do ficheiro em anexo. Um único
 *     «Olá» ou «Ver» que sobrasse era a marca de duas mãos no mesmo email, que
 *     é precisamente o que se está a corrigir.
 */
describe("textosDoEmailDaProposta", () => {
  const pt = textosDoEmailDaProposta("pt");
  const en = textosDoEmailDaProposta("en");

  /**
   * ── ESTE TESTE MUDOU DE AFIRMAÇÃO, E DIZ PORQUÊ ────────────────────────
   *
   * Dizia «o português é EXACTAMENTE o que a rota mandava antes»: nasceu de um
   * refactor, e o que prendia era que mover as frases da rota para aqui não
   * lhes tocasse numa vírgula.
   *
   * Agora tocou-se, de propósito. Uma proposta de casamento é para DUAS
   * pessoas, e o email dizia «o seu evento» a um casal. O que se prende passa
   * a ser a voz: nenhuma frase do email da casa trata quem lê por uma pessoa
   * só. Manter a afirmação antiga era prender a página ao que ela deixou de
   * querer, e um teste que se corrige a cada mudança de texto não prende nada.
   */
  it("nenhuma frase da casa trata o casal por uma pessoa só", () => {
    expect(pt.assunto).toBe("A vossa proposta — Líquen Events");
    expect(pt.titulo).toBe("A vossa proposta — Líquen Events");
    expect(pt.ola).toBe("Olá");
    expect(pt.intro).toBe(
      "Segue em anexo a proposta que preparámos para o vosso dia. Podem vê-la e responder online no botão abaixo.",
    );
    expect(pt.introEmTexto).toBe("Segue em anexo a proposta que preparámos para o vosso dia.");
    expect(pt.botao).toBe("Ver a proposta →");
    expect(pt.verOnline).toBe("Ver online:");

    // E o varrimento, que é o que apanha a frase que alguém acrescentar amanhã.
    for (const [campo, frase] of Object.entries(pt)) {
      if (typeof frase !== "string") continue;
      expect(frase, campo).not.toMatch(/\b(o seu|a sua|do seu|da sua|ao seu|à sua)\b/i);
    }

    // Sem nome de casal, o ficheiro continua a chamar-se pela referência —
    // exactamente como a rota sempre o chamou.
    expect(pt.nomeDoAnexo({ ref: "q1" })).toBe("Proposta-Liquen-q1.pdf");
  });

  it("o inglês está todo escrito, sem um campo por traduzir", () => {
    // Compara-se com o português: um campo esquecido sai igual nas duas
    // línguas, e é assim que se apanha sem ter de escrever aqui a tradução
    // toda outra vez.
    expect(en.assunto).not.toBe(pt.assunto);
    expect(en.titulo).not.toBe(pt.titulo);
    expect(en.ola).not.toBe(pt.ola);
    expect(en.intro).not.toBe(pt.intro);
    expect(en.introEmTexto).not.toBe(pt.introEmTexto);
    expect(en.botao).not.toBe(pt.botao);
    expect(en.verOnline).not.toBe(pt.verOnline);
    expect(en.nomeDoAnexo({ ref: "q1" })).not.toBe(pt.nomeDoAnexo({ ref: "q1" }));
  });

  it("e não tem uma palavra portuguesa lá dentro", () => {
    // As palavras que mais facilmente sobrevivem a uma tradução apressada,
    // porque são curtas e estão no meio de markup.
    const tudo = [en.assunto, en.titulo, en.ola, en.intro, en.introEmTexto, en.botao, en.verOnline]
      .join(" ")
      .toLowerCase();
    for (const palavra of ["olá", "proposta", "anexo", "evento", "responder", "seu", "sua"]) {
      expect(tudo).not.toContain(palavra);
    }
    // O nome da casa não é uma palavra portuguesa: é o nome dela, e fica.
    expect(en.assunto).toContain("Líquen Events");
  });

  it("o anexo inglês distingue-se do português na pasta de transferências", () => {
    // Um casal que receba as duas versões (acontece: a portuguesa aos pais, a
    // inglesa ao casal) não pode ficar com «Proposta-Liquen-q1 (1).pdf».
    expect(en.nomeDoAnexo({ ref: "q1" })).toBe("Proposal-Liquen-q1.pdf");
  });

  it("o que não é uma língua conhecida cai no português", () => {
    // Defesa em profundidade: quem chama já resolveu a língua com o
    // `idiomaDaProposta`, mas esta folha nunca pode devolver `undefined` e
    // fazer sair um email com buracos.
    expect(textosDoEmailDaProposta("fr" as never)).toEqual(pt);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RESUMO PARA COLAR NO WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("resumoDaPropostaParaCopiar", () => {
  const dados = {
    clientNames: "Maria & Zé",
    eventDate: "3 de julho de 2027",
    aPagar: "3.690,00 €",
  };

  it("as três linhas, em português", () => {
    const texto = resumoDaPropostaParaCopiar(dados, "pt");
    expect(texto).toBe(
      "Proposta Líquen Events, Maria & Zé\nData do evento: 3 de julho de 2027\nValor a pagar: 3.690,00 €",
    );
  });

  it("as três linhas, em inglês, sem uma palavra portuguesa", () => {
    const texto = resumoDaPropostaParaCopiar(dados, "en");
    expect(texto).toBe(
      "Líquen Events proposal, Maria & Zé\nEvent date: 3 de julho de 2027\nAmount to pay: 3.690,00 €",
    );
    // O nome e a data são texto dela — não se traduzem. Só os rótulos mudam.
    for (const palavra of ["data do evento", "valor a pagar", "proposta líquen"]) {
      expect(texto.toLowerCase()).not.toContain(palavra);
    }
  });

  it("o link só entra quando existe", () => {
    const sem = resumoDaPropostaParaCopiar(dados, "pt");
    expect(sem).not.toContain("http");
    const com = resumoDaPropostaParaCopiar(
      { ...dados, link: "https://liquen-events.com/proposta/abc.sig" },
      "pt",
    );
    expect(com.split("\n")).toHaveLength(4);
    expect(com).toContain("Proposta: https://liquen-events.com/proposta/abc.sig");
  });

  it("um link em branco não deixa uma linha vazia a apontar para nada", () => {
    const texto = resumoDaPropostaParaCopiar({ ...dados, link: "   " }, "pt");
    expect(texto.split("\n")).toHaveLength(3);
  });

  it("sem data marcada, diz que está por marcar em vez de deixar a linha em branco", () => {
    const texto = resumoDaPropostaParaCopiar({ ...dados, eventDate: "" }, "pt");
    expect(texto).toContain("Data do evento: por marcar");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PARÁGRAFO DO QUE MUDOU
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("paragrafoDoQueMudou", () => {
  const money = (gross: number): ProposalMoney => ({
    base: gross / 1.23,
    vat: gross - gross / 1.23,
    gross,
    vatRate: 0.23,
    mode: "incluido",
  });

  it("sem mudança nenhuma, não há parágrafo (primeira versão)", () => {
    expect(paragrafoDoQueMudou([], { antes: money(3500), depois: money(3500) }, "pt")).toBeNull();
  });

  it("só o total muda: uma frase, em português", () => {
    const mudancas: Mudanca[] = [
      { onde: "Total", tipo: "alterado", texto: "O total passou de 3.500,00 € para 4.200,00 €" },
    ];
    const texto = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(4200) }, "pt");
    expect(texto).toBe("Desde a última proposta: o total passou de 3.500,00 € para 4.200,00 €.");
  });

  it("categoria e total juntos, em inglês, sem travessão longo", () => {
    const mudancas: Mudanca[] = [
      { onde: "Total", tipo: "alterado", texto: "…" },
      {
        onde: "Orçamento",
        tipo: "acrescentado",
        texto: 'Entrou "Wedding Coordinator" por 1.500,00 €',
      },
    ];
    const texto = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(5000) }, "en");
    expect(texto).toBe(
      "Since the last proposal: there were changes to the budget; the total went from €3,500.00 to €5,000.00.",
    );
    expect(texto).not.toContain("—");
    // Nenhuma palavra portuguesa a meio da frase inglesa.
    for (const palavra of ["orçamento", "última", "desde"]) {
      expect(texto!.toLowerCase()).not.toContain(palavra);
    }
  });

  it("duas categorias juntam-se com 'e' / 'and'", () => {
    const mudancas: Mudanca[] = [
      { onde: "Orçamento", tipo: "acrescentado", texto: "x" },
      { onde: "Serviços", tipo: "acrescentado", texto: "y" },
    ];
    const pt = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt");
    expect(pt).toBe("Desde a última proposta: houve alterações em o orçamento e os serviços.");
    const en = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "en");
    expect(en).toBe("Since the last proposal: there were changes to the budget and the services.");
  });

  it("só o MODO de IVA muda (o casal paga o mesmo): sem parágrafo, em vez de inventar uma frase", () => {
    // `diferencas` regista este caso como uma mudança em "Total", mas o bruto
    // não se mexe — não há um "passou de X para Y" honesto para dizer aqui.
    const mudancas: Mudanca[] = [
      {
        onde: "Total",
        tipo: "alterado",
        texto: "O total passou a ser apresentado com IVA incluído",
      },
    ];
    expect(
      paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt"),
    ).toBeNull();
  });

  it("usa dinheiroDaProposta (o gross recebido), não uma conta própria", () => {
    // Uma prova directa de que a frase usa exactamente os números que lhe são
    // passados — que é o que `dinheiroDaProposta` (e não `resolveProposalMoney`)
    // já corrige a montante, em `diferencas.ts`.
    const mudancas: Mudanca[] = [{ onde: "Total", tipo: "alterado", texto: "…" }];
    const texto = paragrafoDoQueMudou(
      mudancas,
      { antes: money(1000), depois: money(1906.5) },
      "pt",
    );
    expect(texto).toContain("1.000,00 €");
    expect(texto).toContain("1.906,50 €");
  });

  it("categoria desconhecida (uma versão futura de diferencas.ts) não rebenta, só não entra na frase", () => {
    const mudancas: Mudanca[] = [{ onde: "Uma Categoria Nova", tipo: "alterado", texto: "x" }];
    expect(
      paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt"),
    ).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NOME DO FICHEIRO É O QUE O CASAL ARQUIVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Era a referência INTERNA do pedido — em produção um `randomUUID()`. O casal
 * ficava com `Proposta-Liquen-8f3c1a2e-….pdf` na pasta de transferências e
 * reencaminhava-o aos pais com esse nome. A mesma decisão que já tinha tirado o
 * identificador do email («o `randomUUID()` da nossa base não é referência de
 * ninguém») não tinha chegado ao ficheiro.
 */
describe("o nome do ficheiro da proposta", () => {
  it("leva a casa, o casal e a data do evento", () => {
    expect(
      nomeDoFicheiroDaProposta(
        { clientNames: "Maria & Zé", eventDate: "12 de setembro de 2026", ref: "8f3c1a2e" },
        "pt",
      ),
    ).toBe("Proposta-Liquen-Events-Maria-e-Ze-12-09-2026.pdf");
  });

  it("e em inglês distingue-se, para as duas versões não se atropelarem", () => {
    // Ela manda a portuguesa aos pais e a inglesa ao casal; com o mesmo nome, a
    // segunda ficava «(1).pdf» na pasta de quem as recebesse.
    const dados = { clientNames: "Maria & Zé", eventDate: "12 de setembro de 2026", ref: "q1" };
    expect(nomeDoFicheiroDaProposta(dados, "en")).toBe(
      "Proposal-Liquen-Events-Maria-and-Ze-12-09-2026.pdf",
    );
    expect(nomeDoFicheiroDaProposta(dados, "en")).not.toBe(nomeDoFicheiroDaProposta(dados, "pt"));
  });

  it("o «&» diz-se na língua da proposta: «Anna-and-John», não «Anna-e-John» (13/11)", () => {
    const casal = { clientNames: "Anna & John", eventDate: "12 de setembro de 2026", ref: "q1" };
    expect(nomeDoFicheiroDaProposta(casal, "en")).toBe(
      "Proposal-Liquen-Events-Anna-and-John-12-09-2026.pdf",
    );
    expect(nomeDoFicheiroDaProposta(casal, "pt")).toBe(
      "Proposta-Liquen-Events-Anna-e-John-12-09-2026.pdf",
    );
    expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: "Anna & John" }, "en")).toBe(
      "Anna-and-John.pdf",
    );
  });

  it("nada de acentos, de «&» nem de espaços — o nome viaja num cabeçalho", () => {
    const nome = nomeDoFicheiroDaProposta(
      {
        clientNames: "Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard",
        eventDate: "12 de setembro de 2026",
        ref: "q1",
      },
      "pt",
    );
    expect(nome, "só letras, números, hífenes e o ponto da extensão").toMatch(
      /^[A-Za-z0-9-]+\.pdf$/,
    );
    // E não fica infinito: corta-se num hífen, nunca a meio de uma palavra.
    expect(nome.length).toBeLessThan(90);
    expect(nome).not.toMatch(/-\.pdf$/);
  });

  it("uma data que o estúdio não escreveu não entra no nome", () => {
    // O campo é texto livre: «a definir», «Verão de 2027». O que não se
    // reconhece fica de fora, em vez de ir para o nome do ficheiro como está.
    expect(
      nomeDoFicheiroDaProposta(
        { clientNames: "Maria & Zé", eventDate: "a definir", ref: "q1" },
        "pt",
      ),
    ).toBe("Proposta-Liquen-Events-Maria-e-Ze.pdf");
  });

  it("sem casal nenhum, volta à referência — e não a um nome vazio", () => {
    expect(nomeDoFicheiroDaProposta({ clientNames: "   ", ref: "q1" }, "pt")).toBe(
      "Proposta-Liquen-q1.pdf",
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NOME ESCRITO POR ELA MANDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «gostava de poder editar o nome do pdf que vai ser gerado».
 *
 * A composição automática acerta na maioria dos casos e não acerta em todos —
 * duas propostas para o mesmo casal, uma versão para os pais e outra para eles.
 * Escrito, o nome dela manda; e manda em todos os sítios, porque é esta função
 * que nomeia o anexo do email, a descarga do link do casal, o portal e o botão
 * do estúdio.
 */
describe("o nome escrito à mão", () => {
  const casal = { clientNames: "Maria & Zé", eventDate: "12 de setembro de 2026", ref: "q1" };

  it("substitui a composição inteira — sem casa, sem casal, sem data", () => {
    expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: "Proposta Torre de Palma" }, "pt")).toBe(
      "Proposta-Torre-de-Palma.pdf",
    );
  });

  it("e manda também em inglês: quem escreve o nome escreve-o para os dois", () => {
    expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: "Wedding proposal" }, "en")).toBe(
      "Wedding-proposal.pdf",
    );
  });

  it("um «.pdf» escrito no fim não sai a dobrar", () => {
    // Metade das pessoas escreve a extensão. «Proposta.pdf.pdf» é o género de
    // detalhe que faz uma funcionalidade nova parecer partida à primeira vez.
    expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: "Proposta.pdf" }, "pt")).toBe(
      "Proposta.pdf",
    );
    expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: "Proposta.PDF" }, "pt")).toBe(
      "Proposta.pdf",
    );
  });

  it("passa pela mesma limpeza: acentos, «&» e sinais fora", () => {
    // A razão é a mesma da composição — um acento num anexo ainda hoje chega
    // partido a alguns clientes de correio, e o mesmo nome viaja num
    // `Content-Disposition`.
    expect(
      nomeDoFicheiroDaProposta({ ...casal, escolhido: "Proposta Ana & José / 2027" }, "pt"),
    ).toBe("Proposta-Ana-e-Jose-2027.pdf");
  });

  it("um nome que não sobrevive à limpeza vale o mesmo que nada", () => {
    // `-.pdf` era pior do que qualquer nome composto.
    for (const escrito of ["   ", "///", "!!!", ".pdf"]) {
      expect(nomeDoFicheiroDaProposta({ ...casal, escolhido: escrito }, "pt")).toBe(
        "Proposta-Liquen-Events-Maria-e-Ze-12-09-2026.pdf",
      );
    }
  });

  it("e ausente, tudo continua exactamente como estava", () => {
    // Controlo positivo: sem isto, os testes acima passariam com a composição
    // desligada — e a maioria das propostas não leva nome escrito nenhum.
    expect(nomeDoFicheiroDaProposta(casal, "pt")).toBe(
      "Proposta-Liquen-Events-Maria-e-Ze-12-09-2026.pdf",
    );
  });

  it("um nome muito comprido é cortado, e nunca acaba num hífen", () => {
    const nome = nomeDoFicheiroDaProposta(
      {
        ...casal,
        escolhido:
          "Proposta de decoracao e organizacao para o casamento de Maria Madalena e Jose Alberto na Herdade da Malhadinha Nova",
      },
      "pt",
    );
    expect(nome.length).toBeLessThanOrEqual(85);
    expect(nome).not.toMatch(/-\.pdf$/);
  });
});
