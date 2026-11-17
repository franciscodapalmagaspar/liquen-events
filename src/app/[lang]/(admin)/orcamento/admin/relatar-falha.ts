/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO UMA FOTO NÃO APARECE, ALGUÉM TEM DE FICAR A SABER PORQUÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio dizia «Guardada, mas não foi possível pré-visualizar aqui» e ficava
 * por ali. A informação que resolvia o problema — QUE URL, e que resposta deu —
 * existia durante um instante no browser dela e desaparecia. Eu, a diagnosticar
 * isto, tinha a mensagem e mais nada; ela, a trabalhar, tinha a mensagem e mais
 * nada. Dois lados do mesmo ecrã sem a única coisa que interessa.
 *
 * Isto manda-a para os registos do servidor.
 *
 * ── O QUE NÃO VAI, E PORQUÊ ────────────────────────────────────────────────
 * **O `?token=` fica de fora.** Um URL assinado do Supabase leva um JWT que É a
 * credencial: quem o tiver descarrega a fotografia. Registá-lo punha as chaves
 * do bucket dentro do sistema de registos — que é lido por mais gente, guardado
 * mais tempo, e exportado para sítios que ninguém enumerou. O que interessa
 * para diagnosticar é o CAMINHO e o CÓDIGO, e esses vão inteiros.
 *
 * ── PORQUE É QUE VAI BUSCAR O ESTADO ───────────────────────────────────────
 * O `onError` de um `<img>` não diz nada: não traz código, não traz cabeçalhos,
 * não distingue 404 de 403 de uma ligação cortada. Sem o código não se
 * distingue «o ficheiro não existe» de «a assinatura expirou», que são dois
 * problemas com duas soluções diferentes. Por isso repete-se o pedido com
 * `fetch`, uma vez, só para ler o estado.
 *
 * Tudo isto é o melhor esforço e nunca lança: uma falha a relatar uma falha não
 * pode ser mais uma falha.
 */

import { assinaturaExpirada } from "./assinatura";

/** Não mais do que isto por sessão: uma grelha inteira a falhar são 60 células,
 *  e 60 relatórios iguais não dizem mais do que os primeiros. */
const MAX_POR_SESSAO = 12;
let relatados = 0;

/** Os que já foram, para uma célula que volta a tentar não relatar duas vezes. */
const jaFoi = new Set<string>();

/** O caminho sem a credencial: `https://x.supabase.co/storage/v1/object/sign/b/p`. */
export function semSegredo(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "(desconhecido)";
  }
  /**
   * SÓ `http`/`https` TÊM CAMINHO QUE VALHA A PENA DIZER.
   *
   * Um `blob:` também passa no `new URL()` — e dá disparate: `origin` fica
   * `http://localhost` e `pathname` fica com o URL interior inteiro colado
   * atrás, o que produzia `http://localhosthttp://localhost/abc-123` nos
   * registos. Um `data:` traz os bytes da imagem no próprio URL, e esses não
   * têm nada que fazer num sistema de registos. Para ambos, o que interessa
   * saber é só o TIPO.
   */
  if (u.protocol !== "http:" && u.protocol !== "https:") return `${u.protocol.slice(0, -1)}:…`;
  return `${u.origin}${u.pathname}`;
}

/**
 * Lê o código de estado de um URL que já falhou a desenhar.
 *
 * `no-store` porque a resposta em cache seria a boa de ontem e não a má de
 * agora — e é a de agora que explica o que está a acontecer.
 */
async function estadoDe(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", redirect: "manual" });
    return res.status;
  } catch {
    return null;
  }
}

export interface FalhaDeImagem {
  /** `capa`, `mood-board`, `biblioteca` — para os registos dizerem ONDE. */
  onde: string;
  /** O caminho no documento (não o URL): `<pedido>/<uuid>.jpg` ou `tema:…`. */
  ref?: string;
  /** O URL que o `<img>` tentou. A credencial é retirada antes de sair daqui. */
  url: string;
}

/**
 * Conta ao servidor que uma foto não desenhou. Melhor esforço, sem `await`
 * obrigatório do lado de quem chama.
 */
export async function relatarFalhaDeImagem(f: FalhaDeImagem): Promise<void> {
  if (typeof window === "undefined") return;
  const chave = `${f.onde}|${semSegredo(f.url)}`;
  if (jaFoi.has(chave) || relatados >= MAX_POR_SESSAO) return;
  jaFoi.add(chave);
  relatados += 1;
  try {
    /**
     * ── A CAUSA MAIS COMUM SABE-SE AQUI, SEM PERGUNTAR (registos de 10–13/11) ──
     *
     * As ~30 «imagem não desenhou» desses dias eram TODAS 400 sobre ficheiros
     * que existem no Storage (verificado um a um): assinaturas de 6 h já
     * mortas, vindas do rascunho guardado (corrigido em #460) — e que a
     * hidratação troca sozinha. O prazo está no próprio token: com ele
     * vencido, diz-se `expirada` e poupa-se a ida que só servia para ler o
     * código. O registo passa a separar «expirou» de «não existe».
     */
    const expirada = assinaturaExpirada(f.url, Date.now(), 0);
    const estado = expirada ? null : await estadoDe(f.url);
    await fetch("/api/admin/imagem-falhou", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        onde: f.onde,
        ref: f.ref?.slice(0, 200) ?? "",
        url: semSegredo(f.url),
        estado,
        expirada,
      }),
      keepalive: true,
    });
  } catch {
    /* sem rede, ou a rota fora: o ecrã continua a funcionar */
  }
}

/** Para os testes: repõe os contadores entre casos. */
export function esquecerRelatos(): void {
  relatados = 0;
  jaFoi.clear();
}
