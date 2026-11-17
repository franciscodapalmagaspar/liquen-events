import type { Truncagens } from "./contrato";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/*
 * A resposta da PRÉ-VISUALIZAÇÃO: o PDF no corpo, e nos cabeçalhos o que o
 * estúdio precisa de saber sobre ele. Os nomes dos cabeçalhos são parte do
 * contrato com o estúdio (lidos no `ProposalStudio.tsx`), por isso vivem com o
 * domínio e não na rota — que só os passa ao `NextResponse`.
 */

/**
 * Os cabeçalhos da PRÉ-VISUALIZAÇÃO — o corpo é o PDF, e é por aqui que o
 * estúdio sabe o que o documento não leva.
 */
export function cabecalhosDaPreVisualizacao(p: {
  idioma: IdiomaDaProposta;
  rascunho: boolean;
  missingImages: number;
  truncations: Truncagens;
  chaveDoQueChegou: string;
  pdfDaMemoria: boolean;
}): Record<string, string> {
  const en = p.idioma === "en";
  return {
    "Content-Type": "application/pdf",
    // O nome do ficheiro segue a língua pedida. Quem descarrega pelo
    // estúdio nem chega a ver este nome (o botão escolhe o seu), mas quem
    // chamar a rota à mão fica com dois PDF distinguíveis na pasta em vez
    // de `proposta-preview (1).pdf`.
    "Content-Disposition": `inline; filename="${en ? "proposal-preview" : "proposta-preview"}${
      p.rascunho ? (en ? "-draft" : "-rascunho") : ""
    }.pdf"`,
    // Quantas fotos não entraram. O gerador salta a que não resolve, por
    // isso sem este cabeçalho o PDF sai com fotos a menos e o estúdio não
    // tem como saber. É lido em ProposalStudio para avisar antes de enviar.
    "X-Fotos-Em-Falta": String(p.missingImages),
    // O que o DESENHO deixou de fora (a sétima foto de um mood board, a
    // terceira linha do "Local"…) — a mesma perda, por outro caminho.
    // Vai em base64 porque o corpo desta resposta é o PDF e um cabeçalho
    // HTTP não transporta com segurança os acentos dos nomes dos campos.
    "X-Conteudo-Cortado": Buffer.from(JSON.stringify(p.truncations), "utf8").toString("base64"),
    // A chave do que se está a ver — só no PDF FINAL. O rascunho não
    // conta como visto: é o PDF que ainda não pode seguir.
    ...(p.rascunho ? {} : { "X-Chave-Do-Pdf": p.chaveDoQueChegou }),
    ...(p.pdfDaMemoria ? { "X-Pdf-Da-Memoria": "1" } : {}),
  };
}
