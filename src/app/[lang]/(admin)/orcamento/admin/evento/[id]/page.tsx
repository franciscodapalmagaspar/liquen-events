import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, readSession } from "@/lib/admin-auth";
import { normalizeLocale } from "@/lib/i18n";
import { getQuote } from "@/lib/quotes-store";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { getContractByProposal, getAcceptedContractByQuote } from "@/lib/contracts-store";
import type { DossierData } from "@/lib/orcamento/dossier";
import DossierClient from "./DossierClient";
import { entradaCom } from "../../entrada-destino";

/**
 * Dossier do Evento — cockpit de página inteira para UM evento. Este é o único
 * componente SERVIDOR da rota: agrega tudo (pedido, proposta, contrato) a
 * partir dos stores server-only e entrega ao cliente APENAS dados
 * serializáveis. Nenhum store
 * atravessa a fronteira — o `DossierClient` e os seus filhos só veem props.
 *
 * Atrás de autenticação, por isso indexar não é preocupação; ainda assim fica
 * `noindex` por segurança, tal como as outras superfícies de administração.
 */
export const metadata: Metadata = {
  title: "Dossier do Evento — Líquen Events",
  robots: { index: false, follow: false },
};

export default async function EventoDossierPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale = normalizeLocale(lang);

  // Mesma barreira que a página de administração: sem sessão válida → login.
  // A página admin renderiza <AdminLogin/> na raiz; aqui reencaminhamos para
  // essa raiz (onde o login vive) para não duplicar o formulário.
  //
  // O DESTINO VAI COM A PESSOA. Sem isto, quem seguisse o link de um evento sem
  // sessão entrava e ia parar à lista, tendo de voltar a procurar o evento à
  // mão — e o link que abriu deixava de servir para o que servia. O que o
  // `?destino=` aceita é decidido no `entrada-destino.ts`, e só lá: um destino
  // vindo do URL é escolhido por quem manda o link, não por nós.
  const store = await cookies();
  const session = readSession(store.get(ADMIN_COOKIE)?.value);
  if (!session) {
    redirect(entradaCom(`/${lang}/orcamento/admin`, `/${lang}/orcamento/admin/evento/${id}`));
  }

  const quote = await getQuote(id);
  if (!quote) notFound();

  // O contrato procura-se PELO PEDIDO (getAcceptedContractByQuote), não pela
  // proposta mais recente: se a equipa enviar uma nova proposta DEPOIS do aceite,
  // essa proposta não tem contrato e um lookup por ela perderia o cartão de
  // contrato e faria a fase regredir de `em_producao` para `sinal_pago`. Mantemos
  // o lookup por proposta como recurso (contratos antigos indexados só por ela).
  //
  // E a proposta é a ACEITE, quando há (5/11): é o total que o cliente aceitou
  // que se cobra, e uma revisão posterior não o pode substituir no topo do
  // dossier. Sem aceite, a mais recente, como sempre — a lista chega da mais
  // nova para a mais velha. É a mesma regra do painel de Pagamentos
  // (`percentagem-do-sinal.ts`) e do link do casal.
  const propostas = await listProposalsForQuote(quote.id);
  const proposal = propostas.find((p) => p.status === "aceite") ?? propostas[0] ?? null;
  const [contractByQuote, contractByProposal] = await Promise.all([
    getAcceptedContractByQuote(quote.id),
    proposal ? getContractByProposal(proposal.id) : Promise.resolve(null),
  ]);
  const contract = contractByQuote ?? contractByProposal;

  // Fronteira serializável: reduzimos o contrato aos campos que o Dossier
  // mostra (sem instâncias, sem funções).
  const data: DossierData = {
    quote,
    proposal: proposal ?? null,
    contract: contract
      ? {
          status: contract.status,
          acceptedAt: contract.acceptedAt,
          acceptedName: contract.acceptedName,
          termsVersion: contract.termsVersion,
        }
      : null,
  };

  return <DossierClient data={data} lang={locale} userName={session.name || "Equipa"} />;
}
