import { describe, it, expect } from "vitest";
import { GET, textoDoLlms } from "./route";
import sitemap from "../sitemap";
import { SITE } from "@/lib/site";
import { SERVICES } from "@/lib/services-data";

describe("/llms.txt", () => {
  const texto = textoDoLlms();
  const links = [...texto.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]!);

  it("aponta para o domínio canónico, nunca para o www (que responde 308)", () => {
    expect(texto).not.toMatch(/www\.liquen-events\.com/);
    expect(links.length).toBeGreaterThan(10);
    for (const l of links) expect(l.startsWith(SITE.url), l).toBe(true);
  });

  it("cada página que lista está no sitemap (nenhuma leva a um 404)", () => {
    const noMapa = new Set(sitemap().map((e) => e.url.replace(/\/$/, "")));
    for (const l of links) expect(noMapa.has(l.replace(/\/$/, "")), l).toBe(true);
  });

  it("diz o slogan e os contactos do site, e não outros", () => {
    expect(texto).toContain(SITE.slogan);
    expect(texto).toContain(SITE.email);
    expect(texto).toContain(SITE.phoneDisplay);
  });

  it("responde em texto simples", async () => {
    const r = GET();
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await r.text()).toBe(texto);
  });

  it("lista todos os serviços (nenhum fica de fora quando nasce um novo)", () => {
    for (const s of SERVICES) expect(links, s.slug).toContain(`${SITE.url}/servicos/${s.slug}`);
  });

  it("não lista as landing pages de anúncios (a geografia que ela tirou do site)", () => {
    expect(texto).not.toMatch(/\/casamentos\//);
  });
});
