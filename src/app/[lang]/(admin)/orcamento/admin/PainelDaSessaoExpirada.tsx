"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Field, cn } from "./ui";
import { SAIDA, SAIDA_FUNDO, useSaidaDeUmSo } from "./ui/saida";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { useToast } from "./Toast";
import { useAccaoDeGuardarTudo, useInscritos } from "./registo-de-gravacoes";
import { entrarComDispositivo, mensagemDeErro, suportaPasskeys } from "@/lib/passkeys-cliente";
import { marcarSessaoAberta } from "./entrada-destino";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * O PAINEL DE REAUTENTICAÇÃO — o que aparece por cima do back office quando a
 * sessão cai a meio (a razão e o vigia que o abre estão em `SessaoExpirada.tsx`).
 *
 * Vive à parte do vigia para não ir no pacote inicial do painel: só se desenha
 * depois de um 401, e chega antes disso, aquecido como as outras janelas a
 * pedido (`janela-a-pedido.tsx`). O vigia, esse, tem de estar montado desde o
 * primeiro instante, e fica no pacote.
 */
interface Props {
  open: boolean;
  /** Fecha o painel: a sessão voltou. */
  onClose: () => void;
}

export default function PainelDaSessaoExpirada({ open: aberto, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  /**
   * A MESMA ESCOLHA QUE A ENTRADA, E COM A MESMA OMISSÃO.
   *
   * Sem este campo, o corpo do `POST /api/admin/login` ia sem `manterSessao` —
   * e o servidor lê a ausência como `true`, por retrocompatibilidade com
   * separadores antigos. Resultado: quem tinha DELIBERADAMENTE recusado a
   * sessão longa (a omissão da entrada é recusar) saía desta reautenticação
   * com um cookie de 30 dias. E é aqui que isso mais custa: este painel
   * aparece a meio do trabalho, no portátil que anda para quintas e hotéis —
   * exactamente o aparelho que a omissão a `false` existe para cobrir.
   */
  const [manterSessao, setManterSessao] = useState(false);
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(aberto);
  const dialogRef = useFocusTrap<HTMLDivElement>(aberto);
  const { toast } = useToast();
  const accao = useAccaoDeGuardarTudo();
  const inscritos = useInscritos();

  const temPasskeys = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );

  /** Quantos ecrãs têm trabalho que ainda não está no servidor. */
  const porGravar = inscritos.filter((i) => i.porGravar).length;

  /** Sempre fresco para o `concluir`, que corre fora do desenho. */
  const pendenteRef = useRef({ guardar: accao?.guardarTudo, quantos: porGravar });
  useEffect(() => {
    pendenteRef.current = { guardar: accao?.guardarTudo, quantos: porGravar };
  });

  const concluir = useCallback(() => {
    onClose();
    setPassword("");
    setCode("");
    setNeeds2fa(false);
    setErro(null);
    marcarSessaoAberta();
    // A gravação do que ficou por gravar. Não é um extra: as gravações que
    // falharam enquanto a sessão estava morta ficaram marcadas como «não chegou
    // ao servidor» e ninguém as volta a tentar sozinho — o `useGravacaoAutomatica`
    // trata um 4xx como definitivo, e bem.
    //
    // Só quando há mesmo coisa por gravar: sem isso, o «Guardar tudo» responde
    // «não havia nada por gravar», que é uma resposta a uma pergunta que
    // ninguém fez e que ensina a ignorar aquele painel.
    const { guardar, quantos } = pendenteRef.current;
    if (guardar && quantos > 0) {
      void guardar();
    } else {
      toast("Sessão renovada. Podes continuar.", "success");
    }
  }, [onClose, toast]);

  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault();
    if (aEntrar) return;
    setAEntrar(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code, manterSessao }),
      });
      if (res.ok) {
        concluir();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.needs2fa) {
        setNeeds2fa(true);
        setErro(code ? "Código de verificação inválido." : "Introduz o código de verificação.");
      } else {
        // A mesma frase do servidor, tal e qual: aqui também não se pode dizer
        // mais do que ela diz sobre a existência da conta.
        setErro(data?.error ?? "Credenciais incorretas.");
      }
    } catch {
      setErro("Erro de ligação. Tenta novamente.");
    } finally {
      setAEntrar(false);
    }
  }

  async function entrarPorDispositivo() {
    if (aEntrarComDispositivo || aEntrar) return;
    setAEntrarComDispositivo(true);
    setErro(null);
    try {
      await entrarComDispositivo({ manterSessao });
      concluir();
    } catch (err) {
      const msg = mensagemDeErro(err);
      if (msg) setErro(msg);
    } finally {
      setAEntrarComDispositivo(false);
    }
  }

  /**
   * Sair de vez. Recarrega a página INTEIRA (`location.reload`) em vez de
   * navegar pelo router: o que se quer é o servidor a voltar a decidir quem
   * está autenticado e a desenhar o ecrã de entrada, sem restos do back office
   * antigo em memória. A marca de sessão fica, para o ecrã de entrada poder
   * dizer porque é que a pessoa foi ali parar.
   */
  function sairEVoltarAEntrada() {
    window.location.reload();
  }

  /* ══════════════════════════════════════════════════════════════════════
     E A BARREIRA TAMBÉM SE VAI EMBORA
     ══════════════════════════════════════════════════════════════════════

     Entrava com a `.bo-entrada` e desaparecia A SECO: o `concluir` punha o
     `aberto` a falso e, no fotograma seguinte, o back office estava outra vez
     lá. É o pior sítio da casa para um corte, porque este é o único painel que
     COBRE O ECRÃ INTEIRO sem saída nenhuma — a pessoa acabou de escrever a
     palavra-passe e o que devia ler-se é «a barreira levantou-se», não «a
     página trocou».

     ── E NÃO ATRASA A REAUTENTICAÇÃO ──────────────────────────────────────

     O `concluir` faz tudo o que tem a fazer no instante: limpa a
     palavra-passe, marca a sessão aberta e manda gravar o que ficou por
     gravar. O `useTrincoDeScroll(aberto)` e o `useFocusTrap(aberto)` aqui em
     cima são regidos pelo ESTADO, não por isto — a página destranca-se já e o
     foco volta já ao trabalho. O que fica são 200 ms de imagem a apagar-se.

     ── E AQUI NÃO HÁ MOLDURA A LARGAR ────────────────────────────────────

     A `.bo-saida` larga os `pointer-events` dentro da própria classe, mas quem
     cobre o ecrã é esta moldura `fixed inset-0`, e ela não leva classe
     nenhuma. Sem a linha de baixo, uma barreira a desvanecer-se continuava a
     comer os toques do back office que a pessoa acabou de recuperar — e neste
     painel isso é o defeito mais caro possível: ela reentrou justamente para
     voltar a carregar em qualquer coisa. */
  const aSair = useSaidaDeUmSo(aberto);
  if (!aberto && !aSair) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[110] flex items-center justify-center px-4",
        aSair && "pointer-events-none",
      )}
    >
      {/*
       * O fundo NÃO fecha o painel ao ser clicado, e não há botão de fechar.
       * É a única coisa nesta casa desenhada assim, e é de propósito: com a
       * sessão morta, tudo o que se fizer por trás falha em silêncio e dá a
       * impressão de estar a funcionar. Fechar isto sem reautenticar seria pôr
       * a pessoa a escrever para o vazio — que é exactamente o que aconteceu da
       * primeira vez.
       */}
      {/* Dois ramos e não um `cn()` no ramo aberto: a varredura dos véus
          (`entrada-dos-fundos.test.ts`) LÊ o ficheiro em vez de o correr e
          procura a lista de classes por extenso no atributo — não sabe ler um
          `cn(…)`. O véu ABERTO fica por extenso; o ramo da saída leva o `cn`.
          Mesmo tipo e mesma posição, portanto o React reaproveita o elemento e
          a saída parte da opacidade em que ele está. O `backdrop-blur-sm` fica
          FORA das duas animações, como manda o `globals.css`. */}
      {aSair ? (
        <div
          className={cn(SAIDA_FUNDO, "absolute inset-0 bg-black/60 backdrop-blur-sm")}
          aria-hidden
        />
      ) : (
        <div className="bo-entrada bo-entrada-fundo absolute inset-0 bg-black/60 backdrop-blur-sm" />
      )}
      <div
        ref={dialogRef}
        /* Enquanto se apaga não tem `role`, não tem nome e não está no fio do
           teclado. Para quem ouve o ecrã, uma barreira que continuasse
           anunciada por cima do trabalho a que se acabou de voltar era pior do
           que não animar nada. */
        role={aSair ? undefined : "dialog"}
        aria-modal={aSair ? undefined : "true"}
        aria-labelledby={aSair ? undefined : "sessao-expirada-titulo"}
        aria-hidden={aSair || undefined}
        inert={aSair}
        /* O fundo já acendia (`bo-entrada-fundo`, aqui em cima) e a caixa que
           ele traz aparecia com a opacidade final no primeiro fotograma: meio
           gesto, com a parte que cobre o ecrã inteiro a fazer-se devagar e a
           parte que se lê a saltar para lá. Quatro píxeis e os mesmos 240 ms,
           para os dois lerem como um gesto só.

           Não atrasa nada — e aqui isso conta duas vezes, porque esta barreira
           só tem uma saída: os botões estão no sítio e clicáveis desde o
           primeiro fotograma, e o foco entra na caixa por cima da animação. */
        className={cn(
          aSair ? SAIDA : "bo-entrada",
          "relative flex max-h-[88dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] p-6 shadow-[var(--bo-sombra-modal)]",
        )}
      >
        <p className="bo-eyebrow">Sessão</p>
        <h2
          id="sessao-expirada-titulo"
          className="font-display mt-1 text-xl leading-tight text-[var(--bo-text)]"
        >
          A tua sessão expirou
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--bo-text-muted)]">
          {porGravar > 0
            ? "Nada se perdeu: o que estavas a escrever continua aqui, nesta página. Entra outra vez e é guardado logo a seguir."
            : "Nada se perdeu — esta página continua como estava. Entra outra vez para continuares."}
        </p>

        {temPasskeys && (
          <>
            <Button
              type="button"
              size="lg"
              fullWidth
              className="mt-5"
              loading={aEntrarComDispositivo}
              onClick={entrarPorDispositivo}
            >
              {aEntrarComDispositivo ? "A confirmar…" : "Entrar com este dispositivo"}
            </Button>
            <div className="my-4 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--bo-tinta-10)]" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">ou</span>
              <span className="h-px flex-1 bg-[var(--bo-tinta-10)]" />
            </div>
          </>
        )}

        <form
          onSubmit={entrarComSenha}
          className={`flex flex-col gap-3 ${temPasskeys ? "" : "mt-5"}`}
        >
          <Field
            label="O teu email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Field
            label="Palavra-passe"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {needs2fa && (
            <Field
              label="Código de verificação (2FA)"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em]"
            />
          )}
          <label className="alvo-toque flex items-start gap-2.5 text-left">
            <input
              type="checkbox"
              name="manterSessao"
              checked={manterSessao}
              onChange={(e) => setManterSessao(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sage-600"
            />
            <span className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
              Manter a sessão iniciada 30 dias neste aparelho.
            </span>
          </label>
          {erro && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-sm leading-relaxed text-[var(--bo-perigo)]"
            >
              <span aria-hidden="true">⚠</span>
              <span>{erro}</span>
            </p>
          )}
          <Button
            type="submit"
            variant={temPasskeys ? "secondary" : "primary"}
            size="lg"
            fullWidth
            loading={aEntrar}
          >
            {aEntrar ? "A verificar…" : needs2fa ? "Verificar" : "Entrar com palavra-passe"}
          </Button>
        </form>

        {/* A saída, que tem de existir mesmo não sendo a que se quer.
            Um painel sem forma nenhuma de sair pelo teclado é uma armadilha
            (WCAG 2.1.2), e a alternativa honesta não é um «fechar» que deixava
            a pessoa a escrever para o vazio: é dizer-lhe que sair daqui é
            começar de novo, e quanto é que isso custa. */}
        <button
          type="button"
          onClick={sairEVoltarAEntrada}
          className={`alvo-toque mt-4 w-full text-center text-xs text-foreground/45 underline underline-offset-4 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
        >
          {porGravar > 0
            ? "Prefiro sair e voltar à entrada (perde-se o que não foi guardado)"
            : "Prefiro sair e voltar à entrada"}
        </button>
      </div>
    </div>
  );
}
