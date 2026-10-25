"use client";

import { useEffect } from "react";
import { relatarErroPara } from "@/lib/relatar-erro";

/**
 * Os erros do browser no site público, contados a `/api/erro-do-site`.
 *
 * Só os do NOSSO código: um erro de uma extensão do browser ou de um script de
 * terceiros (o ficheiro não é deste domínio, ou chega como «Script error.»
 * sem detalhe) não diz nada sobre o site e só enchia o registo. E no máximo
 * cinco por página — um ecrã em ciclo de erro repete o mesmo.
 *
 * Vive no cromado do site (`CromadoDoSitio`), e por isso nunca na proposta do
 * casal, que tem layout próprio.
 */
const POR_PAGINA = 5;
const ROTA = "/api/erro-do-site";

export default function ErrosDoSite() {
  useEffect(() => {
    let contados = 0;
    const contar = (erro: unknown, marca: string) => {
      if (contados >= POR_PAGINA) return;
      contados++;
      relatarErroPara(ROTA, erro, marca);
    };
    const aoErro = (e: ErrorEvent) => {
      if (!e.filename || !e.filename.startsWith(location.origin)) return;
      contar(e.error ?? e.message, "window.error");
    };
    const aoRecusar = (e: PromiseRejectionEvent) => {
      // Uma recusa sem rasto que aponte para nós (por exemplo, um `fetch`
      // cortado quando a pessoa muda de página) não é um defeito do site.
      const r = e.reason as { stack?: unknown } | null;
      if (typeof r?.stack !== "string" || !r.stack.includes(location.origin)) return;
      contar(e.reason, "unhandledrejection");
    };
    addEventListener("error", aoErro);
    addEventListener("unhandledrejection", aoRecusar);
    return () => {
      removeEventListener("error", aoErro);
      removeEventListener("unhandledrejection", aoRecusar);
    };
  }, []);
  return null;
}
