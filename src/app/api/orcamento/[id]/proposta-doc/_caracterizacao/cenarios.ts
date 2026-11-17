/**
 * OS CENÁRIOS DOS RETRATOS — cada um: o nome, a preparação e o pedido. São os
 * mesmos em `route.caracterizacao.test.ts` (o retrato guardado) e em
 * `route.contra-a-antiga.test.ts` (a rota antiga e a nova lado a lado).
 */
import { vi } from "vitest";
import type { NextRequest } from "next/server";
import { fecharTrinco } from "@/lib/trinco";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";
import { ctl, relogio } from "./duplos";
import { doc, envio, pedido } from "./palco";

const colunaEmFalta = (coluna: string) =>
  Object.assign(
    new Error(`Could not find the '${coluna}' column of 'proposals' in the schema cache`),
    {
      code: "PGRST204",
    },
  );

/** Cada cenário: o nome, a preparação e o pedido. */
export const CENARIOS: Array<[string, () => void, () => NextRequest]> = [
  ["401 sem sessão", () => (ctl.autenticado = false), () => envio()],
  ["404 sem pedido", () => (ctl.semPedido = true), () => envio()],
  ["500 a base cai a ler o pedido", () => (ctl.pedidoRebenta = true), () => envio()],
  [
    "409 o trinco está fechado",
    // Outro pedido a enviar a mesma proposta (o trinco verdadeiro, em memória).
    () => void fecharTrinco("envio-da-proposta:q1", 60_000),
    () => envio(),
  ],
  [
    "400 corpo do email acima do tecto",
    () => {},
    () => envio(doc(), { corpo: "x".repeat(20_001) }),
  ],
  ["400 corpo que não é JSON", () => {}, () => pedido("{isto não é json", true)],
  ["400 corpo nulo", () => {}, () => pedido(null)],
  ["400 sem documento", () => {}, () => pedido({ mode: "send" })],
  ["400 sem referência", () => {}, () => envio(doc({ ref: "" }))],
  ["400 sem nomes", () => {}, () => envio(doc({ clientNames: "" }))],
  ["400 sem as duas", () => {}, () => envio(doc({ ref: "", clientNames: "" }))],
  ["413 documento enorme", () => {}, () => envio(doc({ notas: "y".repeat(600_000) }))],
  ["422 envio sem o PDF visto", () => {}, () => envio(doc(), { pdfVisto: undefined })],
  ["422 envio sem email no pedido", () => (ctl.emailDoPedido = undefined), () => envio()],
  [
    "422 PDF final sem preços",
    () => {},
    () => pedido({ mode: "preview", doc: doc({ budgetAmounts: [] }) }),
  ],
  ["pré-visualização final", () => {}, () => pedido({ mode: "preview", doc: doc() })],
  [
    "pré-visualização rascunho",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), rascunho: true }),
  ],
  [
    "pré-visualização em inglês",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), idioma: "en" }),
  ],
  [
    "pré-visualização com idioma estranho",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), idioma: "fr" }),
  ],
  ["modo desconhecido é pré-visualização", () => {}, () => pedido({ mode: "outro", doc: doc() })],
  [
    "pré-visualização com fotos em falta e cortes",
    () => {
      ctl.missing = 2;
      ctl.truncations = [{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }];
    },
    () => pedido({ mode: "preview", doc: doc() }),
  ],
  ["409 fotos em falta por confirmar", () => (ctl.missing = 3), () => envio()],
  [
    "409 fotos aceites a menos",
    () => (ctl.missing = 3),
    () => envio(doc(), { fotosEmFaltaConfirmadas: 2 }),
  ],
  [
    "409 cortes por confirmar",
    () => (ctl.truncations = [{ where: "Capa", dropped: 1, unit: "linhas" }]),
    () => envio(),
  ],
  [
    "envio com fotos e cortes confirmados",
    () => {
      ctl.missing = 1;
      ctl.truncations = [{ where: "Capa", dropped: 1, unit: "linhas" }];
    },
    () => envio(doc(), { fotosEmFaltaConfirmadas: 1, cortesConfirmados: true }),
  ],
  ["envio normal", () => {}, () => envio()],
  ["envio em inglês", () => {}, () => envio(doc(), { idioma: "en" })],
  [
    "envio com mensagem pessoal",
    () => {},
    () => envio(doc(), { mensagem: "  Foi um gosto <3\n\nAté breve  " }),
  ],
  [
    "envio com corpo escrito à mão",
    () => {},
    () =>
      envio(doc(), {
        corpo: "Olá!\n\nA proposta: {{link_proposta}}",
        assunto: "A vossa proposta",
        modelo: "registo-formal",
      }),
  ],
  [
    "envio com o modelo dela",
    () =>
      (ctl.modelo = {
        assunto: "Proposta {cliente_nome}",
        corpo: "<p>Olá {cliente_nome}, {link}</p>",
      }),
    () => envio(),
  ],
  ["envio só pelo WhatsApp", () => {}, () => envio(doc(), { porEmail: false })],
  ["envio fora de um casamento", () => {}, () => envio(doc({ eventType: "Jantar de empresa" }))],
  ["SMTP não configurado", () => (ctl.smtp = "nao-configurado"), () => envio()],
  ["SMTP rebenta", () => (ctl.smtp = "rebenta"), () => envio()],
  ["a cópia do envio falha", () => (ctl.copiaFalha = true), () => envio()],
  ["o pedido não actualiza", () => (ctl.pedidoFalha = true), () => envio()],
  ["a marcação «enviada» falha", () => (ctl.marcarEnviadaFalha = true), () => envio()],
  ["coluna `doc` em falta", () => (ctl.gravarFalhaCom = colunaEmFalta("doc")), () => envio()],
  [
    "tabela em falta sem nomear a coluna",
    () =>
      (ctl.gravarFalhaCom = Object.assign(new Error("relation proposals does not exist"), {
        code: "42P01",
      })),
    () => envio(),
  ],
  [
    "a base recusa tudo",
    () => {
      ctl.gravarFalhaSempre = true;
      ctl.gravarFalhaCom = Object.assign(new Error("relation proposals does not exist"), {
        code: "42P01",
      });
    },
    () => envio(),
  ],
  [
    "422 o domínio do email não recebe correio",
    () => vi.mocked(dominioRecebeEmail).mockResolvedValueOnce(false),
    () => envio(),
  ],
  ["pedido já ganho: a proposta fica aceite", () => (ctl.estadoDoPedido = "aceite"), () => envio()],
  [
    "sem tempo para o email",
    () => {
      relogio.agora = Date.now();
      ctl.desenhoDemora = 40_000;
      vi.spyOn(Date, "now").mockImplementation(() => relogio.agora);
    },
    () => envio(),
  ],
  [
    "503 avaria qualquer a gravar",
    () => (ctl.gravarFalhaCom = new Error("timeout")),
    () => envio(),
  ],
];

