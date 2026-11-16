/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE PUBLICAÇÕES A VERCEL CONSTRÓI — o `ignoreCommand` do vercel.json
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A conta é a grátis (Hobby), e a 22/10 passou os 10 GB de «Deployment
 * Storage» (17,35 GB): a Vercel BLOQUEOU as publicações de produção, e nada do
 * que entrava no `main` chegava ao site. Cada publicação leva centenas de MB
 * (só as miniaturas da galeria em `/_img` são ~336 MB), e cada push a um ramo
 * de PR criava uma pré-visualização nova. Ela escolheu «ficar no grátis e
 * emagrecer».
 *
 * A regra:
 *   · produção (o `main`) — constrói SÓ o lote (regra 9 de
 *     docs/GASTAR-POUCO-DESDE-O-INICIO.md, agora feita cumprir aqui): a
 *     mensagem do commit começa por «Lote », ou contém `lote/` (o merge de um
 *     ramo `lote/AAAA-MM-DD`), ou pede-o com `[publicar]` ou `[urgente]`.
 *     Qualquer outro commit no `main` salta a construção — fica no `main` e
 *     entra no site com o lote seguinte;
 *   · pré-visualização — só quando se pede: um ramo `preview/…`, ou `[preview]`
 *     na mensagem do commit. Ver docs/VERIFICACOES.md.
 *
 * A fatura de 3–15/11 mediu porquê: construir (~2,8 $) e guardar as
 * publicações (~2,8 $) são as duas maiores linhas, e as duas crescem com
 * cada construção de produção; as funções eram ~0,3 $.
 *
 * Contrato da Vercel: o comando sai com 0 para SALTAR a construção e com 1
 * para construir. Na dúvida (variáveis em falta, mensagem vazia), constrói —
 * saltar uma publicação de produção por engano é pior do que gastar uma.
 */

/** O que, na mensagem de um commit no `main`, pede uma construção de produção. */
export function mensagemPedePublicacao(mensagem) {
  if (/^\s*Lote /.test(mensagem)) return true;
  if (/lote\//i.test(mensagem)) return true;
  if (/\[publicar\]/i.test(mensagem)) return true;
  if (/\[urgente\]/i.test(mensagem)) return true;
  return false;
}

/** @returns {boolean} se esta publicação deve ser construída */
export function deveConstruir(env) {
  const alvo = env.VERCEL_ENV;
  const ramo = env.VERCEL_GIT_COMMIT_REF ?? "";
  const mensagem = env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  if (!alvo) return true;
  if (alvo === "production") {
    // Sem mensagem não se sabe o que é: constrói, por segurança.
    if (!mensagem.trim()) return true;
    return mensagemPedePublicacao(mensagem);
  }
  if (ramo.startsWith("preview/")) return true;
  if (/\[preview\]/i.test(mensagem)) return true;
  return false;
}

const correDirecto =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (correDirecto) {
  const construir = deveConstruir(process.env);
  console.log(
    construir
      ? `vercel-construir: constrói (${process.env.VERCEL_ENV ?? "?"}, ${process.env.VERCEL_GIT_COMMIT_REF ?? "?"})`
      : process.env.VERCEL_ENV === "production"
        ? `vercel-construir: produção saltada — só o lote constrói («Lote …», lote/…, [publicar] ou [urgente] no commit)`
        : `vercel-construir: pré-visualização saltada — para a pedir, um ramo preview/… ou [preview] no commit`,
  );
  process.exit(construir ? 1 : 0);
}
