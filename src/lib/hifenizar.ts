import "server-only";
import { hyphenateSync as hifenizarPt } from "hyphen/pt";
import { hyphenateSync as hifenizarEn } from "hyphen/en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO JUSTIFICADO SEM BURACOS NO TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (22/10), com a captura do «Vamos ter consigo» no iPhone: «o
 * texto está espaçado… isto não pode estar espaçado assim. Tem que estar
 * normal… mas texto formatado.» E a seguir: «verifica se não há mais textos
 * desses».
 *
 * O texto justificado já levava `hyphens: auto` — e não chegava: o Safari do
 * iPhone não parte palavras portuguesas sozinho (medido na captura dela: nem
 * um hífen, e «desde   o   conceito   à» com buracos a meio da linha). Sem
 * poder partir, a única maneira de encher a linha é esticar os espaços.
 *
 * Por isso as sílabas marcam-se AQUI, no servidor: cada palavra comprida leva
 * hífenes invisíveis (U+00AD) onde pode partir, segundo as regras do português
 * (ou do inglês). Qualquer browser os respeita — sem dicionário nenhum — e só
 * os desenha quando a palavra parte mesmo no fim da linha. O texto fica
 * justificado, com espaços normais, como num livro.
 *
 * Só no servidor (`server-only`): os padrões das duas línguas pesam e não
 * fazem falta no telemóvel de quem lê.
 */
export function hifenizar(texto: string, idioma: string = "pt"): string {
  const partir = idioma.startsWith("en") ? hifenizarEn : hifenizarPt;
  // Palavras de 6 letras ou mais: partir «desde» ou «nossa» não poupa nada e
  // lê-se pior.
  return partir(texto, { minWordLength: 6 });
}
