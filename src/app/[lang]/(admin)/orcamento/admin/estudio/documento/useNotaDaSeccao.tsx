"use client";
import NotasInternas from "../../NotasInternas";
import { useDocumentoDoEstudio } from "./useDocumentoDoEstudio";

export interface EntradaNotaDaSeccao {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
}

export function useNotaDaSeccao({ documento }: EntradaNotaDaSeccao) {
  const { doc, patch } = documento;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REPOR O TRABALHO QUE ESTA SESSÃO ESMAGOU
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A gaveta já existia e já estava cheia; o que faltava era isto e a porta do
   * lado do servidor. Aqui vai-se buscar o documento pelo nome que a própria
   * gravação devolveu.
   *
   * ── E REPOR NÃO É UM SENTIDO ÚNICO ────────────────────────────────────────
   *
   * Repor é, por definição, escrever por cima do que está no ecrã — ou seja, o
   * mesmo gesto que criou este problema. Duas coisas impedem que seja uma
   * troca de um estrago por outro:
   *
   *  1. O «desfazer» de dez segundos desta casa (`limpo`), que já existe para
   *     os outros gestos que substituem o documento — o próprio código diz que
   *     nasceu também para «repor uma versão antiga». Fica com o motivo
   *     escrito, para a barra poder dizer o que aconteceu.
   *
   *  2. E a gravação seguinte volta a passar pelo mesmo mecanismo do servidor:
   *     o documento que está agora no ecrã passa a ser ELE o sobreposto, e vai
   *     para a mesma gaveta. Ou seja, o resgate protege nos dois sentidos sem
   *     ninguém ter escrito código para isso.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A NOTA QUE PERTENCE A UMA SECÇÃO, E NÃO AO NEGÓCIO INTEIRO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O campo `notasPorSeccao` existia há muito: tipado no documento, protegido
   * no gerador do PDF («as notas por secção nunca são desenhadas»), e limpo na
   * cópia para outro pedido — três sítios a tratar bem de uma coisa que
   * NINGUÉM ESCREVIA. Não havia caixa nenhuma no estúdio.
   *
   * O `notasInternas` que já existe é sobre o negócio: «recusaram em 2025 por
   * preço». Estas são outra coisa e vivem noutra escala: «as capas são as duas
   * do mesmo ângulo, trocar a segunda», «o cronograma tem de bater com a hora
   * do padre», «esta linha é a que dá a margem toda». Escritas ao lado do
   * campo geral, perdiam-se num parágrafo; escritas na secção, estão onde a
   * dúvida nasce.
   *
   * ── E O DOCUMENTO NÃO PODE ENCHER-SE DE VAZIOS ─────────────────────────
   *
   * Uma caixa vazia por secção que gravasse `""` punha seis chaves em todos os
   * documentos, todas sem conteúdo, e ainda por cima faziam o `resgate` e as
   * comparações de versões acusarem diferenças que não existem. Apagar a
   * entrada quando a nota fica vazia é o que mantém o documento igual ao que
   * era antes desta funcionalidade existir — e é isso que o teste prende.
   */
  function notaDaSeccao(chave: string, titulo: string) {
    const notas = doc.notasPorSeccao ?? {};
    return (
      <NotasInternas
        compacta
        fechadaSeVazia
        titulo={titulo}
        valor={notas[chave] ?? ""}
        placeholder="Só para a equipa. Nunca sai na proposta."
        onChange={(v) => {
          const seguintes = { ...notas };
          if (v.trim()) seguintes[chave] = v;
          else delete seguintes[chave];
          patch({
            notasPorSeccao: Object.keys(seguintes).length > 0 ? seguintes : undefined,
          });
        }}
      />
    );
  }

  return { notaDaSeccao };
}
