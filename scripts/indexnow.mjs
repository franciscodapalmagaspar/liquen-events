/**
 * IndexNow — avisa o Bing (e os motores que partilham o IndexNow) de que as
 * páginas principais mudaram, no fim de cada construção de PRODUÇÃO.
 *
 * Porquê (21/11, plano de SEO): o Bing alimenta o Copilot e parte das
 * pesquisas do ChatGPT; sem aviso, uma página nova pode levar semanas a ser
 * lida. O resto do site o Bing encontra pelo sitemap.
 *
 * Custo: UM pedido HTTP por publicação de produção (cerca de uma por dia), sem
 * processador nas funções. Nunca parte a construção: qualquer erro só avisa.
 * A chave é pública por desenho do IndexNow (o ficheiro em public/ prova que o
 * site é nosso) — não é um segredo.
 */
const CHAVE = "ead406a0203b110fab635147f7aa1d72";
const SITE = "https://liquen-events.com";

const CAMINHOS = [
  "/",
  "/servicos",
  "/servicos/casamentos",
  "/servicos/eventos-corporativos",
  "/servicos/festas-e-aniversarios",
  "/servicos/batizados-e-comunhoes",
  "/servicos/aluguer-de-viaturas-classicas",
  "/galeria",
  "/sobre",
  "/clientes",
  "/contacto",
];

export function urlsParaAvisar() {
  return CAMINHOS.flatMap((c) => [SITE + c, SITE + "/en" + (c === "/" ? "" : c)]);
}

async function avisar() {
  if (process.env.VERCEL_ENV !== "production") return;
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "liquen-events.com",
        key: CHAVE,
        keyLocation: SITE + "/" + CHAVE + ".txt",
        urlList: urlsParaAvisar(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    console.log("indexnow: " + r.status + " (" + urlsParaAvisar().length + " páginas)");
  } catch (e) {
    console.warn("indexnow: não deu para avisar (" + (e?.message ?? e) + ") — segue sem ele");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await avisar();
