import { essenciaDoNome } from "./essencia-do-nome";
import { normalizedThemeName } from "./theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS TEMAS QUE SÃO O MESMO TEMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Clássico Intemporal" aparece duas vezes com nomes quase
 * iguais».
 *
 * A biblioteca cresce por acrescento: cria-se um tema no meio de uma proposta,
 * escreve-se o nome à pressa, e daqui a três meses cria-se outra vez porque a
 * procura não encontrou o primeiro. O resultado são pares — «Itália» e
 * «italia», «Branco e Verde» e «Branco & Verde» — que ninguém distingue no
 * seletor e que partem as fotos em dois sítios.
 *
 * O índice único da base de dados já impede o caso EXACTO (ver
 * `normalizedThemeName`), e por isso o que aqui se apanha é o que passou por
 * ele: a mesma palavra por outra ordem, com pontuação diferente, com um «e» no
 * meio.
 *
 * ── O CRITÉRIO, E PORQUE É QUE É ESTREITO ────────────────────────────────
 *
 * Dois temas são parecidos quando a ESSÊNCIA do nome é a mesma — as mesmas
 * palavras, sem acentos, sem ordem, sem pontuação (ver `essencia-do-nome.ts`).
 * Nada de prefixos e nada de distâncias de edição: «Branco» e «Branco & Verde»
 * são temas diferentes, e um aviso que dispare neles é um aviso que ela aprende
 * a ignorar — e a partir daí o par que interessa passa despercebido com os
 * outros.
 *
 * Quer dizer que fica de fora o «Clássico Intemporal ( Branco/dourad0)» dela,
 * que tem palavras a mais. Isso é uma decisão e não um esquecimento: esse
 * corrige-se com um renomear, que é o que o nome mal escrito pede.
 *
 * ── OS ARQUIVADOS NÃO ENTRAM ─────────────────────────────────────────────
 *
 * Arquivar é a maneira de tirar um tema da frente sem apagar as fotos. Um par
 * onde uma das metades já foi arrumada é um par resolvido, e voltar a acusá-lo
 * era desfazer a arrumação a cada visita.
 */

/** O mínimo que é preciso saber de um tema para o comparar com outro. */
export interface TemaComparavel {
  id: string;
  name: string;
  arquivado?: boolean;
}

/**
 * Para cada tema, os OUTROS que se lêem como ele — por id.
 *
 * Um mapa e não uma lista de grupos porque quem desenha pergunta sempre pela
 * perspectiva de UM cartão («este está repetido?»), e converter um grupo nessa
 * pergunta a cada desenho era percorrer a lista toda por cartão.
 *
 * Os temas sem par nem aparecem no mapa: `undefined` é a resposta normal.
 */
export function temasParecidos<T extends TemaComparavel>(temas: readonly T[]): Map<string, T[]> {
  const porEssencia = new Map<string, T[]>();
  for (const t of temas) {
    if (t.arquivado) continue;
    // A essência primeiro; o nome normalizado é o plano B para um nome que
    // seja SÓ palavras vazias («A de», «The») — raro, mas aí a essência é
    // vazia e todos ficariam no mesmo saco.
    const chave = essenciaDoNome(t.name) || `=${normalizedThemeName(t.name)}`;
    if (chave === "=") continue;
    const lista = porEssencia.get(chave);
    if (lista) lista.push(t);
    else porEssencia.set(chave, [t]);
  }

  const parecidos = new Map<string, T[]>();
  for (const grupo of porEssencia.values()) {
    if (grupo.length < 2) continue;
    for (const t of grupo)
      parecidos.set(
        t.id,
        grupo.filter((o) => o.id !== t.id),
      );
  }
  return parecidos;
}

/**
 * A frase que um cartão diz sobre si próprio, ou `null`.
 *
 * Cita o OUTRO nome — «Lê-se como "italia"» — porque dizer «este tema está
 * repetido» obrigava a procurar qual. Com mais do que um par, conta-os: citar
 * três nomes numa linha de cartão não cabe, e o número já diz o que fazer.
 */
export function avisoDeTemaParecido(outros: readonly TemaComparavel[] | undefined): string | null {
  if (!outros || outros.length === 0) return null;
  if (outros.length === 1) return `Lê-se como “${outros[0].name}”`;
  return `Lê-se como outros ${outros.length} temas`;
}
