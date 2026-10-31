import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * ── OS ROBÔS DAS RESPOSTAS, PELO NOME ────────────────────────────────────
 *
 * A Fase 3 do pedido «nível estúdio» (31/10): quem pergunta a um assistente
 * («quem decora casamentos no Alentejo?») recebe a resposta que ele leu. A
 * regra `*` já os deixava entrar a todos; dizê-los pelo nome é o que torna a
 * escolha explícita e à prova de uma regra `*` mais apertada no futuro — um
 * robô que tem regra própria segue SÓ essa, e ignora a `*`.
 *
 *   · GPTBot — OpenAI (ChatGPT); OAI-SearchBot — a pesquisa do ChatGPT;
 *   · ClaudeBot — Anthropic (Claude);
 *   · PerplexityBot — Perplexity;
 *   · Google-Extended — o Gemini e as respostas da Google (o Googlebot normal
 *     já está na `*`; este nome é só a autorização para a IA).
 *
 * Cada um com as mesmas regras da `*`: o sítio todo, menos `/api/`.
 */
export const ROBOS_DAS_RESPOSTAS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /orcamento/admin is intentionally NOT disallowed here: it carries its
        // own `noindex` meta tag (like /orcamento/confirmacao and /proposta),
        // and disallowing it would block crawlers from ever fetching the page
        // to see that tag — the classic disallow-prevents-noindex-from-working
        // anti-pattern. Login-gated either way, so there's nothing to expose.
        disallow: ["/api/"],
      },
      { userAgent: [...ROBOS_DAS_RESPOSTAS], allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    // No `host` directive: it's non-standard (Yandex-only, and expects a bare
    // hostname, not a URL), and Google ignores it.
  };
}
