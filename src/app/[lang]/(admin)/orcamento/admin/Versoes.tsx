"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { diferencas, type Mudanca } from "@/lib/orcamento/diferencas";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { paragrafoDoQueMudou } from "@/lib/email-proposta-textos";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { Button } from "./ui/Button";
import { PerguntaDestrutiva } from "./ui/PerguntaDestrutiva";
// `ESTADO` entra com outro nome: este ficheiro já tem um mapa `ESTADO` seu
// (os rótulos dos estados de uma versão), e são coisas diferentes.
import { ESTADO as MOV_ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE JÁ SE ENVIOU, E O QUE MUDOU DESDE ENTÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma negociação de casamento tem três ou quatro rondas, com semanas pelo meio.
 * Duas perguntas repetem-se, e as duas são de memória: "o que foi que eu lhes
 * mandei?" e "o que é que mudou desde essa?".
 *
 * ── O QUE ESTÁ NO ECRÃ CONTA COMO VERSÃO ───────────────────────────────────
 * A comparação mais útil não é entre dois envios passados: é entre a última que
 * seguiu e a que está aqui por enviar. É a que responde à pergunta que se faz
 * COM O DEDO NO BOTÃO — "o que é que eles vão ver de diferente?" — e por isso
 * vem primeiro, destacada, e não no meio da lista.
 *
 * ── RESTAURAR NÃO ENVIA ────────────────────────────────────────────────────
 * Repor uma versão antiga escreve-a no rascunho e mais nada. Continua a ser
 * preciso passar pelo Enviar, com a conferência pelo meio. Um botão que
 * reenviasse uma proposta de há três semanas por um clique era uma forma nova
 * de mandar o preço errado.
 *
 * ── E REPÕE A QUE ELA PEDIU POR ÚLTIMO ─────────────────────────────────────
 * Só o botão da versão a repor ficava desactivado; os outros continuavam a
 * aceitar cliques. Numa rede lenta o gesto natural — carregar, achar que não
 * fez nada, carregar noutra — pedia dois documentos, e quem escrevia no
 * estúdio era o que chegasse EM ÚLTIMO. Ficava lá a proposta errada, sem nada
 * no ecrã a dizê-lo, e o que se gravava a seguir era essa. Agora só a última
 * pedida conta; as respostas atrasadas são deitadas fora.
 *
 * ── E DIZ AO EMAIL O QUE MUDOU, EM VEZ DE ELA REESCREVER DE CABEÇA ─────────
 * As diferenças de cima já respondem à pergunta "o que é que eles vão ver de
 * diferente?". A partir do segundo envio, este painel oferece a MESMA resposta
 * como um parágrafo pronto para o texto do email ao cliente — «Desde a
 * última proposta: ...» — em vez de ela ter de reler a lista e escrevê-lo à
 * mão. Nasce editável e nunca se envia sozinho: o botão só INSERE o texto na
 * caixa, pela mesma porta por onde as sugestões da Ortografia já entram nesta
 * casa (`Gralhas.tsx`); apagar, reescrever ou deixar como está continua a ser
 * decisão dela, com o dedo no botão Enviar.
 */

/** Uma versão como a rota a devolve — sem o documento. */
export interface VersaoEnviada {
  id: string;
  enviadaEm: string;
  total: number;
  estado: string;
  mudancas: Mudanca[];
  resumo: string;
}

interface Props {
  quoteId: string;
  /** O que está no ecrã, para comparar com a última enviada. */
  doc: ProposalDoc;
  /** Repõe uma versão antiga no estúdio. */
  onRestaurar: (doc: ProposalDoc) => void;
  /** A língua em que esta proposta vai sair (ver o interruptor ao lado, no
   *  estúdio) — o parágrafo do que mudou nasce nessa língua. Por omissão,
   *  português: o mesmo que o resto do documento faz sem esta escolha. */
  idioma?: IdiomaDaProposta;
  /**
   * Insere um texto no email ao cliente do estúdio (a caixa da mensagem saiu a 14/10) — usado
   * pelo botão "Inserir no email" do parágrafo do que mudou. Sem esta prop
   * (por exemplo, testes que só querem o histórico), o parágrafo não aparece:
   * um botão que não faz nada é pior do que não haver botão.
   */
  onInserirNaMensagem?: (texto: string) => void;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

const quando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
};

const ESTADO: Record<string, string> = {
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceite: "Aceite",
  rejeitada: "Recusada",
  rascunho: "Rascunho",
};

export default function Versoes({
  quoteId,
  doc,
  onRestaurar,
  idioma = IDIOMA_POR_OMISSAO,
  onInserirNaMensagem,
}: Props) {
  const [versoes, setVersoes] = useState<VersaoEnviada[] | null>(null);
  const [erro, setErro] = useState(false);
  const [aRepor, setARepor] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  /** O documento da última enviada, para comparar com o que está no ecrã. */
  const [ultimoDoc, setUltimoDoc] = useState<ProposalDoc | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CORTE DOS LINKS JÁ ENVIADOS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Vive aqui e não nas definições porque é aqui que está a lista do que já
   * seguiu para o casal. A pergunta que este botão responde — «e se eu quiser
   * fechar aquele link?» — nasce a olhar para essa lista.
   */
  const [corte, setCorte] = useState<{ cortadoEm: string; por?: string } | null>(null);
  const [aPerguntar, setAPerguntar] = useState(false);
  const [aCortar, setACortar] = useState(false);
  /** A falha do corte é dita por extenso, e não com a frase vaga do painel. */
  const [erroDoCorte, setErroDoCorte] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/versoes`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { versoes?: VersaoEnviada[] };
      setVersoes(data.versoes ?? []);
      setErro(false);
      /**
       * O corte vem no mesmo carregamento, e não num efeito próprio.
       *
       * As duas coisas mostram-se juntas — a lista do que seguiu, e se aqueles
       * endereços ainda abrem —, portanto pedem-se juntas. Um segundo efeito
       * só para isto acrescentaria mais uma gravação de estado dentro de um
       * `useEffect`, que é o aviso que esta página já tem uma vez e não precisa
       * de ter duas.
       *
       * À PARTE do `try` de cima na prática, porque uma falha aqui não pode
       * levar a lista de versões atrás: quem não conseguiu perguntar pelo corte
       * fica sem saber do corte, e a lista continua a aparecer. O painel não
       * afirma nada sobre links cortados quando não conseguiu perguntar —
       * dizer que estão abertos seria a mentira que este ecrã não pode contar.
       */
      try {
        const r = await fetch(`/api/orcamento/${quoteId}/links`, { cache: "no-store" });
        if (r.ok) {
          const c = (await r.json()) as { corte?: { cortadoEm: string; por?: string } | null };
          setCorte(c.corte ?? null);
        }
      } catch {
        /* sem rede: o painel não afirma nada sobre o corte */
      }
    } catch {
      setErro(true);
      setVersoes([]);
    }
  }, [quoteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cortarOsLinks() {
    if (aCortar) return;
    setACortar(true);
    setErroDoCorte(null);
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/links`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        corte?: { cortadoEm: string; por?: string };
        erro?: string;
      } | null;
      if (!res.ok || !data?.corte) {
        /**
         * A caixa FECHA-SE, e o erro fica no painel.
         *
         * Deixá-la aberta parece mais atencioso e é o contrário: a frase da
         * falha é escrita no painel, ou seja ATRÁS da caixa, e quem carregou
         * ficava a olhar para uma pergunta sem resposta. Fechada, a pessoa vê
         * a frase — que diz que os links continuam a abrir — e o botão logo
         * por baixo, para tentar outra vez. Foi um teste que apanhou isto.
         */
        setAPerguntar(false);
        // A frase do servidor quando ela existe: é ela que diz que os links
        // CONTINUAM a abrir, e essa é a parte que importa.
        setErroDoCorte(
          data?.erro ??
            (res.status === 401
              ? "A sessão expirou. Entra outra vez — os links continuam como estavam."
              : "Não consegui cortar agora, e os links continuam a abrir. Tenta daqui a pouco."),
        );
        return;
      }
      setCorte(data.corte);
      setAPerguntar(false);
    } catch {
      setErroDoCorte("Não consegui cortar agora, e os links continuam a abrir. Sem ligação?");
    } finally {
      setACortar(false);
    }
  }

  const ultima = versoes?.[0];
  const ultimaId = ultima?.id;

  // O documento da última enviada vem à parte, e só quando há uma: é o único
  // que é preciso para a comparação de cima, e são 18 KB que não se pedem sem
  // haver com que comparar.
  //
  // O `ultimaId` na lista de dependências, e não o objecto: a rota devolve uma
  // versão nova a cada leitura, e comparar por identidade mandava buscar o
  // mesmo documento outra vez a cada revalidação.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!ultimaId) {
        if (vivo) setUltimoDoc(null);
        return;
      }
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/versoes?doc=${ultimaId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { doc?: ProposalDoc };
        if (vivo && data.doc) setUltimoDoc(data.doc);
      } catch {
        /* a comparação de cima simplesmente não aparece */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quoteId, ultimaId]);

  const porEnviar = useMemo(() => (ultimoDoc ? diferencas(ultimoDoc, doc) : []), [ultimoDoc, doc]);

  /**
   * O parágrafo do que mudou, pronto a inserir no email. `null` quando não há
   * ainda um envio anterior com quem comparar (a primeira proposta não tem
   * "desde a última"), quando nada mudou, ou quando a única mudança é algo que
   * o parágrafo prefere calar a arriscar dizer mal (ver `paragrafoDoQueMudou`).
   *
   * `dinheiroDaProposta`, e não uma leitura crua dos totais: é a mesma
   * correcção que as `diferencas` de cima já aplicam, pela mesma razão — os
   * valores adicionais podem somar ao total sem tocar no `totalAmount`
   * escrito.
   */
  const paragrafo = useMemo(
    () =>
      ultimoDoc
        ? paragrafoDoQueMudou(
            porEnviar,
            { antes: dinheiroDaProposta(ultimoDoc), depois: dinheiroDaProposta(doc) },
            idioma,
          )
        : null,
    [ultimoDoc, doc, porEnviar, idioma],
  );

  /** Qual foi o último pedido de reposição. Só esse pode escrever no estúdio. */
  const pedido = useRef(0);

  const restaurar = useCallback(
    async (id: string) => {
      const meu = ++pedido.current;
      setARepor(id);
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/versoes?doc=${id}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { doc?: ProposalDoc };
        // Chegou depois de ela ter pedido outra: esta já não é a versão que ela
        // está à espera de ver, e escrevê-la seria repor a errada.
        if (meu !== pedido.current) return;
        if (data.doc) onRestaurar(data.doc);
        // Uma resposta sem documento é uma falha como as outras — em silêncio,
        // o botão voltava ao normal e o estúdio ficava como estava.
        else setErro(true);
      } catch {
        if (meu === pedido.current) setErro(true);
      } finally {
        // Só o pedido em curso larga o "A repor…": senão a resposta atrasada
        // apagava o sinal de que ainda há uma reposição a caminho.
        if (meu === pedido.current) setARepor(null);
      }
    },
    [quoteId, onRestaurar],
  );

  if (versoes === null) return null;

  if (versoes.length === 0) {
    // Sem envios não há histórico, e um painel vazio a dizer "0 versões" é
    // ruído no ecrã de quem está a escrever a primeira.
    return erro ? (
      <p className="mt-5 text-xs text-foreground/50">
        Não foi possível ler o histórico de versões.
      </p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="versoes-titulo"
      className="mt-5 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4"
    >
      <h3
        id="versoes-titulo"
        className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--bo-tinta-72)]"
      >
        Versões enviadas
      </h3>

      {/* ── O que está no ecrã, comparado com a última que seguiu ─────────── */}
      {ultimoDoc && (
        <div className="mt-3 rounded-xl border border-sage-600/25 bg-sage-600/[0.05] p-3">
          <p className="text-xs font-medium text-[var(--bo-tinta-72)]">
            {porEnviar.length === 0
              ? "Esta versão está igual à última enviada"
              : porEnviar.length === 1
                ? "Uma alteração desde a última enviada"
                : `${porEnviar.length} alterações desde a última enviada`}
          </p>
          {porEnviar.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {porEnviar.map((m, i) => (
                <li key={i} className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                  <span className="text-foreground/40">{m.onde} · </span>
                  {m.texto}
                </li>
              ))}
            </ul>
          )}
          {/* ── O PARÁGRAFO PRONTO PARA O EMAIL ─────────────────────────────
              Só a partir do segundo envio (há `ultimoDoc`) e só quando há algo
              que valha a pena dizer (`paragrafo` não é `null`). Insere na
              texto do email ao cliente; nunca escreve directamente no
              email que vai sair. */}
          {paragrafo && onInserirNaMensagem && (
            <div className="mt-3 border-t border-sage-600/15 pt-3">
              <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-foreground/50">
                Para o email
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                {paragrafo}
              </p>
              <button
                type="button"
                onClick={() => onInserirNaMensagem(paragrafo)}
                className={`alvo-toque mt-2 text-[11px] font-medium text-sage-600 underline-offset-2 hover:text-[var(--bo-accent-hover)] hover:underline ${MOV_ESTADO} ${PRESSAO}`}
              >
                Inserir no email para o cliente
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── O histórico ───────────────────────────────────────────────────── */}
      <ol className="mt-3 flex flex-col gap-2">
        {versoes.map((v, i) => {
          const numero = versoes.length - i;
          const expandida = aberta === v.id;
          return (
            <li key={v.id} className="rounded-xl border border-[var(--bo-hairline-strong)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-medium text-[var(--bo-text)]">
                  {`Versão ${numero} · ${quando(v.enviadaEm)} · ${eur(v.total)}`}
                </span>
                <span className="text-[11px] text-foreground/45">
                  {ESTADO[v.estado] ?? v.estado}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">{v.resumo}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {v.mudancas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAberta(expandida ? null : v.id)}
                    aria-expanded={expandida}
                    className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline underline-offset-2 hover:text-[var(--bo-text)] ${MOV_ESTADO} ${PRESSAO}`}
                  >
                    {expandida ? "Esconder o que mudou" : "Ver o que mudou"}
                  </button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => void restaurar(v.id)}
                  disabled={aRepor === v.id}
                  className="alvo-toque text-[11px]"
                >
                  {aRepor === v.id ? "A repor…" : "Repor esta versão"}
                </Button>
              </div>

              {expandida && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--bo-hairline-strong)] pt-2">
                  {v.mudancas.map((m, j) => (
                    <li key={j} className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                      <span className="text-foreground/40">{m.onde} · </span>
                      {m.texto}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] leading-relaxed text-foreground/45">
        Repor escreve a versão antiga no rascunho — não envia nada ao cliente.
      </p>

      {/* ══════════════════════════════════════════════════════════════════
          CORTAR OS LINKS JÁ ENVIADOS
          ══════════════════════════════════════════════════════════════════

          Só aparece quando já houve envios: cortar links que não existem é
          uma pergunta sem sentido, e um botão perigoso a mais num ecrã que
          ainda não tem nada para proteger.

          Não há botão de «voltar a abrir», e é uma decisão: quem cortou fê-lo
          porque um endereço chegou a mãos erradas, e reabrir devolveria a vida
          a ESSE endereço, que ninguém sabe onde anda. A maneira de dar acesso
          outra vez é a de sempre — enviar, que cunha um endereço novo. */}
      {/* Sem condição de «há envios»: este bloco só chega aqui depois do
          `versoes.length === 0` lá em cima devolver nada. Uma verificação que
          nunca corre não é defesa em profundidade, é ruído — e a verificação
          ao contrário provou-o: tirei-a e não caiu teste nenhum. */}
      <div className="mt-4 border-t border-[var(--bo-hairline-strong)] pt-3">
        {corte ? (
          <p className="text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
            Os links enviados foram cortados a {quando(corte.cortadoEm)}
            {corte.por ? ` por ${corte.por}` : ""}. Quem tiver o endereço antigo já não abre a
            proposta. O próximo envio cunha um endereço novo, que funciona.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-foreground/45">
              Se o link foi para as mãos erradas, ou o preço saiu errado, podes fechar os endereços
              já enviados.
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setErroDoCorte(null);
                setAPerguntar(true);
              }}
              className="alvo-toque text-[11px]"
            >
              Cortar os links enviados
            </Button>
          </>
        )}
        {erroDoCorte && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--bo-perigo)]">{erroDoCorte}</p>
        )}
      </div>

      <PerguntaDestrutiva
        aberto={aPerguntar}
        onFechar={() => setAPerguntar(false)}
        titulo="Cortar os links desta proposta?"
        oQueSePerde={[
          "Todos os endereços já enviados deixam de abrir — o do email e o que tenha sido reencaminhado.",
          "O casal, se voltar ao link antigo, vê a página de link inválido.",
        ]}
        aviso="Não pode ser anulado. Para lhes dar acesso outra vez, envia a proposta — isso cunha um endereço novo."
        rotuloConfirmar={aCortar ? "A cortar…" : "Cortar os links"}
        onConfirmar={cortarOsLinks}
      />
      {erro && (
        <p className="mt-2 text-xs text-[var(--bo-perigo)]">
          Alguma coisa falhou. Tenta outra vez.
        </p>
      )}
    </section>
  );
}
