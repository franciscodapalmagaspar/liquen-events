"use client";

import { useCallback, useMemo, useState } from "react";
import type { MotivoDeRecusa, Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import {
  acompanhamento,
  aExpirar,
  seguimentosDevidos,
  type LinhaDeAcompanhamento,
} from "@/lib/orcamento/proposta-estado";
import { opcionaisDe } from "@/lib/orcamento/versoes-da-proposta";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { reporEstadoDoPedido } from "./anular-estado";
import { Button, Card, EmptyState } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LISTA LEVE (`?semDoc=1`) EM VEZ DA PESADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel não desenha o documento nenhum. Pedia a lista inteira na mesma
 * (`/api/propostas`, chave "propostas"), com todos os mood boards e todas as
 * dezenas de caminhos de fotos de cada proposta lá dentro só para acabar sem
 * os usar. A rota tem uma forma leve para isto mesmo (`?semDoc=1`), e o
 * AdminClient já aquece a cache dela em ociosidade sob a chave
 * "propostas-leves" (ver AdminClient.tsx): sem este ecrã pedir a mesma chave,
 * esse aquecimento era deitado fora.
 *
 * A ÚNICA coisa que este painel tirava do documento era `opcionaisDe(p.doc)`,
 * para saber se a proposta tinha extras marcados. A rota leve já calcula
 * exactamente isso e chama-lhe `temOpcionais`, o mesmo facto, calculado do
 * mesmo sítio, sem trazer o documento todo para o poder ler.
 */
type PropostaLeve = Omit<Proposal, "doc"> & { temOpcionais: boolean };

/**
 * A resposta de um PATCH (`/api/propostas/[id]`) continua a vir com o
 * documento completo: só a LISTA é que veio pela rota leve. Para a
 * guardar de volta na cache partilhada sem lhe voltar a colar o `doc`
 * (o que reintroduzia o peso que a mudança acima existe para evitar),
 * troca-se `doc` por `temOpcionais`, calculado da mesma forma que a rota o
 * calcularia.
 */
function paraLeve(p: Proposal): PropostaLeve {
  const { doc, ...resto } = p;
  return { ...resto, temOpcionais: !!doc && opcionaisDe(doc).some(Boolean) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACOMPANHAMENTO — o que acontece depois de a proposta seguir
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enviar a proposta é metade do trabalho. A outra metade não tinha ecrã: a
 * proposta caía numa lista por data de criação, ao lado de rascunhos e de
 * negócios fechados há meses, e a única maneira de saber o que ainda estava
 * vivo era abrir tudo à vez.
 *
 * Aqui só está o que está EM ABERTO, por ordem do relógio que está mais perto
 * de tocar — a validade a acabar, o casamento a chegar, ou o seguimento que ela
 * marcou. A aritmética vive em `proposta-estado.ts`, sem React, e é lá que está
 * testada.
 *
 * ── NADA DISTO CHEGA AO CLIENTE ───────────────────────────────────────────
 * Não há email automático de "a sua proposta está a expirar", não há aviso do
 * lado de lá, não há forma de saber se abriu. O prazo a acabar é um lembrete
 * DELA para pegar no telefone. Foi pedido assim e é assim que está.
 */

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «0 €» NÃO É UM PREÇO — É A AUSÊNCIA DE UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria ao back office em produção apanhou isto no painel «À espera de
 * resposta»: duas clientes reais — a Ana Rita Colaço e a Catarina Martins —
 * listadas com **0 €**. Não têm orçamento de zero euros: têm o valor por
 * preencher. O `eur()` faz `n || 0`, e um `undefined` sai formatado como um
 * preço legítimo.
 *
 * É a diferença entre «este casamento vale zero» e «ainda não sabemos quanto
 * vale», e ela lê a primeira num painel que existe para decidir a quem
 * telefonar primeiro.
 *
 * ── E A UNIDADE, QUE É A OUTRA METADE ────────────────────────────────────
 * Palavras da auditoria: «Quase nenhum número diz se é com ou sem IVA no sítio
 * onde aparece. Este é o problema de texto que custa dinheiro.» O `total` de
 * uma proposta é o BRUTO (o tipo tem `subtotal`, `iva` e `total` lado a lado),
 * portanto diz-se.
 */
const eurOuSemValor = (n: number | null | undefined) =>
  typeof n === "number" && n > 0 ? `${eur(n)} c/ IVA` : "sem valor";

/** Os estados que ela pode marcar a partir daqui. */
const ESTADOS: { id: ProposalStatus; label: string; ajuda: string }[] = [
  { id: "enviada", label: "Enviada", ajuda: "Seguiu, ainda sem resposta" },
  { id: "em_negociacao", label: "Em negociação", ajuda: "Houve resposta, está a discutir-se" },
  { id: "aceite", label: "Aceite", ajuda: "Ganho" },
  { id: "rejeitada", label: "Recusada", ajuda: "Perdido" },
];

const MOTIVOS: { id: MotivoDeRecusa; label: string }[] = [
  { id: "preco", label: "Preço" },
  { id: "data", label: "Data" },
  { id: "escolheram-outro", label: "Escolheram outro" },
  { id: "sem-resposta", label: "Sem resposta" },
  { id: "outro", label: "Outro" },
];

function dataCurta(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/** "daqui a 3 dias", "hoje", "há 2 dias" — a mesma frase em todo o painel. */
function emDias(n: number): string {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `daqui a ${n} dias` : `há ${Math.abs(n)} dias`;
}

/** Hoje em "yyyy-mm-dd", no fuso de quem está a olhar. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  /** Os pedidos já carregados pelo AdminClient — dão a data do evento. */
  quotes: Quote[];
  /** Abrir o pedido correspondente no painel de detalhe. */
  onOpenQuote?: (q: Quote) => void;
  /**
   * Abre o «Fazer proposta».
   *
   * É o primeiro passo deste ecrã, e é o que faltava ao vazio: sem uma
   * proposta enviada não pode haver nada à espera de resposta, e a única saída
   * de um Acompanhamento vazio é fazer a primeira. Sem este callback o vazio
   * continua a explicar-se, só que sem botão — que é o que já fazia.
   */
  onFazerProposta?: () => void;
  /**
   * O pedido, depois de o servidor o ter movido por causa desta proposta.
   *
   * Marcar uma proposta como enviada ou aceite move o PEDIDO — e a decisão
   * vive agora no servidor, dentro do PATCH (ver `api/propostas/[id]`). Sem
   * isto, o Quadro e a lista de pedidos ficavam com a coluna antiga até ao
   * próximo carregamento do back office: a escrita estava certa e o ecrã ao
   * lado dizia o contrário.
   */
  onQuoteAtualizado?: (q: Quote) => void;
}

/**
 * O corpo de um PATCH a uma proposta.
 *
 * `null` é «APAGA ESTE CAMPO», e `undefined` não sabe dizer isso: desaparece
 * no `JSON.stringify` e o servidor, que só escreve o que vem no corpo, não
 * apaga nada. É a diferença entre retirar um seguimento e julgar que o
 * retirou.
 */
type PatchDeProposta = Partial<{ [K in keyof Proposal]: Proposal[K] | null }>;

export default function Acompanhamento({
  quotes,
  onOpenQuote,
  onFazerProposta,
  onQuoteAtualizado,
}: Props) {
  const {
    data: propostas,
    loading,
    setData,
    error,
    errorMessage,
    falha,
    refresh,
  } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  const { toast } = useToast();
  const anular = useAnular();
  const [aGravar, setAGravar] = useState<string | null>(null);
  /** Qual das linhas está com o formulário de "porque é que se perdeu" aberto. */
  const [aRecusar, setARecusar] = useState<string | null>(null);

  const linhas = useMemo(() => acompanhamento(propostas ?? [], quotes), [propostas, quotes]);
  const expirando = useMemo(() => aExpirar(linhas), [linhas]);
  const devidos = useMemo(() => seguimentosDevidos(linhas), [linhas]);

  /**
   * As propostas ACEITES que tinham extras e em que ninguém registou qual das
   * versões o casal ficou.
   *
   * Não entram na lista de cima — `acompanhamento` só devolve o que está em
   * aberto, e uma proposta ganha não está. Mas é uma pergunta por responder, e
   * as perguntas por responder é aqui que vivem. Quando estiverem todas
   * respondidas, esta secção desaparece sozinha.
   */
  const porRegistar = useMemo(
    () =>
      (propostas ?? []).filter(
        (p) => p.status === "aceite" && !p.versaoEscolhida && p.temOpcionais,
      ),
    [propostas],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * NOVE GESTOS QUE DESFAZIAM O ECRÃ EM SILÊNCIO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Todos os gestos deste painel são optimistas: a linha muda no instante do
   * clique e, se o servidor recusar, VOLTA ao que era. O aviso dizia sempre
   * «Não foi possível gravar. Verifica a ligação.» — a mesma frase para a rede
   * em baixo, a sessão expirada, a proposta apagada por outra pessoa e o
   * servidor em baixo, e sem uma palavra sobre a linha que acabou de recuar à
   * frente dela.
   *
   * É o pior sítio do back office para isso acontecer: marcar «Aceite» e ver a
   * etiqueta voltar a «Enviada» meio segundo depois, com um aviso que fala de
   * ligações, parece o ecrã a portar-se mal — e não uma gravação que não ficou.
   * Meia hora depois esta proposta está a contar como aberta e ninguém sabe
   * porquê.
   *
   * Por isso as palavras entram como DADOS a par do patch: o que se estava a
   * fazer (a nomear a proposta) e para onde é que a linha recuou.
   */
  const gravar = useCallback(
    async (
      id: string,
      patch: PatchDeProposta,
      palavras: {
        /** A frase de sucesso, como sempre foi. */
        sucesso: string;
        /** O gesto, em minúsculas e a nomear a proposta: «marcar «Ana e João» como aceite». */
        oQue: string;
        /** O que o ecrã desfez: «A linha voltou a «Enviada».» */
        reverteu: string;
      },
    ) => {
      const { sucesso: comoDizer, oQue, reverteu } = palavras;
      setAGravar(id);
      // Otimista: o ecrã muda já e desfaz-se se o servidor recusar. Ver a
      // decisão em PaymentsPanel — o mesmo padrão, pelas mesmas razões.
      //
      // No ECRÃ, `null` (que quer dizer «apaga») lê-se como campo ausente; no
      // CORPO do pedido tem de ir mesmo `null`, senão o servidor não apaga
      // nada. São duas linguagens para a mesma intenção, e é aqui que se
      // traduzem.
      const paraOEcra = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v]),
      ) as Partial<Proposal>;
      /**
       * ════════════════════════════════════════════════════════════════════
       * ACTUALIZAR A LINHA, E NÃO REPOR A LISTA INTEIRA
       * ════════════════════════════════════════════════════════════════════
       *
       * Era `const antes = propostas ?? []` — um retrato tirado ANTES do
       * `await` — e tanto o sucesso como o erro voltavam a escrever a lista
       * toda a partir dele. Numa manhã de segunda-feira marcam-se três ou
       * quatro seguidas, e as chamadas cruzam-se: a segunda gravação repunha
       * o retrato anterior à primeira e desfazia-a no ecrã. Ficava gravada no
       * servidor, mas o ecrã dizia o contrário — e é o ecrã que ela lê a
       * seguir.
       *
       * A forma funcional pega sempre na lista ACTUAL, e a reversão mexe só
       * na linha que falhou. Guardamos essa linha (e só essa) para a repor.
       */
      const linhaAntes = (propostas ?? []).find((p) => p.id === id);
      // O pedido como estava ANTES — se este gesto o puser em Ganho, é para
      // aqui que o «Anular» o devolve.
      const pedidoAntes = linhaAntes
        ? quotes.find((q) => q.id === linhaAntes.quoteId)?.status
        : undefined;
      setData((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...paraOEcra } : p)));
      const reverter = (falha: Falha) => {
        setData((prev) => (prev ?? []).map((p) => (p.id === id && linhaAntes ? linhaAntes : p)));
        toast(`${falha.mensagem} ${reverteu}`, "error");
      };
      try {
        let res: Response;
        try {
          res = await fetch(`/api/propostas/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
        } catch {
          reverter(porqueRebentou(oQue));
          return;
        }
        if (!res.ok) {
          reverter(porqueFalhou(oQue, res, await res.json().catch(() => null)));
          return;
        }
        // O PATCH devolve a proposta COMPLETA (com `doc`): esta lista só guarda
        // a forma leve, por isso converte-se antes de voltar a pousá-la na
        // cache. Sem isto, o `doc` inteiro reentrava aqui por uma porta lateral.
        //
        // Um corpo ilegível numa resposta boa conta como «não chegou»: sem isto
        // a linha ficava com a alteração no ecrã e nada no estado — que é o
        // caso pior dos dois.
        let corpo: unknown;
        try {
          corpo = await res.json();
        } catch {
          reverter(porqueRebentou(oQue));
          return;
        }
        // O `paraLeve` deita fora o que esta lista não guarda — e é ele que
        // trata do `pedido` que vem ao lado da proposta. Lê-se ANTES, do corpo
        // cru, porque é a única coisa aqui que não é da proposta.
        const pedidoMovido = (corpo as { pedido?: Quote }).pedido;
        const actualizada = paraLeve(corpo as Proposal);
        setData((prev) => (prev ?? []).map((p) => (p.id === id ? actualizada : p)));
        if (pedidoMovido) onQuoteAtualizado?.(pedidoMovido);
        if (!linhaAntes) {
          toast(comoDizer, "success");
          return;
        }
        /**
         * ── E VOLTA ATRÁS ─────────────────────────────────────────────────
         * Palavras dela: «tem que haver no site todo, em tudo aquilo que se
         * faz, uma forma de voltar atrás». O «Anular» grava os campos que este
         * gesto mexeu tal como estavam, e, se o pedido foi para Ganho, põe-no
         * de volta (com o contrato pendente que isso criou).
         */
        const inverso = Object.fromEntries(
          Object.keys(patch).map((k) => [
            k,
            (linhaAntes as unknown as Record<string, unknown>)[k] ??
              (k === "respondedAt" ? "" : null),
          ]),
        );
        anular(comoDizer, async () => {
          if (pedidoMovido && pedidoAntes && pedidoAntes !== pedidoMovido.status) {
            const reposto = await reporEstadoDoPedido({
              quoteId: pedidoMovido.id,
              de: pedidoAntes,
              para: pedidoMovido.status,
            });
            if (reposto) onQuoteAtualizado?.(reposto);
          }
          const r = await fetch(`/api/propostas/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inverso),
          });
          if (!r.ok) throw new Error("Não foi possível repor a proposta.");
          const reposta = paraLeve((await r.json()) as Proposal);
          setData((prev) => (prev ?? []).map((p) => (p.id === id ? reposta : p)));
        });
      } finally {
        setAGravar(null);
      }
    },
    [propostas, quotes, setData, toast, anular, onQuoteAtualizado],
  );

  // Este ecrã EXISTE para dizer o que está por responder. Uma leitura que
  // rebentou levava-o a afirmar "Nenhuma proposta à espera de resposta" — a
  // única frase que o dispensa de ser aberto. As validades continuam a correr
  // na mesma, e os seguimentos marcados passam sem ninguém dar por eles.
  if (error && !propostas) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as propostas"
        mensagem={errorMessage}
        /* A falha inteira, e não só a frase: com a sessão caída o «Tentar de
           novo» dá o mesmo 401, e um botão que não pode funcionar é pior do que
           nenhum — quem resolve é o painel de reentrada que aparece por cima. */
        falha={falha}
        aoTentarDeNovo={refresh}
      />
    );
  }

  if (loading && !propostas) return <SkeletonList rows={4} />;

  if (linhas.length === 0 && porRegistar.length === 0) {
    return (
      /* ── UM VAZIO VERDADEIRO, COM A SAÍDA DENTRO DELE ──────────────────
         Este é o vazio bom: as propostas foram lidas (a falha e a espera já
         saíram à frente, aqui em cima), portanto pode mesmo dizer-se que não
         há nenhuma à espera. Continua a ser um vazio e não um alarme — um
         Acompanhamento limpo é o que se quer ver.

         O que lhe faltava era a terceira coisa: o passo. Dizia o que APARECE
         aqui e não dizia como é que alguma coisa chega cá — e a resposta é
         uma só, enviar uma proposta. O botão fica no vazio, e não noutro
         canto do ecrã. */
      <EmptyState
        title="Nenhuma proposta à espera de resposta"
        description="Aqui ficam as propostas enviadas e em negociação, por ordem do que está mais perto de acabar — a validade, o casamento, ou o seguimento que marcar. Enquanto nenhuma seguir, fica assim."
        action={
          onFazerProposta ? { label: "Fazer uma proposta", onClick: onFazerProposta } : undefined
        }
      />
    );
  }

  return (
    /* ── O ESQUELETO DÁ LUGAR AO CONTEÚDO, EM VEZ DE SALTAR PARA ELE ────────
       Enquanto as propostas não chegam mostra-se um `SkeletonList` (aqui em
       cima); quando chegam, esta árvore monta de raiz e o esqueleto desaparece
       — e até aqui isso era um salto de um fotograma para o outro.

       `.bo-cena` (600 ms, doze píxeis): a banda de apresentação, porque isto é
       o sistema a apresentar um ecrã e não uma troca de estado. Uma vez só, no
       contentor — as linhas lá dentro não têm degrau próprio, que é a regra
       desta casa para listas de dados.

       A animação corre exactamente quando a espera acaba, sem código nenhum a
       coordenar as duas coisas: o `return` de cima devolve o esqueleto, este
       devolve o conteúdo, e o que monta anima. */
    <div className="bo-cena @container flex flex-col gap-4">
      {/*
        ── O resumo: as duas perguntas de segunda-feira de manhã ──────────

        DUAS COLUNAS PRIMEIRO, TRÊS SÓ QUANDO CABEM.

        Isto começou por ser `grid-cols-3` cru, para fugir ao defeito oposto: as
        três empilhadas a toda a largura (343 px cada) somavam 344 px de altura
        a 375 px, e a primeira proposta em aberto só começava aos 460. A saída
        dizia copiar o padrão do `EventCosts` — mas o que o `EventCosts` faz não
        é `grid-cols-3`: é `grid-cols-2` com `@min-[26rem]:grid-cols-3` e o
        número herói a atravessar as duas colunas em baixo.

        E a diferença mede-se. Com três colunas a 375 px cada caixa fica com
        105 px — 73 de conteúdo depois do enchimento — e nesses 73 px
        «Seguimentos devidos» parte-se em duas linhas e «Validade nos próximos
        7 dias» em três: a fila que existia para poupar altura estava a gastá-la
        em quebras de palavra, com um `text-2xl` (24 px) em cima. Com duas
        colunas são 133 px de conteúdo, as legendas cabem, e o terceiro cartão
        toma a linha de baixo inteira em vez de ficar sozinho a meia largura.

        `@container` e não `sm:` porque a pergunta é sobre a CAIXA: este bloco
        vive na vista de Acompanhamento e dentro dela a largura não é a da
        janela. O limiar (26 rem) é o mesmo do `EventCosts` e do
        `PaymentsPanel`, para os três não divergirem.

        O `padding="sm"` do `Card` (16 px) fica como estava — é a régua que a
        `Propostas.tsx` já usa nos seus cartões de resumo.
      */}
      <div className="grid grid-cols-2 @min-[26rem]:grid-cols-3 gap-3">
        <Card padding="sm">
          <p className="bo-eyebrow mb-1">Em aberto</p>
          {/* 24 px de algarismo num cartão de 105 é o que não deixava a legenda
              caber ao lado dele. `text-xl` no telemóvel, o tamanho de sempre a
              partir de 640. */}
          <p className="text-xl sm:text-2xl font-light text-[var(--bo-text)]">{linhas.length}</p>
        </Card>
        <Card padding="sm">
          <p className="bo-eyebrow mb-1">Prazo a acabar</p>
          <p
            className={`text-xl sm:text-2xl font-light ${expirando.length > 0 ? "text-[var(--bo-perigo)]" : "text-[var(--bo-text)]"}`}
          >
            {expirando.length}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-foreground/45">
            Validade nos próximos 7 dias
          </p>
        </Card>
        {/* Atravessa as duas colunas na linha de baixo — a mesma escolha que o
            `EventCosts` faz com a Margem: melhor uma linha inteira do que meia
            largura a fazer companhia a um espaço vazio. */}
        <Card padding="sm" className="col-span-2 @min-[26rem]:col-span-1">
          <p className="bo-eyebrow mb-1">Seguimentos devidos</p>
          <p
            className={`text-xl sm:text-2xl font-light ${devidos.length > 0 ? "text-[var(--bo-aviso)]" : "text-[var(--bo-text)]"}`}
          >
            {devidos.length}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-foreground/45">
            Marcados para hoje ou antes
          </p>
        </Card>
      </div>

      {/* ── QUAL DAS DUAS VERSÕES ELES FICARAM ────────────────────────────
          Só propostas que TINHAM extras, e só depois de aceites: antes disso a
          pergunta não tem resposta, e sem extras não há duas versões.

          Perguntada, não deduzida. O valor facturado não responde a isto — em
          qualquer negociação em que se fez um desconto depois de aceitar,
          deduzir dava a versão errada em silêncio. */}
      {porRegistar.length > 0 && (
        <section
          aria-labelledby="versao-escolhida-titulo"
          className="rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4"
        >
          <h3 id="versao-escolhida-titulo" className="bo-eyebrow">
            Ficaram com que versão?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            Propostas ganhas que tinham extras. É a resposta a uma pergunta só, e é a que interessa:
            os extras vendem-se?
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {porRegistar.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--bo-hairline-strong)] p-3"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--bo-tinta-72)]">
                  {`${p.clientName} · ${eurOuSemValor(p.total)}`}
                </span>
                {(
                  [
                    { id: "base", label: "Versão base" },
                    { id: "extras", label: "Com extras" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={aGravar === p.id}
                    onClick={() =>
                      gravar(
                        p.id,
                        { versaoEscolhida: v.id },
                        {
                          sucesso:
                            v.id === "base" ? "Ficaram pela versão base." : "Levaram os extras.",
                          oQue: `registar «${v.label}» na proposta de «${p.clientName}»`,
                          reverteu: "A pergunta voltou a ficar por responder.",
                        },
                      )
                    }
                    className={`alvo-toque rounded-full border border-[var(--bo-hairline-strong)] px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase text-[var(--bo-text-muted)] hover:border-sage-600/40 hover:text-[var(--bo-text)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
                  >
                    {v.label}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-col gap-3">
        {linhas.map((l) => (
          <li key={l.proposta.id}>
            <LinhaCartao
              linha={l}
              ocupada={aGravar === l.proposta.id}
              aRecusar={aRecusar === l.proposta.id}
              onRecusar={() => setARecusar(l.proposta.id)}
              onCancelarRecusa={() => setARecusar(null)}
              onEstado={(status) => {
                const para = ESTADOS.find((e) => e.id === status)?.label ?? status;
                const antes =
                  ESTADOS.find((e) => e.id === l.proposta.status)?.label ?? l.proposta.status;
                return gravar(
                  l.proposta.id,
                  { status },
                  {
                    sucesso: `${l.proposta.clientName} — ${para}`,
                    oQue: `marcar «${l.proposta.clientName}» como «${para}»`,
                    reverteu: `A linha voltou a «${antes}».`,
                  },
                );
              }}
              onMotivo={(lostReason, lostNote) => {
                setARecusar(null);
                const antes =
                  ESTADOS.find((e) => e.id === l.proposta.status)?.label ?? l.proposta.status;
                return gravar(
                  l.proposta.id,
                  { status: "rejeitada", lostReason, lostNote: lostNote || undefined },
                  {
                    sucesso: "Registado. Fica na contagem dos motivos.",
                    oQue: `registar «${l.proposta.clientName}» como recusada por «${
                      MOTIVOS.find((m) => m.id === lostReason)?.label ?? lostReason
                    }»`,
                    reverteu: `A linha voltou a «${antes}», e o motivo não ficou registado.`,
                  },
                );
              }}
              /**
               * `null` e NÃO `undefined` ao retirar.
               *
               * `JSON.stringify({ followUpAt: undefined })` é `"{}"`, e o
               * servidor só escreve o que vem no corpo (`if (k in body)`).
               * Resultado: o patch ia vazio, a data ficava na base de dados, e
               * o ecrã dizia «Seguimento retirado» na mesma.
               *
               * Isto agravou-se quando o resumo da manhã passou a contar
               * também os seguimentos das PROPOSTAS: um seguimento que ela
               * julgava ter retirado voltava a aparecer todas as manhãs, para
               * sempre, sem forma nenhuma de o apagar.
               */
              onSeguimento={(followUpAt, followUpNote) =>
                gravar(
                  l.proposta.id,
                  { followUpAt: followUpAt || null, followUpNote: followUpNote || null },
                  {
                    sucesso: followUpAt
                      ? `Seguimento a ${dataCurta(followUpAt)}`
                      : "Seguimento retirado",
                    oQue: followUpAt
                      ? `marcar o seguimento de «${l.proposta.clientName}» para ${dataCurta(followUpAt)}`
                      : `retirar o seguimento de «${l.proposta.clientName}»`,
                    reverteu: l.proposta.followUpAt
                      ? `O seguimento voltou a ${dataCurta(l.proposta.followUpAt)}.`
                      : "A linha voltou a ficar sem seguimento marcado.",
                  },
                )
              }
              onAbrirPedido={l.quote && onOpenQuote ? () => onOpenQuote(l.quote!) : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CartaoProps {
  linha: LinhaDeAcompanhamento;
  ocupada: boolean;
  aRecusar: boolean;
  onRecusar: () => void;
  onCancelarRecusa: () => void;
  onEstado: (s: ProposalStatus) => void;
  onMotivo: (m: MotivoDeRecusa, nota: string) => void;
  onSeguimento: (data: string, nota: string) => void;
  onAbrirPedido?: () => void;
}

function LinhaCartao({
  linha,
  ocupada,
  aRecusar,
  onRecusar,
  onCancelarRecusa,
  onEstado,
  onMotivo,
  onSeguimento,
  onAbrirPedido,
}: CartaoProps) {
  const { proposta: p, quote, validade, evento, seguimento, urgencia } = linha;
  const [seguimentoAberto, setSeguimentoAberto] = useState(false);
  const [dataSeguimento, setDataSeguimento] = useState(p.followUpAt ?? "");
  const [notaSeguimento, setNotaSeguimento] = useState(p.followUpNote ?? "");
  const [motivo, setMotivo] = useState<MotivoDeRecusa>("sem-resposta");
  const [notaMotivo, setNotaMotivo] = useState("");

  const borda =
    urgencia === "expirada"
      ? "border-[var(--bo-perigo)]/45"
      : urgencia === "expira-ja"
        ? "border-[var(--bo-aviso-tom)]/45"
        : "border-[var(--bo-hairline)]";

  return (
    <div className={`rounded-2xl border bg-[var(--bo-surface,#fff)] p-4 ${borda}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--bo-text)]">{p.clientName}</p>
          <p className="mt-0.5 text-xs text-foreground/45">
            {eurOuSemValor(p.total)}
            {quote?.date && ` · casamento ${dataCurta(quote.date)}`}
            {quote?.location && ` · ${quote.location}`}
          </p>
        </div>
        {onAbrirPedido && (
          <Button variant="secondary" size="sm" onClick={onAbrirPedido}>
            Abrir pedido
          </Button>
        )}
      </div>

      {/* ── Os relógios ─────────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {validade !== null && (
          <span
            className={
              validade < 0
                ? "text-[var(--bo-perigo)]"
                : validade <= 7
                  ? "text-[var(--bo-aviso)]"
                  : "text-foreground/50"
            }
          >
            {validade < 0
              ? `Validade acabou ${emDias(validade)}`
              : `Validade acaba ${emDias(validade)}`}
          </span>
        )}
        {evento !== null && <span className="text-foreground/50">Casamento {emDias(evento)}</span>}
        {seguimento !== null && (
          <span className={seguimento <= 0 ? "text-[var(--bo-aviso)]" : "text-foreground/50"}>
            Seguimento {emDias(seguimento)}
            {p.followUpNote && ` — ${p.followUpNote}`}
          </span>
        )}
      </div>

      {/* ── Estado ──────────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label={`Estado da proposta de ${p.clientName}`}
        className="mt-3 flex flex-wrap gap-1.5"
      >
        {ESTADOS.map((e) => {
          const activo = p.status === e.id;
          return (
            <button
              key={e.id}
              type="button"
              disabled={ocupada}
              aria-pressed={activo}
              title={e.ajuda}
              onClick={() => (e.id === "rejeitada" ? onRecusar() : onEstado(e.id))}
              className={`alvo-toque rounded-full border px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase disabled:opacity-50 ${ESTADO} ${PRESSAO} ${
                activo
                  ? "border-sage-600 bg-sage-600 text-white"
                  : "border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-sage-600/40 hover:text-[var(--bo-text)]"
              }`}
            >
              {e.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSeguimentoAberto((v) => !v)}
          aria-expanded={seguimentoAberto}
          className={`alvo-toque rounded-full border border-[var(--bo-hairline-strong)] px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase text-[var(--bo-text-muted)] hover:border-foreground/30 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
        >
          {p.followUpAt ? "Mudar seguimento" : "Marcar seguimento"}
        </button>
      </div>

      {/* ── Seguimento ──────────────────────────────────────────────────────
          O painel abre a partir do botão «Marcar seguimento», que está na fila
          logo acima, e aparecia num fotograma — a data, a nota e os botões
          todos de uma vez, com o cartão a crescer por baixo deles.

          `.bo-entrada` — 240 ms e QUATRO píxeis, a distância de um rótulo: sai
          do botão que se carregou e assenta. Não são os oito de uma folha,
          porque isto não vem de fora do ecrã; está preso ao gesto que o abriu.

          NADA DE `key`: este painel guarda uma data e uma nota por gravar, e
          remontá-lo deitava as duas fora. A entrada é a CLASSE do elemento que
          monta, e a montagem é a que o `{seguimentoAberto && …}` já fazia.

          Nenhum campo aqui dentro tem `autoFocus` — se algum passar a ter, esta
          classe tem de sair: uma entrada debaixo de um cursor que já assentou
          arrasta o campo quatro píxeis por baixo dele. É a armadilha que o
          `momentos-que-nao-saltam.test.ts` prende no `PerguntaDeDesfecho`. */}
      {seguimentoAberto && (
        <div className="bo-entrada mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-[var(--bo-tinta-3)] p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">
              Voltar a falar em
            </span>
            <input
              type="date"
              value={dataSeguimento}
              min={hojeISO()}
              onChange={(e) => setDataSeguimento(e.target.value)}
              className="bo-input px-2.5 py-2 text-xs"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">
              Para quê (opcional)
            </span>
            <input
              type="text"
              value={notaSeguimento}
              maxLength={200}
              placeholder="Ex.: mandar fotos do arco"
              onChange={(e) => setNotaSeguimento(e.target.value)}
              className="bo-input px-2.5 py-2 text-xs"
            />
          </label>
          <Button
            size="sm"
            disabled={ocupada}
            onClick={() => {
              onSeguimento(dataSeguimento, notaSeguimento);
              setSeguimentoAberto(false);
            }}
          >
            Guardar
          </Button>
          {p.followUpAt && (
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupada}
              onClick={() => {
                setDataSeguimento("");
                setNotaSeguimento("");
                onSeguimento("", "");
                setSeguimentoAberto(false);
              }}
            >
              Retirar
            </Button>
          )}
        </div>
      )}

      {/* ── Porque é que se perdeu ──────────────────────────────────────────
          Marcar uma proposta como perdida abre este painel, e ele aparecia num
          fotograma: a pergunta, os motivos e o campo do detalhe de uma vez só.
          É o pior sítio para um salto — é o momento em que ela acaba de dizer
          que um negócio se perdeu, e o ecrã responde-lhe com um sobressalto.

          `.bo-entrada` — 240 ms e QUATRO píxeis, a distância de um rótulo. Sai
          do botão que a abriu, que é onde ela está a olhar, e assenta. Não são
          os oito de uma folha: isto não vem de fora do ecrã.

          NADA DE `key`, pela mesma razão do painel de seguimento aqui em cima:
          o motivo escolhido e o detalhe escrito ainda não estão gravados.

          E também aqui nenhum campo tem `autoFocus` — se algum vier a ter, esta
          classe sai, senão o campo mexe-se debaixo do cursor. */}
      {aRecusar && (
        <div className="bo-entrada mt-3 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-3">
          <p className="text-[11px] text-[var(--bo-text-muted)]">
            Porque é que se perdeu? Fica só do lado de cá, e é o que permite saber daqui a um ano
            quantas se perderam por preço.
          </p>
          <div role="group" aria-label="Motivo da recusa" className="mt-2 flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={motivo === m.id}
                onClick={() => setMotivo(m.id)}
                className={`alvo-toque rounded-full border px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase ${ESTADO} ${PRESSAO} ${
                  motivo === m.id
                    ? "border-foreground/40 bg-[var(--bo-tinta-10)] text-[var(--bo-text)]"
                    : "border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-foreground/30"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={notaMotivo}
              maxLength={300}
              placeholder="Detalhe (opcional)"
              aria-label="Detalhe do motivo"
              onChange={(e) => setNotaMotivo(e.target.value)}
              className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs"
            />
            <Button size="sm" disabled={ocupada} onClick={() => onMotivo(motivo, notaMotivo)}>
              Marcar como recusada
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelarRecusa}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
