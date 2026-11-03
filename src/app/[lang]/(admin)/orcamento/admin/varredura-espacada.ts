"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA VARREDURA QUE JÁ VIU TUDO FEITO NÃO VOLTA A OLHAR LOGO A SEGUIR (3/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office arranca duas varreduras em fundo sempre que abre — as versões
 * leves das fotografias (`varrer-derivadas.ts`) e os PDF das propostas já
 * enviadas (`varrer-aquecimento.ts`). As duas param sozinhas quando não há
 * nada a fazer, mas o PRIMEIRO lote corre sempre: lê todas as propostas
 * inteiras, ou percorre todas as pastas do armazenamento, só para concluir
 * que já está tudo feito. Em cada abertura, em cada separador, todos os dias.
 *
 * A 2/11 a conta passou o limite de processador da Vercel e o site foi
 * desligado; ela pôs um tecto de gasto e pediu que nada gaste sem razão. Este
 * é um dos «sem razão»: abrir o back office dez vezes por dia eram dez
 * leituras completas para dez vezes a mesma resposta.
 *
 * A regra: quando uma varredura TERMINA com tudo feito, fica registado neste
 * navegador, e só volta a correr ao fim de `ESPACO_MS`. Se terminou com
 * trabalho por fazer (fechou-se o separador, a função ficou sem tempo), não se
 * regista nada e a próxima abertura continua — o trabalho real não espera.
 * O trabalho nocturno (`/api/cron/backup`) continua a correr todos os dias.
 */
export const ESPACO_MS = 12 * 60 * 60 * 1000;

const chave = (nome: string) => `liquen-varredura-feita:${nome}`;

/** Esta varredura pode correr agora? (Sem armazenamento local: pode sempre.) */
export function podeVarrer(nome: string, agora = Date.now()): boolean {
  try {
    const feita = Number(localStorage.getItem(chave(nome)));
    return !(feita > 0 && agora - feita < ESPACO_MS);
  } catch {
    return true;
  }
}

/** A varredura acabou e não ficou nada por fazer. */
export function marcarVarreduraFeita(nome: string, agora = Date.now()): void {
  try {
    localStorage.setItem(chave(nome), String(agora));
  } catch {
    /* sem armazenamento: a próxima abertura volta a olhar, como antes */
  }
}

/** Para os testes, e para quem MEXE no que as varreduras fazem. */
export function esquecerVarreduraFeita(nome: string): void {
  try {
    localStorage.removeItem(chave(nome));
  } catch {
    /* nada a esquecer */
  }
}
