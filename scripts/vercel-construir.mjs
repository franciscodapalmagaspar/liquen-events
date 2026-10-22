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
 *   · produção (o `main`) — constrói SEMPRE;
 *   · pré-visualização — só quando se pede: um ramo `preview/…`, ou `[preview]`
 *     na mensagem do commit. Ver docs/VERIFICACOES.md.
 *
 * Contrato da Vercel: o comando sai com 0 para SALTAR a construção e com 1
 * para construir. Na dúvida (variáveis em falta), constrói — saltar uma
 * publicação de produção por engano é pior do que gastar uma.
 */

/** @returns {boolean} se esta publicação deve ser construída */
export function deveConstruir(env) {
  const alvo = env.VERCEL_ENV;
  if (!alvo || alvo === "production") return true;
  const ramo = env.VERCEL_GIT_COMMIT_REF ?? "";
  const mensagem = env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  if (ramo.startsWith("preview/")) return true;
  if (/\[preview\]/i.test(mensagem)) return true;
  return false;
}

const correDirecto = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (correDirecto) {
  const construir = deveConstruir(process.env);
  console.log(
    construir
      ? `vercel-construir: constrói (${process.env.VERCEL_ENV ?? "?"}, ${process.env.VERCEL_GIT_COMMIT_REF ?? "?"})`
      : `vercel-construir: pré-visualização saltada — para a pedir, um ramo preview/… ou [preview] no commit`,
  );
  process.exit(construir ? 1 : 0);
}
