/**
 * OS DUPLOS DA ROTA DA PROPOSTA (fase 5) — o painel de controlo (`ctl`) e o
 * que cada módulo verdadeiro passa a ser nos retratos.
 *
 * Não importa NENHUM dos módulos que substitui (só tipos e o `vitest`): os
 * `vi.mock` de cada teste vêm buscar os duplos aqui, dentro da fábrica, e a
 * fábrica não pode depender do módulo que está a fabricar. Os `vi.mock` ficam
 * no ficheiro de teste (é lá que o vitest os sobe para o topo), por isso a
 * ordem dos imports deixa de importar.
 *
 * `ctl` liga o que cada cenário quer (sem sessão, fotos em falta, SMTP em
 * baixo…); `repor()` (em `palco.ts`) põe tudo como estava.
 */
import { vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";

export const relogio = { agora: 0 };
export const ctl = {
  autenticado: true,
  semPedido: false,
  pedidoRebenta: false,
  emailDoPedido: "cliente@example.com" as string | undefined,
  estadoDoPedido: "pendente",
  /** Quantos ms «demora» cada desenho do PDF (o relógio da rota anda com ele). */
  desenhoDemora: 0,
  missing: 0,
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
  gravarFalhaCom: null as unknown,
  gravarFalhaSempre: false,
  marcarEnviadaFalha: false,
  pedidoFalha: false,
  copiaFalha: false,
  smtp: "ok" as "ok" | "nao-configurado" | "rebenta",
  modelo: null as null | { assunto: string; corpo: string },
  linhas: new Map<string, Proposal>(),
  envios: [] as Array<Record<string, unknown>>,
  /** A leitura do registo de envios falha (`listarEnvios` rejeita). */
  enviosRebentam: false,
};

/** Módulo → a fábrica do duplo (a mesma forma que o `vi.mock` recebe). */
export const DUPLOS = {
  "@/lib/admin-auth": () => ({
    isAuthed: () => ctl.autenticado,
    assinaturaConfigurada: () => ({}),
  }),
  "@/lib/quotes-store": () => ({
    getQuote: vi.fn(async (id: string) => {
      if (ctl.pedidoRebenta) throw new Error("a base caiu");
      if (ctl.semPedido) return null;
      return { id, name: "Mãe da Noiva", email: ctl.emailDoPedido, status: "pendente" };
    }),
    updateQuoteWith: vi.fn(
      async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
        if (ctl.pedidoFalha) throw new Error("a base recusou o pedido");
        return mutar({ id, email: ctl.emailDoPedido, status: ctl.estadoDoPedido, activityLog: [] });
      },
    ),
  }),
  "@/lib/proposals-store": () => ({
    createProposal: vi.fn(async (p: Proposal) => {
      if (ctl.gravarFalhaSempre) throw ctl.gravarFalhaCom;
      if (ctl.gravarFalhaCom) {
        const e = ctl.gravarFalhaCom;
        ctl.gravarFalhaCom = null;
        throw e;
      }
      ctl.linhas.set(p.id, { ...p });
    }),
    updateProposal: vi.fn(async (id: string, patch: Partial<Proposal>) => {
      if (ctl.marcarEnviadaFalha && patch.status === "enviada") return null;
      const actual = ctl.linhas.get(id);
      if (!actual) return null;
      const novo = { ...actual, ...patch };
      ctl.linhas.set(id, novo);
      return novo;
    }),
    listProposalsForQuote: vi.fn(async (q: string) =>
      [...ctl.linhas.values()].filter((p) => p.quoteId === q),
    ),
  }),
  "@/lib/contracts-store": () => ({
    newContractId: () => "c1",
    createContractIfAbsent: vi.fn(async () => undefined),
    deleteContract: vi.fn(async () => undefined),
    getContractByProposal: vi.fn(async () => null),
  }),
  "@/lib/proposal-doc-render": () => ({
    renderStoredEditorialPdfWithReport: vi.fn(async () => ({
      ...(ctl.desenhoDemora ? { _: (relogio.agora += ctl.desenhoDemora) } : {}),
      pdf: Buffer.from("%PDF-1.4 caracterizacao"),
      missingImages: ctl.missing,
      truncations: ctl.truncations,
    })),
  }),
  "@/lib/email-templates-store": async (original: () => Promise<unknown>) => {
    const real = (await original()) as typeof import("@/lib/email-templates-store");
    return { ...real, getTemplate: vi.fn(async () => ctl.modelo) };
  },
  "@/lib/proposta-link-curto": () => ({
    enderecoDaProposta: async () => "https://liquen-events.com/proposta/tok",
    enderecoDoPdfDaProposta: (url: string) =>
      `${url.replace(/\/proposta\/([^/]+)$/, "/api/proposta/$1")}/pdf`,
  }),
  "@/lib/mail": () => ({
    sendMail: vi.fn(async () => {
      if (ctl.smtp === "rebenta") throw new Error("credenciais erradas");
      return { sent: ctl.smtp === "ok" };
    }),
    esc: (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    MAIL_TO: "team@example.com",
  }),
  "@/lib/envios-de-proposta": () => ({
    registarEnvio: vi.fn(async (_q: string, envio: Record<string, unknown>) => {
      if (ctl.copiaFalha) throw new Error("app_state recusou");
      ctl.envios.push(envio);
      return { gravado: true };
    }),
    listarEnvios: vi.fn(async () => {
      if (ctl.enviosRebentam) throw new Error("app_state em baixo");
      return ctl.envios;
    }),
  }),
  "@/lib/proposta-fotos-verificacao": () => ({
    fotosEscolhidasQueFaltam: vi.fn(async () => []),
  }),
  "@/lib/proposal-pdf-guardado": () => ({
    guardarPdfDaProposta: vi.fn(async () => true),
  }),
};
