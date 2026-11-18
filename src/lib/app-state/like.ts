/**
 * O padrão LIKE de «começa por `prefixo`»: o `%`, o `_` e a `\\` do prefixo
 * escapam-se, para um prefixo com um deles não varrer mais do que devia. Um só
 * sítio para ler, varrer e apagar.
 */
export const comoPrefixo = (prefixo: string): string => `${prefixo.replace(/([%_\\])/g, "\\$1")}%`;
