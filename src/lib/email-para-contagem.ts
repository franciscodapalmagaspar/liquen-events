/**
 * O endereço reduzido à CAIXA DE CORREIO que o recebe — só para contar.
 *
 * O tecto diário de confirmações (`/api/orcamento`) conta por endereço. Mas
 * vários endereços escritos de maneiras diferentes chegam à mesma caixa:
 *
 *  · maiúsculas e espaços (`Ana@Example.com `);
 *  · uma etiqueta depois do `+` (`ana+1@…`, `ana+2@…`), que a maior parte dos
 *    fornecedores entrega na caixa de `ana@…`;
 *  · no Gmail, os pontos do nome (`a.n.a@gmail.com` é `ana@gmail.com`), e o
 *    domínio antigo `googlemail.com`.
 *
 * Contados como endereços diferentes, cada variação trazia um tecto novo
 * (auditoria de 13/11, n.º 14). Aqui contam como um só.
 *
 * NUNCA serve para enviar nem para gravar: o email sai para o endereço tal e
 * qual a pessoa o escreveu. Isto é só a chave do contador.
 */
export function emailParaContagem(email: string): string {
  const limpo = email.trim().toLowerCase();
  const arroba = limpo.lastIndexOf("@");
  if (arroba <= 0) return limpo;
  let local = limpo.slice(0, arroba);
  let dominio = limpo.slice(arroba + 1);
  const mais = local.indexOf("+");
  if (mais > 0) local = local.slice(0, mais);
  if (dominio === "googlemail.com") dominio = "gmail.com";
  if (dominio === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${dominio}`;
}