/**
 * Os corpos ESTRANHOS — o que nenhum ecrã manda, e é onde uma leitura nova se
 * engana sem dar por isso (a revisão de 17/11 apanhou um: um `doc` que é texto
 * passou a responder «falta o documento»). Estes retratos foram tirados depois
 * de partir a rota; certifica-os `route.contra-a-antiga.test.ts`, contra a
 * rota ANTIGA.
 */
export const ESTRANHOS: Array<[string, () => NextRequest, (() => void)?]> = [
  ["doc texto", () => pedido({ mode: "send", doc: "x" })],
  ["doc número", () => pedido({ mode: "send", doc: 5 })],
  ["doc true", () => pedido({ mode: "preview", doc: true })],
  ["doc lista", () => pedido({ mode: "send", doc: [] })],
  ["corpo lista", () => pedido([1, 2])],
  ["corpo número", () => pedido(7)],
  ["corpo texto", () => pedido("ola")],
  ["mode número", () => pedido({ mode: 1, doc: doc() })],
  ["idioma objecto", () => pedido({ mode: "preview", doc: doc(), idioma: { a: 1 } })],
  ["idioma null", () => pedido({ mode: "preview", doc: doc(), idioma: null })],
  [
    "idioma que nem se converte em texto, sem documento",
    () => pedido(JSON.parse('{"mode":"send","idioma":{"toString":1}}')),
  ],
  [
    "idioma que nem se converte em texto, com documento",
    () => pedido({ ...JSON.parse('{"mode":"preview","idioma":{"toString":1}}'), doc: doc() }),
  ],
  ["rascunho texto", () => pedido({ mode: "preview", doc: doc(), rascunho: "true" })],
  ["porEmail 0", () => envio(doc(), { porEmail: 0 })],
  ["porEmail null", () => envio(doc(), { porEmail: null })],
  ["pdfVisto número", () => envio(doc(), { pdfVisto: 5 })],
  ["corpo número no email", () => envio(doc(), { corpo: 42 })],
  ["assunto sem corpo", () => envio(doc(), { assunto: "So o assunto" })],
  [
    "modelo número, com um modelo guardado",
    () => envio(doc(), { modelo: 3 }),
    () => (ctl.modelo = { assunto: "Proposta {cliente_nome}", corpo: "<p>Olá {link}</p>" }),
  ],
  ["mensagem só espaços", () => envio(doc(), { mensagem: "   " })],
  [
    "fotos negativas, com fotos em falta",
    () => envio(doc(), { fotosEmFaltaConfirmadas: -1 }),
    () => (ctl.missing = 1),
  ],
  [
    "fotos a true, com fotos em falta",
    () => envio(doc(), { fotosEmFaltaConfirmadas: true }),
    () => (ctl.missing = 1),
  ],
  [
    "cortes em texto, com um corte",
    () => envio(doc(), { cortesConfirmados: "true" }),
    () => (ctl.truncations = [{ where: "Capa", dropped: 1, unit: "linhas" }]),
  ],
  ["ref número", () => envio(doc({ ref: 7 }))],
  ["clientNames lista", () => envio(doc({ clientNames: ["a"] }))],
  ["doc sem nada", () => envio({})],
];

