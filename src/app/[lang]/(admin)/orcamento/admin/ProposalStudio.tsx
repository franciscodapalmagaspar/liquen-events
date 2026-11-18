"use client";

import { ContextoDoEstudio } from "./estudio/contexto";
import { EcraDoEstudio } from "./estudio/EcraDoEstudio";
import { useEstudioDaProposta } from "./estudio/useEstudioDaProposta";

import { porqueFalhouOEnvio } from "./porque-falhou-o-envio";

// A espera desenhada de uma maneira só. Ver `ui/EmCurso.tsx`: uma barra, um
// ponto a pulsar, e a contagem quando o código sabe contar — este ficheiro não
// inventa nenhuma espera sua.

import {
  semAsFotosNasPaginas,
  semOTema,
  temasLevadosPelasLinhas,
} from "@/lib/orcamento/estudio/temas-e-fotos";
import {
  avisoDeConteudoIncompleto,
  cortesDoCabecalho,
  textoDaGravacao,
  textoDoTotal,
  type EstadoDaGravacaoNoEcra,
} from "@/lib/orcamento/estudio/textos-do-estudio";
import {
  contagemDePrecos,
  modoDoAdicional,
  textoDoAdicional,
  type ModoDeIvaDoAdicional,
} from "@/lib/orcamento/estudio/precos-e-iva";
import {
  gravarRascunhoNoServidor,
  mandarPrecoAoPedido,
  type ResultadoDaGravacao,
  type ResultadoDoPreco,
} from "@/lib/orcamento/estudio/gravar";

import type { PropsDoEstudio } from "./estudio/tipos";

/*
 * A lógica pura do estúdio vive em `lib/orcamento/estudio/` (fase 1 de
 * `docs/ESTRUTURA-DO-CODIGO.md`). O que este ficheiro exportava continua a
 * sair daqui, para nenhum teste nem chamador ter de mudar.
 */
export { semAsFotosNasPaginas, semOTema, temasLevadosPelasLinhas };
export { avisoDeConteudoIncompleto, cortesDoCabecalho, textoDaGravacao, textoDoTotal };
export type { EstadoDaGravacaoNoEcra };
export { contagemDePrecos, modoDoAdicional, textoDoAdicional };
export type { ModoDeIvaDoAdicional };
export { gravarRascunhoNoServidor, mandarPrecoAoPedido };
export type { ResultadoDaGravacao, ResultadoDoPreco };

/**
 * O helper vive num módulo PRÓPRIO, e não dentro do Estúdio, por uma razão de
 * peso: o construtor de preços (`ProposalBuilder`) precisa dele e é montado
 * SEMPRE, enquanto o Estúdio entra por `dynamic()`. Importá-lo de lá arrastava
 * o Estúdio inteiro para o pacote inicial do back office.
 */
export { porqueFalhouOEnvio };

/**
 * O «Fazer proposta»: o estúdio onde ela escreve a proposta e a envia.
 *
 * Só compõe. O estado e as regras vivem nos ganchos de cada domínio, que o
 * `useEstudioDaProposta` junta pela ordem em que os efeitos têm de correr; o
 * ecrã (`EcraDoEstudio` e as suas peças) lê-os do contexto.
 */
export default function ProposalStudio(props: PropsDoEstudio) {
  const estudio = useEstudioDaProposta(props);
  return (
    <ContextoDoEstudio value={estudio}>
      <EcraDoEstudio />
    </ContextoDoEstudio>
  );
}
