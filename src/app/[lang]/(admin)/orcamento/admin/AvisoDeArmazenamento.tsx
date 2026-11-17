"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O QUE EU GRAVAR AGORA FICA MESMO GUARDADO?» — dito ANTES de começar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O que isto resolve ────────────────────────────────────────────────────
 * O aviso que já existe (o «não guardei», da rota do rascunho) chega no momento
 * certo mas TARDE: naquela instalação, a tabela `app_state` não existia e uma
 * proposta inteira — fotos, mood boards, textos — foi montada antes de alguém
 * perceber que nada estava a ser gravado. Este painel é a mesma verdade dita à
 * abertura, quando ainda dá para não começar.
 *
 * ── Porque é que ele quase nunca aparece ──────────────────────────────────
 * Só desenha alguma coisa quando o servidor diz `avisar`. Nem uma marca verde,
 * nem um «tudo bem» discreto: um aviso que aparece quando está tudo bem é um
 * aviso que se deixa de ler, e o dia em que ele importa é o dia em que já
 * ninguém repara nele. Numa máquina de desenvolvimento sem base de dados
 * também não aparece — aí o ficheiro é o desenho, não uma avaria.
 *
 * Também não aparece quando a PERGUNTA falha (sessão expirada, rede em baixo).
 * Não se sabe é diferente de está mal, e um vermelho por não se saber seria o
 * alarme falso mais frequente de todos.
 *
 * ── Porque é que a resposta é partilhada entre montagens ──────────────────
 * Isto fica no topo do back office, que monta e desmonta ecrãs a cada troca de
 * separador, e do outro lado a verificação ESCREVE na base de dados (é assim
 * que ela é honesta — ver `lib/estado-do-armazenamento.ts`). Uma pergunta por
 * montagem eram dezenas de escritas por dia para não dizer nada. A resposta
 * vive num módulo, como no `useCachedList`, e as perguntas simultâneas
 * partilham a mesma viagem.
 *
 * ── ONDE PENDURAR ISTO ────────────────────────────────────────────────────
 * Ainda não está pendurado em ecrã nenhum, de propósito (os ficheiros do painel
 * estão a ser mexidos noutra frente). O sítio para onde foi feito é o topo do
 * back office, dentro do `AdminClient`, acima das vistas e abaixo da barra de
 * navegação — um só sítio, visível em qualquer separador:
 *
 *     import { AvisoDeArmazenamento } from "./AvisoDeArmazenamento";
 *     …
 *     <AvisoDeArmazenamento />
 *
 * Não o repita dentro do estúdio nem do construtor de propostas: são montados e
 * desmontados muitas vezes, e o painel já os cobre a partir do topo.
 */

/** O que a rota `/api/admin/armazenamento` responde. */
export interface EstadoDoArmazenamentoLido {
  estado: string;
  duradouro: boolean;
  avisar: boolean;
  titulo: string;
  oQueFazer: string;
  /** As colunas que a base não tem — `proposals.doc` e companhia. */
  colunasEmFalta?: string[];
  colunasTitulo?: string;
  colunasOQueFazer?: string;
  fotos: string;
  fotosOQueFazer?: string;
  detalhe?: string;
  verificadoEm: string;
  /**
   * A cópia de segurança. Vem do mesmo diagnóstico porque é a mesma
   * preocupação vista do outro lado — «e se isto desaparecer, há de onde
   * voltar?» — e porque o sítio onde tem de ser lida é este. Ausente quando a
   * pergunta não se fez (máquina de desenvolvimento, ou base de dados em
   * baixo: ver `lib/estado-do-armazenamento.ts`).
   */
  copia?: {
    estado: string;
    avisar: boolean;
    diasSem?: number;
    ultimaEm?: string;
    titulo?: string;
    oQueFazer?: string;
  };
  /** O Vercel Blob (17/11): avisos dos tectos, ou o erro de ficheiros sem token. */
  blob?: { avisos: string[]; erro?: string };
}

