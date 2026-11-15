"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ParametrosDeslocacao } from "@/lib/orcamento/deslocacao";
import { custoPorKm, kmSugerido, sugerirDeslocacao } from "@/lib/orcamento/deslocacao";
import { lerNumero, type LimitesDoNumero } from "@/lib/numero-escrito";
import { porqueFalhou, porqueRecusou } from "@/lib/erro-do-servidor";
import { Button, Card } from "./ui";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { SkeletonList } from "./Skeleton";
import Miniaturas from "./Miniaturas";
import ValoresSuspeitos from "./ValoresSuspeitos";
import ValorEnviado from "./ValorEnviado";
import { EscolherAparencia } from "./EscolherAparencia";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS COM QUE O ESTÚDIO FAZ CONTAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Depende também de que valor está a gasolina." Este é o ecrã onde esse valor
 * se escreve — e onde se vê há quanto tempo lá está.
 *
 * ── PORQUE É QUE ISTO MOSTRA O RESULTADO ENQUANTO SE ESCREVE ───────────────
 * Um formulário de seis números é abstracto: ninguém sabe o que 0,09 €/km de
 * portagens faz a uma proposta. A pré-visualização responde à única pergunta
 * que importa — "e então quanto é que fica ir a Lisboa?" — antes de gravar, e
 * é o que permite reconhecer um engano de vírgula em vez de o descobrir na
 * proposta seguinte.
 */

