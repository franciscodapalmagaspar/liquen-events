/**
 * O PALCO DOS RETRATOS DA ROTA DA PROPOSTA (fase 5) — o pedido, o retrato e o
 * `repor`, partilhados por `route.caracterizacao.test.ts` e por
 * `route.contra-a-antiga.test.ts`. Os duplos estão em `duplos.ts`, e cada
 * teste declara os seus `vi.mock` com eles (ver o cabeçalho de lá).
 */
import { vi } from "vitest";
import type { NextRequest } from "next/server";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import type { ProposalDoc } from "@/lib/proposal-doc";

import { ctl, DUPLOS } from "./duplos";

import { sendMail } from "@/lib/mail";
import { createProposal, updateProposal } from "@/lib/proposals-store";
import { updateQuoteWith } from "@/lib/quotes-store";
import { registarEnvio } from "@/lib/envios-de-proposta";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";
import { log } from "@/lib/logger";
import { __limparTrincosEmMemoria } from "@/lib/trinco";

export const params = Promise.resolve({ id: "q1" });

/** Um documento que passa todas as travas: uma linha com preço e artigo. */
export function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    template: "decoracao",
    ref: "PO Decoração Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: ["Decoração"],
    budgetAmounts: [3000],
    budgetArtigos: ["flores"],
    totalAmount: 3000,
    totalVatMode: "acrescer",
    totalLabel: "Valor Total Decoração",
    totalText: "",
    coverImages: [],
    ...over,
  };
}

export function chave(d: Record<string, unknown>, idioma: unknown = "pt"): string {
  const { fotosDeBiblioteca: _o, ...sem } = JSON.parse(JSON.stringify(d));
  return chaveDoPdf(sem as ProposalDoc, idioma === "en" ? "en" : "pt");
}

export function pedido(corpo: unknown, cru = false): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cru ? (corpo as string) : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

/** Um envio como o do estúdio, com a chave do PDF visto. */
export function envio(d = doc(), extra: Record<string, unknown> = {}): NextRequest {
  return pedido({ mode: "send", doc: d, pdfVisto: chave(d, extra.idioma), ...extra });
}

/** O que muda sozinho entre corridas sai do retrato. */
export function normaliza(texto: string): string {
  return (
    texto
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
      // O identificador curto de cada linha do histórico do pedido.
      .replace(/\b[0-9a-f]{10}\b/g, "<hex>")
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<instante>")
      .replace(/\d{4}-\d{2}-\d{2}/g, "<dia>")
      .replace(/\b\d{1,2} de [a-zç]+ de \d{4}\b/g, "<data por extenso>")
  );
}

export function chamadas(fn: unknown): unknown {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls;
}

/** O retrato inteiro de um pedido à rota. */
export async function retrato(res: Response): Promise<string> {
  const cabecalhos: Record<string, string | null> = {};
  for (const h of [
    "content-type",
    "content-disposition",
    "x-fotos-em-falta",
    "x-conteudo-cortado",
    "x-chave-do-pdf",
    "x-pdf-da-memoria",
  ]) {
    cabecalhos[h] = res.headers.get(h);
  }
  const ct = res.headers.get("content-type") ?? "";
  const corpo = ct.includes("pdf")
    ? `<pdf ${(await res.arrayBuffer()).byteLength} bytes>`
    : await res.text();
  // O modo de observar da fronteira (fase 6) é uma linha NOVA no registo, e
  // de propósito: fica fora do retrato, e tem os seus testes em
  // `lib/fronteira/observar.test.ts` e `lib/orcamento/envio/ler-o-corpo.test.ts`.
  const registo = (["info", "warn", "error"] as const).flatMap((nivel) =>
    vi
      .mocked(log[nivel])
      .mock.calls.filter((c) => !String(c[0]).startsWith("fronteira:"))
      .map((c) => [nivel, ...c.map((x) => (x instanceof Error ? `Error(${x.message})` : x))]),
  );
  const mail = vi.mocked(sendMail).mock.calls.map(([m]) => ({
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
    anexos: (m.attachments ?? []).map((a) => a.filename),
  }));
  return normaliza(
    JSON.stringify(
      {
        estado: res.status,
        cabecalhos,
        corpo,
        mail,
        criadas: chamadas(createProposal),
        actualizadas: chamadas(updateProposal),
        pedido: await Promise.all(
          vi.mocked(updateQuoteWith).mock.results.map((r) => r.value as Promise<unknown>),
        ).catch((e) => `rebentou: ${String(e)}`),
        copias: chamadas(registarEnvio),
        registo,
      },
      null,
      2,
    ),
  );
}

export function repor(): void {
  Object.assign(ctl, {
    autenticado: true,
    semPedido: false,
    pedidoRebenta: false,
    emailDoPedido: "cliente@example.com",
    estadoDoPedido: "pendente",
    desenhoDemora: 0,
    missing: 0,
    truncations: [],
    gravarFalhaCom: null,
    gravarFalhaSempre: false,
    marcarEnviadaFalha: false,
    pedidoFalha: false,
    copiaFalha: false,
    smtp: "ok",
    modelo: null,
    envios: [],
  });
  ctl.linhas.clear();
  __limparTrincosEmMemoria();
  esvaziarPdfsFinais();
  vi.clearAllMocks();
  for (const nivel of ["info", "warn", "error"] as const)
    vi.spyOn(log, nivel).mockImplementation(() => {});
}

/**
 * Os módulos de {@link DUPLOS} que o teste que chama NÃO substituiu — tem de
 * ser nenhum. Os `vi.mock` vivem em cada teste (é lá que o vitest os sobe), e
 * um duplo novo esquecido num deles deixava esse teste a usar o módulo
 * verdadeiro (o correio, a base) sem ninguém dar por isso.
 */
export async function duplosEsquecidos(): Promise<string[]> {
  const esquecidos: string[] = [];
  for (const modulo of Object.keys(DUPLOS)) {
    const verdadeiro = await vi.importActual(modulo);
    const visto = await import(/* @vite-ignore */ modulo);
    if (visto === verdadeiro) esquecidos.push(modulo);
  }
  return esquecidos;
}