/** A última resposta, partilhada por todas as montagens deste processo. */
let cache: EstadoDoArmazenamentoLido | null = null;
/** Uma pergunta em voo: três montagens ao mesmo tempo são uma viagem só. */
let emCurso: Promise<EstadoDoArmazenamentoLido | null> | null = null;
/** Identidade da viagem que está na vaga — ver o `finally` lá em baixo. */
let emCursoBilhete = 0;
let contador = 0;

async function perguntar(forcar: boolean): Promise<EstadoDoArmazenamentoLido | null> {
  if (!forcar && cache) return cache;
  if (!forcar && emCurso) return emCurso;

  const viagem = (async () => {
    try {
      const res = await fetch(`/api/admin/armazenamento${forcar ? "?forcar=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const corpo = (await res.json()) as EstadoDoArmazenamentoLido;
      if (!corpo || typeof corpo.avisar !== "boolean") return null;
      cache = corpo;
      return corpo;
    } catch {
      // Rede em baixo. Não se sabe — e não se sabe não se anuncia.
      return null;
    }
  })();

  /**
   * A viagem em curso guarda-se com um NÚMERO ao lado, e não se compara a
   * promessa consigo própria no fim.
   *
   * Fazia-se `if (emCurso === viagem)` — correcto, e a análise de segurança
   * lia aquilo como uma promessa usada sem `await`. Não era: era uma
   * comparação de identidade, para só limpar a vaga se ela ainda for MINHA
   * (entretanto pode ter entrado uma pergunta forçada). Um aviso que é preciso
   * explicar de cada vez que alguém passa por aqui acaba por ser ignorado —
   * mais vale escrever a intenção de maneira a não precisar de defesa.
   */
  const bilhete = ++contador;
  if (!forcar) {
    emCurso = viagem;
    emCursoBilhete = bilhete;
  }
  try {
    return await viagem;
  } finally {
    if (emCursoBilhete === bilhete) {
      emCurso = null;
      emCursoBilhete = 0;
    }
  }
}

/** Esquece a resposta guardada. Para os testes, e para quem queira forçar uma
 *  pergunta nova depois de mexer na configuração. */
export function esquecerEstadoDoArmazenamento(): void {
  cache = null;
  emCurso = null;
}

/**
 * A MESMA resposta, para quem mais a quiser ler (o bloco «Hoje»). Junta-se à
 * pergunta que este painel já faz ao abrir o back office — nenhum pedido novo
 * ao servidor (revisão de 17/11, n.º 6).
 */
export function useEstadoDoArmazenamento(): EstadoDoArmazenamentoLido | null {
  const [estado, setEstado] = useState<EstadoDoArmazenamentoLido | null>(cache);
  useEffect(() => {
    let vivo = true;
    void perguntar(false).then((r) => {
      if (vivo && r) setEstado(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

export function AvisoDeArmazenamento() {
  const [estado, setEstado] = useState<EstadoDoArmazenamentoLido | null>(cache);
  const [aVerificar, setAVerificar] = useState(false);
  /** A última verificação PEDIDA por ela não chegou ao servidor. */
  const [naoDeuParaVerificar, setNaoDeuParaVerificar] = useState(false);

  useEffect(() => {
    let vivo = true;
    void perguntar(false).then((r) => {
      if (vivo) setEstado(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * ── UMA VERIFICAÇÃO QUE FALHA NÃO APAGA O QUE SE SABIA ────────────────────
   *
   * Isto fazia `setEstado(await perguntar(true))` e escrevia o `null` da falha
   * por cima do aviso — e este painel só tem uma maneira de dizer «está tudo
   * bem»: desaparecer. O gesto é o de quem acabou de correr o `schema.sql` e
   * quer confirmar; uma sessão expirada a meio da manhã dava-lhe exactamente a
   * imagem da confirmação, com a tabela a continuar a não existir.
   *
   * «Não se sabe» é diferente de «está mal» — é a razão de o painel se calar
   * quando a pergunta falha à abertura — e é igualmente diferente de «está
   * bem». Aqui já se sabe alguma coisa: fica o que se sabia, com uma linha a
   * dizer que a verificação é que não se fez.
   */
  const verificarDeNovo = useCallback(async () => {
    setAVerificar(true);
    try {
      const r = await perguntar(true);
      if (r) setEstado(r);
      setNaoDeuParaVerificar(r === null);
    } finally {
      setAVerificar(false);
    }
  }, []);

  // Nada a dizer: nada desenhado. Ver o cabeçalho — é a propriedade que faz
  // este painel valer a pena no dia em que ele aparecer.
  if (!estado || !estado.avisar) return null;

  /**
   * O bloco do ARMAZENAMENTO só fala quando é dele que se trata.
   *
   * Desde que a cópia de segurança entrou neste painel, há um caso em que a
   * base de dados está boa e o que está mal é outra coisa. Escrever «o
   * armazenamento está ligado — não é preciso fazer nada» em cima do único
   * problema que existe seria a maneira mais eficaz de o esconder: a primeira
   * frase de um aviso é a que se lê.
   *
   * `duradouro` é o sinal que o servidor já dá para isto, e não uma regra
   * repetida deste lado: é verdadeiro exactamente nos dois estados saudáveis
   * (`ok` e `ficheiro-de-desenvolvimento`) e falso em todos os outros.
   */
  const falarDoArmazenamento = !estado.duradouro || estado.fotos === "sem-resposta";

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-[var(--bo-perigo)]/30 bg-[var(--bo-perigo-lavagem)]/60 px-4 py-3 text-sm"
    >
      {falarDoArmazenamento && (
        <>
          <p className="font-medium text-[var(--bo-perigo)]">{estado.titulo}</p>
          <p className="bo-text-muted mt-1">{estado.oQueFazer}</p>
          {estado.fotosOQueFazer && estado.fotos === "sem-resposta" && (
            <p className="bo-text-muted mt-1">{estado.fotosOQueFazer}</p>
          )}
        </>
      )}
      {/* ── AS COLUNAS QUE FALTAM ────────────────────────────────────────
          Vem ANTES da cópia de segurança de propósito: destas duas, é esta que
          está a custar dinheiro agora. Uma coluna em falta na `proposals` não
          impede nada — a proposta gera-se, o email sai, o quadro diz «enviada»
          — e o casal abre o link e encontra um quadro de preço no lugar da
          proposta. É a avaria mais cara que esta casa teve, e a mais calada. */}
      {(estado.colunasEmFalta?.length ?? 0) > 0 && (
        <>
          <p
            className={`font-medium text-[var(--bo-perigo)] ${falarDoArmazenamento ? "mt-3" : ""}`}
          >
            {estado.colunasTitulo}
          </p>
          <p className="bo-text-muted mt-1">{estado.colunasOQueFazer}</p>
        </>
      )}
      {estado.copia?.avisar && (
        <>
          <p
            className={`font-medium text-[var(--bo-perigo)] ${
              falarDoArmazenamento || (estado.colunasEmFalta?.length ?? 0) > 0 ? "mt-3" : ""
            }`}
          >
            {estado.copia.titulo}
          </p>
          <p className="bo-text-muted mt-1">{estado.copia.oQueFazer}</p>
        </>
      )}
      {naoDeuParaVerificar && (
        <p className="bo-text-muted mt-3">
          Não foi possível verificar agora — o que está aqui em cima é a última resposta que chegou.
          Se a sessão tiver expirado, volta a entrar e tenta outra vez.
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={verificarDeNovo} disabled={aVerificar}>
          {aVerificar ? "A verificar…" : "Verificar de novo"}
        </Button>
      </div>
    </div>
  );
}

export default AvisoDeArmazenamento;
