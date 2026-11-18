import {
  CABECALHOS_DA_PRE_VISUALIZACAO as CABECALHO,
  cortesEmCabecalho,
  type CabecalhosDaPreVisualizacao,
  type Truncagens,
} from "./contrato";
import type { IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/*
 * A resposta da PRÉ-VISUALIZAÇÃO: o PDF no corpo, e nos cabeçalhos o que o
 * estúdio precisa de saber sobre ele. Os nomes dos cabeçalhos são parte do
 * contrato com o estúdio (`contrato.ts`, que o `ProposalStudio.tsx` também lê),
 * por isso vivem com o domínio e não na rota — que só os passa ao `NextResponse`.
 */

/** O nome do ficheiro, por língua — uma língua nova não compila sem o seu. */
const NOME_DO_FICHEIRO: Record<IdiomaDaProposta, { base: string; rascunho: string }> = {
  pt: { base: "proposta-preview", rascunho: "-rascunho" },
  en: { base: "proposal-preview", rascunho: "-draft" },
};

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
}): CabecalhosDaPreVisualizacao {
  const nome = NOME_DO_FICHEIRO[p.idioma];
  return {
    "Content-Type": "application/pdf",
    // O nome do ficheiro segue a língua pedida. Quem descarrega pelo
    // estúdio nem chega a ver este nome (o botão escolhe o seu), mas quem
    // chamar a rota à mão fica com dois PDF distinguíveis na pasta em vez
    // de `proposta-preview (1).pdf`.
    "Content-Disposition": `inline; filename="${nome.base}${p.rascunho ? nome.rascunho : ""}.pdf"`,
    // Quantas fotos não entraram. O gerador salta a que não resolve, por
    // isso sem este cabeçalho o PDF sai com fotos a menos e o estúdio não
    // tem como saber. É lido em ProposalStudio para avisar antes de enviar.
    [CABECALHO.fotosEmFalta]: String(p.missingImages),
    // O que o DESENHO deixou de fora (a sétima foto de um mood board, a
    // terceira linha do "Local"…) — a mesma perda, por outro caminho.
    // Vai em base64 porque o corpo desta resposta é o PDF e um cabeçalho
    // HTTP não transporta com segurança os acentos dos nomes dos campos.
    [CABECALHO.conteudoCortado]: cortesEmCabecalho(p.truncations),
    // A chave do que se está a ver — só no PDF FINAL. O rascunho não
    // conta como visto: é o PDF que ainda não pode seguir.
    ...(p.rascunho ? {} : { [CABECALHO.chaveDoPdf]: p.chaveDoQueChegou }),
    ...(p.pdfDaMemoria ? { [CABECALHO.pdfDaMemoria]: "1" } : {}),
  };
}