interface Parametros {
  deslocacao: ParametrosDeslocacao;
  margemMinima: number;
  definidoEm: Record<string, string>;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

/** "há 4 meses", "hoje", "nunca" — a idade de um número, dita como se fala. */
function idade(iso: string | undefined): string {
  if (!iso || iso.startsWith("1970")) return "nunca confirmado";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(dias)) return "nunca confirmado";
  if (dias <= 0) return "definido hoje";
  if (dias === 1) return "definido ontem";
  if (dias < 30) return `definido há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "definido há 1 mês" : `definido há ${meses} meses`;
}

/** A partir de seis semanas, o preço do gasóleo deixa de merecer confiança. */
function velho(iso: string | undefined): boolean {
  if (!iso || iso.startsWith("1970")) return true;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isNaN(dias) || dias > 42;
}

/** O número como ela o escreve: vírgula decimal. */
const comVirgula = (n: number) => String(n).replace(".", ",");

/**
 * Um campo numérico com unidade, que aceita vírgula como decimal — e que DIZ
 * quando o que lá está não dá um número que sirva.
 *
 * ── O QUE ESTE CAMPO CALAVA ───────────────────────────────────────────────
 * `abc`, `-2,5`, `1,72 €` ou o campo apagado não chegavam ao formulário: o
 * `onChange` era simplesmente saltado e o parâmetro ficava com o valor
 * ANTERIOR. O ecrã mostrava o que ela escreveu, o botão gravava o valor velho,
 * e o aviso verde dizia «Guardado. As propostas seguintes já usam estes
 * valores.» — sobre uma gravação que não era a dela. O preço do gasóleo velho
 * seguia dentro da deslocação cobrada ao cliente.
 *
 * Continua a não emitir um número que não serve (o formulário nunca fica com
 * lixo dentro), mas agora conta-o para cima: a frase aparece por baixo do
 * campo enquanto se escreve, e é ela que trava o botão.
 */
function Numero({
  label,
  unidade,
  valor,
  limites,
  erro,
  onChange,
  onErro,
  ajuda,
}: {
  label: string;
  unidade: string;
  valor: number;
  limites: LimitesDoNumero;
  erro?: string;
  onChange: (n: number) => void;
  onErro: (porque: string | null) => void;
  ajuda?: string;
}) {
  const idErro = useId();
  // O estado local é TEXTO: com número, escrever "1," apagava a vírgula ao
  // reformatar e era impossível chegar a "1,72".
  const [texto, setTexto] = useState(() => comVirgula(valor));
  /**
   * ── O TEXTO SÓ SE REESCREVE QUANDO O NÚMERO VEM DE FORA ───────────────────
   *
   * O estado local de texto não chegava sozinho: o efeito reescrevia-o a partir
   * do `valor` que ele PRÓPRIO acabava de provocar. E `Number("1,")` é 1 — por
   * isso apagar o "5" de "1,65" punha o formulário a 1, o efeito devolvia "1"
   * ao campo, e a vírgula desaparecia debaixo dos dedos. O "8" seguinte colava-
   * se ao "1": 18 €/litro, dez vezes o preço do gasóleo, na deslocação de todas
   * as propostas seguintes.
   *
   * Guardando o último número que este campo emitiu, distingue-se o eco da
   * própria escrita (não se toca no texto) de um número que veio de fora — a
   * leitura inicial, ou a resposta de uma gravação —, que é a única altura em
   * que o campo tem mesmo de ser reescrito.
   */
  const emitido = useRef(valor);
  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(comVirgula(valor));
  }, [valor]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            const escrito = e.target.value;
            setTexto(escrito);
            const leitura = lerNumero(escrito, limites);
            if (!leitura.ok) {
              // Um campo vazio é um campo a meio de ser escrito, e não zero.
              // `Number("")` é 0, e era esse 0 que ficava nos parâmetros: um
              // clique em «Guardar» a seguir tirava o combustível da conta da
              // deslocação de todas as propostas, sem ninguém o ter pedido.
              // O formulário continua a não receber isto — mas deixa de ser um
              // silêncio: a frase fica no campo e o botão sabe dela.
              onErro(leitura.porque);
              return;
            }
            onErro(null);
            if (leitura.valor === null) return;
            emitido.current = leitura.valor;
            onChange(leitura.valor);
          }}
          className={`bo-input w-24 px-2.5 py-2 text-xs${erro ? " border-[var(--bo-perigo)]" : ""}`}
        />
        <span className="text-[11px] text-foreground/45">{unidade}</span>
      </span>
      {/**
       * ── A FRASE DE ERRO OCUPA O LUGAR DA AJUDA, NÃO SE SOMA A ELA ────────
       *
       * A auditoria queixa-se de que a mensagem «empurra o resto do formulário
       * para baixo». Empurrava: aparecia POR CIMA da ajuda, e a linha crescia.
       *
       * A saída óbvia — reservar uma linha em branco debaixo de cada campo —
       * foi RECUSADA, e vale a pena dizer porquê: os quatro campos vivem numa
       * fila que embrulha, e num telemóvel de 390 px embrulham a dois por
       * linha. Reservar custava duas linhas vazias PARA SEMPRE, num ecrã que
       * ela já disse estar «tudo enorme», para evitar um salto que só acontece
       * enquanto se escreve um valor inválido.
       *
       * Trocar é de graça e é melhor: quando há um erro, a ajuda é a coisa
       * menos útil no ecrã. Onde não há ajuda, o salto fica — de uma linha, e
       * assumido.
       */}
      {erro ? (
        <span id={idErro} className="text-[10px] leading-relaxed text-[var(--bo-perigo)]">
          {erro}
        </span>
      ) : (
        ajuda && <span className="text-[10px] leading-relaxed text-foreground/40">{ajuda}</span>
      )}
    </label>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CAMPO DA SEDE — TEXTO, E NÃO UMA LISTA PARA ESCOLHER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma lista de localidades obrigaria a sede a ser uma das que já conhecemos, e
 * era exactamente essa a queixa: «aquilo está apenas com algumas localidades».
 * Texto livre aceita qualquer terra do país. O que a tabela de geografia sabe
 * continua a servir — para SUGERIR quilómetros —, e quando não sabe, o ecrã
 * di-lo em vez de ficar mudo.
 *
 * Não emite o valor quando o campo está vazio, pela mesma razão que o `Numero`:
 * um campo apagado é uma edição a meio, e deixá-lo seguir era gravar uma sede
 * em branco (ou, pior, deixar seguir a antiga com um «Guardado» a verde por
 * cima). A frase fica no campo e é ela que trava o botão.
 */
function Texto({
  label,
  valor,
  erro,
  onChange,
  onErro,
  ajuda,
  placeholder,
}: {
  label: string;
  valor: string;
  erro?: string;
  onChange: (v: string) => void;
  onErro: (porque: string | null) => void;
  ajuda?: React.ReactNode;
  placeholder?: string;
}) {
  const idErro = useId();
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">{label}</span>
      <input
        type="text"
        value={valor}
        placeholder={placeholder}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
        onChange={(e) => {
          const escrito = e.target.value;
          onErro(escrito.trim() ? null : "Escreve a terra de onde parte a carrinha (ex.: Évora).");
          onChange(escrito);
        }}
        className={`bo-input w-56 px-2.5 py-2 text-xs${erro ? " border-[var(--bo-perigo)]" : ""}`}
      />
      {/* A mesma troca do campo de número, e pela mesma razão — ver lá. */}
      {erro ? (
        <span id={idErro} className="text-[10px] leading-relaxed text-[var(--bo-perigo)]">
          {erro}
        </span>
      ) : (
        ajuda && <span className="text-[10px] leading-relaxed text-foreground/40">{ajuda}</span>
      )}
    </label>
  );
}

/**
 * Os limites são os do servidor, campo a campo (ver `deslocacaoSchema` na rota
 * `/api/proposta-definicoes`). Estão aqui repetidos de propósito: o servidor
 * continua a ser quem decide — isto é só o ecrã a dizer a mesma coisa a tempo
 * de ela poder corrigir, em vez de a descobrir num 400 ou, pior, num «Guardado»
 * que não guardou.
 *
 * ── E O CAMPO EM BRANCO? ──────────────────────────────────────────────────
 * É um ERRO, e não «não mexer». Nenhum destes números tem estado «por definir»:
 * a conta da deslocação precisa dos seis, e por isso um campo vazio não é uma
 * instrução — é uma edição a meio. Tratá-lo como «fica o que lá estava» seria
 * pôr o ecrã a discordar do que está gravado (o campo em branco, o servidor com
 * 2 €/l) e era exactamente esse desencontro que fazia o preço velho seguir para
 * as propostas seguintes. Quem quer mesmo apagar não quer apagar: quer
 * reescrever, e a frase diz-lhe isso.
 */
const LIMITES: Record<string, LimitesDoNumero> = {
  precoLitro: { min: 0, max: 20, nome: "preço do gasóleo", exemplo: "1,72" },
  consumoLPor100Km: { min: 0, max: 100, nome: "consumo da carrinha", exemplo: "9" },
  portagensPorKm: { min: 0, max: 5, nome: "custo das portagens", exemplo: "0,09" },
  desgastePorKm: { min: 0, max: 5, nome: "desgaste por quilómetro", exemplo: "0,10" },
  franquiaKm: { min: 0, max: 1000, nome: "número de quilómetros", exemplo: "40" },
  margemMinima: { min: 0, max: 100, nome: "margem mínima", exemplo: "35" },
};

/** Que campos pertencem a cada botão de gravar. */
const CAMPOS_DE = {
  deslocacao: [
    "base",
    "precoLitro",
    "consumoLPor100Km",
    "portagensPorKm",
    "desgastePorKm",
    "franquiaKm",
  ] as const,
  margem: ["margemMinima"] as const,
};

/** Grava uma secção; devolve as definições como ficaram, ou atira a razão. */
async function porNoServidor(id: "deslocacao" | "margem", valor: object): Promise<Parametros> {
  const res = await fetch("/api/proposta-definicoes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, valor }),
  });
  if (!res.ok) {
    // A recusa do servidor tal como ele a explica — em português, e não
    // «não foi possível guardar», que não diz o que fazer a seguir.
    throw new Error((await porqueRecusou(res)) ?? "Não foi possível guardar.");
  }
  return (await res.json()) as Parametros;
}

/** O `valor` de uma secção, tirado das definições gravadas. */
const valorDe = (p: Parametros, id: "deslocacao" | "margem"): object =>
  id === "deslocacao" ? p.deslocacao : { minima: p.margemMinima };

export default function DefinicoesProposta({
  onAbrirReciclagem,
}: {
  /** Abre a vista da Reciclagem (fase R3). Sem ele, a linha não aparece. */
  onAbrirReciclagem?: () => void;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  const [p, setP] = useState<Parametros | null>(null);
  /**
   * O que está GRAVADO, à parte do que está escrito. O `p` muda a cada tecla;
   * o «Anular» de um «Guardar» tem de repor o que estava no servidor antes
   * dele, e esse valor só existe aqui.
   */
  const gravado = useRef<Parametros | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  /** O que está escrito e não dá um número que sirva, campo a campo. */
  const [porCorrigir, setPorCorrigir] = useState<Record<string, string>>({});

  const marcar = useCallback((campo: string, porque: string | null) => {
    setPorCorrigir((antes) => {
      if (!porque) {
        if (!(campo in antes)) return antes;
        const { [campo]: _fora, ...resto } = antes;
        void _fora;
        return resto;
      }
      return antes[campo] === porque ? antes : { ...antes, [campo]: porque };
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/proposta-definicoes")
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j?.error ?? "Não foi possível ler as definições.");
        else {
          gravado.current = j as Parametros;
          setP(j as Parametros);
        }
      })
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    return () => {
      vivo = false;
    };
  }, []);

  const gravar = useCallback(
    async (id: "deslocacao" | "margem", valor: object) => {
      /**
       * Um campo por corrigir trava o botão — e o que trava é DITO, com a
       * frase do campo. Deixar seguir daqui era mandar ao servidor o valor
       * antigo com cara de novo: 200, aviso verde, e o preço velho dentro da
       * deslocação de todas as propostas seguintes.
       */
      const problema = CAMPOS_DE[id].map((c) => porCorrigir[c]).find(Boolean);
      if (problema) {
        toast(`Não foi guardado: ${problema}`, "error");
        return;
      }
      setAGravar(true);
      try {
        const antes = gravado.current;
        const agora = await porNoServidor(id, valor);
        gravado.current = agora;
        setP(agora);
        const feito = "Guardado. As propostas seguintes já usam estes valores.";
        if (!antes) {
          toast(feito, "success");
          return;
        }
        // O «Anular» grava a secção como estava antes deste «Guardar».
        anular(feito, async () => {
          try {
            const reposto = await porNoServidor(id, valorDe(antes, id));
            gravado.current = reposto;
            setP(reposto);
            return true;
          } catch (e) {
            toast(porqueFalhou(e, "Não foi possível anular. Verifica a ligação."), "error");
            return false;
          }
        });
      } catch (e) {
        // Medido com a ligação cortada a meio do PUT: o aviso que aparecia no
        // ecrã era «Failed to fetch» — a frase do browser, em inglês, e que não
        // diz o que interessa (o valor NÃO ficou gravado). O `porqueFalhou`
        // separa a queixa desta casa, que passa intacta, da do browser, que dá
        // lugar a esta frase.
        toast(porqueFalhou(e, "Não foi possível guardar. Verifica a ligação."), "error");
      } finally {
        setAGravar(false);
      }
    },
    [toast, anular, porCorrigir],
  );

  if (erro) {
    return (
      <Card padding="md">
        <p className="text-xs leading-relaxed text-[var(--bo-perigo)]">{erro}</p>
      </Card>
    );
  }
  if (!p) return <SkeletonList rows={2} />;

  const d = p.deslocacao;
  const custo = custoPorKm(d);
  /**
   * A tabela de geografia conhece a terra que ela escreveu como sede?
   *
   * `kmSugerido(base, base)` é zero quando conhece e `null` quando não — por
   * isso a comparação é com `null` e não um `if` sobre o número, que trataria
   * a casa a zero quilómetros de si própria como «não sei onde é».
   */
  const sedeConhecida = kmSugerido(d.base, d.base) !== null;
  // Três destinos reais, para o número deixar de ser abstracto. Medidos a
  // partir da sede escrita — mudá-la muda estes três antes de se gravar.
  const exemplos = ["Évora", "Palmela", "Porto"]
    .map((sitio) => ({ sitio, s: sugerirDeslocacao(sitio, d) }))
    .filter((x) => x.s !== null);
  const desactualizado = velho(p.definidoEm.deslocacao);

  /**
   * ── A PRÉ-VISUALIZAÇÃO NÃO PODE MOSTRAR O NÚMERO ANTIGO EM SILÊNCIO ───────
   *
   * Achado F-11 de uma auditoria em produção: «escrevi -99999 em Preço do
   * gasóleo. A mensagem de erro aparece correctamente. Mas a pré-visualização
   * por baixo continua a mostrar 0,40 €/km, o valor antigo, sem avisar que está
   * desactualizada.»
   *
   * Continuava, e por uma razão que é uma boa decisão a produzir um mau efeito:
   * um campo que não dá um número que sirva NÃO emite valor (é o que impede um
   * `Number("")` de gravar zero no preço do gasóleo). O formulário fica com o
   * último valor bom — e a conta por baixo mostra-o, com toda a confiança.
   *
   * É a queixa dela sobre os valores outra vez, em ponto pequeno: o ecrã a
   * mostrar um número que não é o que está à frente dos olhos. Um número em que
   * ela não pode confiar vale menos do que número nenhum.
   *
   * Com um campo por corrigir, a conta cala-se e diz o que falta. Volta assim
   * que o campo voltar a dar um número.
   */
  const contaSuspensa = CAMPOS_DE.deslocacao.some((c) => porCorrigir[c]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── A APARÊNCIA, E PORQUE É QUE ELA VEM PRIMEIRO ────────────────────
          É a única definição desta vista que muda o ecrã INTEIRO e à vista, no
          instante em que se carrega. Pô-la a seguir a três painéis de números
          era escondê-la de quem vem cá procurá-la — e quem procura o modo
          escuro procura-o uma vez, para o ligar, e nunca mais.

          O degrau da escada é o −1: entra antes de tudo o resto, porque é o
          bloco que enquadra a vista. */}
      <Card padding="md" style={{ "--cena": 0 } as React.CSSProperties} className="bo-cena">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-[var(--bo-text)]">Aparência</h2>
            <p className="mt-0.5 text-[13px] text-[var(--bo-text-muted)]">
              Automático segue o computador — escurece com ele ao fim do dia.
            </p>
          </div>
          <EscolherAparencia />
        </div>
      </Card>

      {/* A Reciclagem (fase R3 do «tudo reversível»): o que se apaga fica lá
          30 dias. Não está no menu — é um destino de vez em quando —, e é aqui
          que se procura «onde foi parar o que apaguei». */}
      {onAbrirReciclagem && (
        // Sem degrau próprio: a escada desta vista já tem os quatro da casa
        // (`vistas-que-se-compoem.test.ts`), e esta linha anda com a Aparência.
        <Card padding="md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-[var(--bo-text)]">Reciclagem</h2>
              <p className="mt-0.5 text-[13px] text-[var(--bo-text-muted)]">
                O que se apaga fica lá 30 dias, e pode voltar tal e qual.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onAbrirReciclagem}>
              Abrir a Reciclagem
            </Button>
          </div>
        </Card>
      )}

      {/* ── A ESCADA DESTA VISTA ────────────────────────────────────────────
          Três blocos, pela ordem de leitura: a deslocação (0), a margem mínima
          (1) e as ferramentas que olham para a base inteira (2). A escada é a
          da casa (`.bo-cena` no `globals.css`) — 600 ms, degraus de 20 ms,
          tecto ao sexto degrau, desligada em `prefers-reduced-motion`.

          O primeiro degrau é agora a aparência (o bloco aqui em cima, que
          enquadra a vista); o segundo é o painel da deslocação, que é o que ela
          vem cá confirmar: o preço do gasóleo muda todas as semanas. */}
      <Card padding="md" style={{ "--cena": 1 } as React.CSSProperties} className="bo-cena">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--bo-text)]">Deslocação</h2>
          <span
            className={`text-[11px] ${desactualizado ? "text-[var(--bo-perigo)]" : "text-foreground/45"}`}
          >
            {idade(p.definidoEm.deslocacao)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
          A deslocação é uma conta: quilómetros de ida e volta a partir de{" "}
          {d.base.trim() || "onde a casa está"}, vezes o custo de cada quilómetro. O gasóleo muda
          todas as semanas — este número tem de ser teu, não do programa.
        </p>

        {desactualizado && (
          <p className="mt-3 rounded-xl border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.06] p-3 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
            {p.definidoEm.deslocacao?.startsWith("1970")
              ? "Estes valores nunca foram confirmados — são um ponto de partida escrito por quem não abastece a carrinha. Confirma o preço do gasóleo antes de a próxima proposta o usar."
              : "O preço do gasóleo já tem algumas semanas. Vale a pena confirmá-lo: o desvio já se nota numa viagem ao Porto."}
          </p>
        )}

        {/* ── DE ONDE PARTE A CARRINHA ───────────────────────────────────
            Primeiro campo do grupo, e não um pormenor no fim: é ele que decide
            o significado de todos os outros. A franquia são 40 km à volta
            DAQUI, e os quilómetros de cada proposta contam-se DAQUI. */}
        <div className="mt-4">
          <Texto
            label="Local da sede"
            valor={d.base}
            placeholder="Évora"
            erro={porCorrigir.base}
            onErro={(porque) => marcar("base", porque)}
            onChange={(base) => setP({ ...p, deslocacao: { ...d, base } })}
            ajuda="De onde a carrinha parte. É a partir daqui que se contam os quilómetros de cada proposta — e é à volta daqui que vale a isenção."
          />
          {!sedeConhecida && d.base.trim() && (
            <p className="mt-2 max-w-prose rounded-xl border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.06] p-3 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
              Fica gravado, mas não conheço essa terra na tabela de distâncias — por isso não
              consigo sugerir quilómetros sozinho. Em cada proposta escreves tu os quilómetros no
              painel da deslocação, e a conta faz-se na mesma. Se preferires que sugira, escreve
              aqui a cidade ou vila mais próxima.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <Numero
            label="Preço do gasóleo"
            unidade="€/litro"
            valor={d.precoLitro}
            limites={LIMITES.precoLitro}
            erro={porCorrigir.precoLitro}
            onErro={(porque) => marcar("precoLitro", porque)}
            onChange={(precoLitro) => setP({ ...p, deslocacao: { ...d, precoLitro } })}
            ajuda="O que paga na bomba onde abastece."
          />
          <Numero
            label="Consumo da carrinha"
            unidade="l/100 km"
            valor={d.consumoLPor100Km}
            limites={LIMITES.consumoLPor100Km}
            erro={porCorrigir.consumoLPor100Km}
            onErro={(porque) => marcar("consumoLPor100Km", porque)}
            onChange={(consumoLPor100Km) => setP({ ...p, deslocacao: { ...d, consumoLPor100Km } })}
          />
          <Numero
            label="Portagens"
            unidade="€/km"
            valor={d.portagensPorKm}
            limites={LIMITES.portagensPorKm}
            erro={porCorrigir.portagensPorKm}
            onErro={(porque) => marcar("portagensPorKm", porque)}
            onChange={(portagensPorKm) => setP({ ...p, deslocacao: { ...d, portagensPorKm } })}
          />
          <Numero
            label="Desgaste"
            unidade="€/km"
            valor={d.desgastePorKm}
            limites={LIMITES.desgastePorKm}
            erro={porCorrigir.desgastePorKm}
            onErro={(porque) => marcar("desgastePorKm", porque)}
            onChange={(desgastePorKm) => setP({ ...p, deslocacao: { ...d, desgastePorKm } })}
            ajuda="Pneus, revisões, o que a carrinha perde por andar."
          />
          <Numero
            label="Sem cobrar até"
            unidade="km"
            valor={d.franquiaKm}
            limites={LIMITES.franquiaKm}
            erro={porCorrigir.franquiaKm}
            onErro={(porque) => marcar("franquiaKm", porque)}
            onChange={(franquiaKm) => setP({ ...p, deslocacao: { ...d, franquiaKm } })}
            ajuda={`A isenção à volta de ${d.base.trim() || "casa"}, que as condições prometem.`}
          />
        </div>

        {/* ── 227×30 NUM TELEMÓVEL ──────────────────────────────────────────
            MEDIDO a 375 px com o auditor de `e2e/ergonomia-tactil.mjs`: o alvo
            deste interruptor era 227×30 — abaixo dos 44 de altura. O quadrado
            desenhado continua com 16 px; quem cresce é o RÓTULO à volta, que é
            o que o HTML manda tocar (é o padrão que a lista de pedidos já
            usava). `alvo-toque` só age sob `(pointer: coarse)`, portanto no
            portátil esta linha fica exactamente como estava.

            Não foi apanhado antes porque o passeio do telemóvel nunca visitava
            as Definições — passou a visitar (ver `e2e/admin-mobile.spec.ts`). */}
        <label className="alvo-toque !justify-start mt-3 inline-flex items-center gap-2.5 py-1.5 text-[var(--bo-text-muted)]">
          <input
            type="checkbox"
            checked={d.idaEVolta}
            onChange={(e) => setP({ ...p, deslocacao: { ...d, idaEVolta: e.target.checked } })}
            className="h-4 w-4 accent-sage-600"
          />
          <span className="text-[11px]">Cobrar ida e volta (a carrinha vai e vem)</span>
        </label>

        {/* ── O que isto faz, em euros ─────────────────────────────────── */}
        <div className="mt-4 rounded-xl bg-[var(--bo-tinta-3)] p-3">
          {contaSuspensa ? (
            <p className="text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
              <strong className="font-semibold text-[var(--bo-text)]">—</strong> Não mostro o custo
              por quilómetro enquanto houver um campo por corrigir: o que aparecia aqui era o valor
              ANTERIOR, e isso é pior do que não mostrar nada. Corrige o campo marcado a vermelho e
              a conta volta.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--bo-text-muted)]">
                Cada quilómetro fica a{" "}
                <strong className="font-semibold text-[var(--bo-text)]">{eur(custo.total)}</strong>{" "}
                <span className="text-foreground/45">
                  (combustível {eur(custo.combustivel)} + portagens {eur(custo.portagens)} +
                  desgaste {eur(custo.desgaste)})
                </span>
              </p>
              {exemplos.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--bo-text-muted)]">
                  {exemplos.map(({ sitio, s }) => (
                    <li key={sitio}>
                      <span className="text-foreground/45">{sitio}:</span>{" "}
                      <strong className="font-semibold text-[var(--bo-text)]">
                        {eur(s!.valor)}
                      </strong>{" "}
                      <span className="text-foreground/40">({s!.formula})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                // Sem exemplos, o custo por quilómetro fica a ser um número
                // abstracto — que era exactamente o que a pré-visualização veio
                // resolver. Dizer porquê é melhor do que uma lista vazia.
                <p className="mt-2 text-[11px] leading-relaxed text-foreground/45">
                  Sem uma sede que eu conheça não consigo dar exemplos em euros. O custo por
                  quilómetro acima continua a valer: multiplica-o pelos quilómetros que escreveres
                  em cada proposta.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-3">
          <Button size="sm" disabled={aGravar} onClick={() => gravar("deslocacao", d)}>
            Guardar deslocação
          </Button>
        </div>
      </Card>

      {/* Segundo degrau, e o degrau vai no CARTÃO: lá dentro há um número que
          ela lê para decidir, e um número não chega separado da frase que o
          explica. */}
      <Card padding="md" style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--bo-text)]">Margem mínima</h2>
          <span className="text-[11px] text-foreground/45">{idade(p.definidoEm.margem)}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
          Abaixo desta percentagem o estúdio avisa enquanto escreve a proposta. Não impede nada — há
          eventos que se fazem com margem baixa de propósito.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Numero
            label="Avisar abaixo de"
            unidade="%"
            valor={p.margemMinima}
            limites={LIMITES.margemMinima}
            erro={porCorrigir.margemMinima}
            onErro={(porque) => marcar("margemMinima", porque)}
            onChange={(margemMinima) => setP({ ...p, margemMinima })}
          />
          <Button
            size="sm"
            disabled={aGravar}
            onClick={() => gravar("margem", { minima: p.margemMinima })}
          >
            Guardar margem
          </Button>
        </div>
      </Card>

      {/* ── TERCEIRO E ÚLTIMO DEGRAU: AS FERRAMENTAS DA BASE INTEIRA ───────
          As três entram juntas, numa caixa só, porque são o mesmo bloco — três
          leituras sobre o conjunto, e não três assuntos. Dar um degrau a cada
          uma seria partir o ecrã em pedaços só para haver escada. A caixa
          repete o `flex flex-col gap-4` do pai para o espaçamento não mudar. */}
      <div style={{ "--cena": 3 } as React.CSSProperties} className="bo-cena flex flex-col gap-4">
        {/*
          MANUTENÇÃO DAS FOTOGRAFIAS.

          Aqui e não nos Temas porque não é uma acção sobre UM tema: percorre a
          biblioteca inteira e também as pastas das propostas. E vive dentro deste
          componente, e não no `AdminClient`, para viajar no mesmo pedaço de
          código que já é carregado só quando esta vista abre.
        */}
        <Miniaturas />

        {/*
          A AUDITORIA DOS VALORES INCHADOS.

          Ao lado da manutenção das fotografias e pela mesma razão: é uma leitura
          sobre a base inteira, não é uma acção sobre UMA proposta, e não tem
          lugar nenhum dentro do estúdio — quem a corre está a olhar para o
          conjunto, e não para um casamento.
        */}
        <ValoresSuspeitos />
        <ValorEnviado />
      </div>
    </div>
  );
}