/**
 * As SEQUÊNCIAS — vários pedidos seguidos ao mesmo pedido do cliente, onde
 * vivem as irmãs, a versão, a proposta «por enviar» reaproveitada, a leitura
 * do registo de envios e as três respostas de repetição. Cada pedido tira o
 * seu retrato (com os duplos limpos antes), e a sequência inteira compara-se.
 * Um pedido pode mudar o `ctl` antes de sair (o SMTP que volta, por exemplo).
 */
export const SEQUENCIAS: Array<[string, () => void, Array<() => NextRequest>]> = [
  ["o mesmo envio duas vezes", () => {}, [() => envio(), () => envio()]],
  [
    "o WhatsApp duas vezes",
    () => {},
    [() => envio(doc(), { porEmail: false }), () => envio(doc(), { porEmail: false })],
  ],
  [
    "a marcação falha, e ela reenvia",
    () => (ctl.marcarEnviadaFalha = true),
    [() => envio(), () => envio()],
  ],
  [
    "o WhatsApp, e depois o email",
    () => {},
    [() => envio(doc(), { porEmail: false }), () => envio()],
  ],
  [
    "duas pré-visualizações, e o envio",
    () => {},
    [
      () => pedido({ mode: "preview", doc: doc() }),
      () => pedido({ mode: "preview", doc: doc() }),
      () => envio(),
    ],
  ],
  [
    "um documento, e depois outro: a versão sobe",
    () => {},
    [
      () => envio(),
      () => envio(doc({ ref: "PO Decoração Outra", totalAmount: 3500, budgetAmounts: [3500] })),
    ],
  ],
  [
    "o correio em baixo, e depois em cima: a «por enviar» reaproveita-se",
    () => (ctl.smtp = "nao-configurado"),
    [
      () => envio(),
      () => {
        ctl.smtp = "ok";
        return envio();
      },
    ],
  ],
  [
    "o registo de envios não responde, com uma irmã que já seguiu",
    () => {},
    [
      () => envio(),
      () => {
        ctl.enviosRebentam = true;
        return envio();
      },
    ],
  ],
];
