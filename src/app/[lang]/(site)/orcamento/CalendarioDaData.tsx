"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dataNoCampo,
  dataPorExtenso,
  diasDaSemana,
  fimDaSemana,
  inicioDaSemana,
  isoDe,
  mesInicial,
  nomesDosMeses,
  partesDe,
  semanasDoMes,
  somarDias,
  somarMeses,
  tituloDoMes,
} from "@/lib/orcamento/calendario-da-data";

/**
 * O calendário da «Data do evento», no computador.
 *
 * Pedido dela, 28/10, com a captura do calendário do Chrome por baixo do campo
 * (azul e cinzento, com «Limpar» e «Hoje»): «quero melhorar isto para ficar ao
 * estilo da apple». O calendário que se via era o do browser, que não se deixa
 * desenhar — por isso aqui é um calendário nosso, com o desenho do da Apple:
 * o mês em título, as setas à direita, as iniciais dos dias, o dia de hoje na
 * cor da casa e o escolhido num círculo cheio.
 *
 * SÓ NO COMPUTADOR. No telemóvel o campo continua a ser o `<input type="date">`
 * e abre a roda do sistema — no iPhone é a da própria Apple, e nenhum
 * calendário desenhado numa página se usa melhor com o dedo. Quem decide é o
 * `OrcamentoForm`, pelo tipo de ponteiro.
 *
 * Teclado, como o calendário de um sistema: setas (dia e semana), Início/Fim
 * (semana), PageUp/PageDown (mês; com Shift, ano), Enter/Espaço para escolher,
 * Escape para fechar e voltar ao campo. Os dias antes do `minimo` vêem-se mas
 * não se escolhem — o `okData` do formulário continua a ser quem manda.
 */

export type TextosDoCalendario = {
  escolher: string;
  calendario: string;
  mesAnterior: string;
  mesSeguinte: string;
  anoAnterior: string;
  anoSeguinte: string;
  escolherMes: string;
  hoje: string;
  passou: string;
};

type Props = {
  id: string;
  /** O id do rótulo do campo: o nome do botão é «rótulo + data escolhida». */
  rotuloId: string;
  valor: string;
  minimo: string;
  desligado?: boolean;
  descritoPor?: string;
  locale: string;
  textos: TextosDoCalendario;
  className?: string;
  botaoRef?: React.RefObject<HTMLButtonElement | null>;
  aoMudar: (iso: string) => void;
  /** Ao fechar (escolhendo ou não) — é aí que o campo conta como «visto». */
  aoFechar?: () => void;
};

function hojeAqui(): string {
  const d = new Date();
  return isoDe(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function CalendarioDaData({
  id,
  rotuloId,
  valor,
  minimo,
  desligado,
  descritoPor,
  locale,
  textos,
  className,
  botaoRef,
  aoMudar,
  aoFechar,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [vista, setVista] = useState<"dias" | "meses">("dias");
  const [mostrado, setMostrado] = useState({ ano: 2026, mes: 0 });
  const [foco, setFoco] = useState("");
  const [hoje, setHoje] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const botaoProprio = useRef<HTMLButtonElement | null>(null);
  const botao = botaoRef ?? botaoProprio;
  const valorId = useId();
  const tituloId = useId();

  // A caixa desenha-se no `body`, por cima de tudo, presa ao campo. Dentro do
  // formulário ficava POR TRÁS das secções seguintes (medido: «O espaço é
  // interior ou exterior?» passava por cima dos dias), porque cada secção que
  // entra com animação abre a sua própria camada.
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = botao.current?.getBoundingClientRect();
      if (!r) return;
      const alto = caixa.current?.offsetHeight ?? 380;
      const largo = caixa.current?.offsetWidth ?? 312;
      let top = r.bottom + 8;
      // Sem espaço em baixo e com espaço em cima, abre para cima.
      if (top + alto > window.innerHeight - 8 && r.top - alto - 8 > 8) top = r.top - alto - 8;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - largo - 8));
      setPosicao({ top, left });
    };
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto, vista, botao]);

  const antesDoMinimo = useCallback((iso: string) => !!minimo && iso < minimo, [minimo]);

  const abrir = () => {
    if (desligado) return;
    const h = hojeAqui();
    const primeiro = partesDe(valor) ? valor : minimo && minimo > h ? minimo : h;
    setHoje(h);
    setFoco(primeiro);
    setMostrado(mesInicial(primeiro, h));
    setVista("dias");
    setAberto(true);
  };

  const fechar = useCallback(
    (voltarAoCampo: boolean) => {
      setAberto(false);
      if (voltarAoCampo) botao.current?.focus();
      aoFechar?.();
    },
    [aoFechar, botao],
  );

  const escolher = (iso: string) => {
    if (antesDoMinimo(iso)) return;
    aoMudar(iso);
    fechar(true);
  };

  // O foco vai para o dia — ao abrir e a cada tecla. Só dentro da caixa.
  useEffect(() => {
    if (!aberto || vista !== "dias" || !foco) return;
    caixa.current?.querySelector<HTMLButtonElement>(`[data-iso="${foco}"]`)?.focus();
  }, [aberto, vista, foco, mostrado]);

  useEffect(() => {
    if (!aberto || vista !== "meses") return;
    caixa.current?.querySelector<HTMLButtonElement>("[data-mes-actual]")?.focus();
  }, [aberto, vista]);

  // Um clique fora fecha, sem roubar o foco a quem o recebeu.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      fechar(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto, fechar, botao]);

  const irPara = (iso: string) => {
    const p = partesDe(iso);
    if (!p) return;
    setFoco(iso);
    setMostrado({ ano: p.ano, mes: p.mes });
  };

  const mudarMes = (n: number) => {
    const base = isoDe(mostrado.ano, mostrado.mes, 1);
    const novo = partesDe(somarMeses(base, n))!;
    setMostrado({ ano: novo.ano, mes: novo.mes });
    if (foco) {
      const f = somarMeses(foco, n);
      setFoco(f);
    }
  };

  const teclaNoDia = (e: React.KeyboardEvent) => {
    const mapa: Record<string, () => string> = {
      ArrowLeft: () => somarDias(foco, -1),
      ArrowRight: () => somarDias(foco, 1),
      ArrowUp: () => somarDias(foco, -7),
      ArrowDown: () => somarDias(foco, 7),
      Home: () => inicioDaSemana(foco),
      End: () => fimDaSemana(foco),
      PageUp: () => somarMeses(foco, e.shiftKey ? -12 : -1),
      PageDown: () => somarMeses(foco, e.shiftKey ? 12 : 1),
    };
    const mover = mapa[e.key];
    if (mover) {
      e.preventDefault();
      irPara(mover());
    }
  };

  const teclaNaCaixa = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (vista === "meses") setVista("dias");
      else fechar(true);
    }
  };

  // Sair da caixa com o Tab fecha-a: não é uma janela que prenda o teclado.
  const aoSairDaCaixa = (e: React.FocusEvent) => {
    const para = e.relatedTarget as Node | null;
    if (!para) return;
    if (caixa.current?.contains(para) || botao.current?.contains(para)) return;
    fechar(false);
  };

  const semanas = semanasDoMes(mostrado.ano, mostrado.mes);
  const dias = diasDaSemana(locale);
  const meses = nomesDosMeses(locale);
  const escrita = partesDe(valor) ? dataNoCampo(valor, locale) : "";
  const mesMinimo = partesDe(minimo);
  const mesAntesDoMinimo = (ano: number, mes: number) =>
    !!mesMinimo && (ano < mesMinimo.ano || (ano === mesMinimo.ano && mes < mesMinimo.mes));

  const anterior = partesDe(somarMeses(isoDe(mostrado.ano, mostrado.mes, 1), -1))!;

  const seta = (sentido: "esq" | "dir") => (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <path
        d={sentido === "esq" ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const botaoSeta =
    "grid h-8 w-8 place-items-center rounded-full text-moss-dark transition-colors duration-micro hover:bg-foreground/[0.06] disabled:text-foreground/20 disabled:hover:bg-transparent";

  return (
    <div className="relative">
      <button
        id={id}
        ref={botao}
        type="button"
        disabled={desligado}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-labelledby={`${rotuloId} ${valorId}`}
        aria-describedby={descritoPor}
        onClick={() => (aberto ? fechar(false) : abrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            abrir();
          }
        }}
        className={`${className ?? ""} flex items-center justify-between gap-3 text-left`}
      >
        <span id={valorId} className={escrita ? "" : "text-foreground/45"}>
          {escrita || textos.escolher}
        </span>
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-foreground/55">
          <rect
            x="2"
            y="3"
            width="12"
            height="11"
            rx="2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {aberto &&
        createPortal(
          <div
            ref={caixa}
            style={posicao ?? { top: -9999, left: -9999 }}
            role="dialog"
            aria-label={textos.calendario}
            onKeyDown={teclaNaCaixa}
            onBlur={aoSairDaCaixa}
            className="fixed z-[65] w-[19.5rem] origin-top-left rounded-[18px] border border-foreground/10 bg-white/90 p-3.5 shadow-[0_18px_48px_-14px_rgba(42,38,32,0.32)] backdrop-blur-xl backdrop-saturate-150 transition-[opacity,scale] duration-elemento ease-snappy starting:scale-[0.96] starting:opacity-0 motion-reduce:transition-none"
          >
            <div className="mb-2 flex items-center justify-between pl-1.5">
              <button
                type="button"
                id={tituloId}
                aria-label={`${vista === "dias" ? tituloDoMes(mostrado.ano, mostrado.mes, locale) : mostrado.ano}. ${textos.escolherMes}`}
                aria-expanded={vista === "meses"}
                onClick={() => setVista(vista === "dias" ? "meses" : "dias")}
                className="flex items-center gap-1 rounded-md px-1 py-1 text-[15px] font-semibold text-foreground transition-colors duration-micro hover:text-moss-dark"
              >
                {vista === "dias" ? tituloDoMes(mostrado.ano, mostrado.mes, locale) : mostrado.ano}
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className={`h-3.5 w-3.5 text-moss-dark transition-transform duration-micro motion-reduce:transition-none ${vista === "meses" ? "rotate-90" : ""}`}
                >
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="flex items-center gap-0.5">
                {vista === "dias" ? (
                  <>
                    <button
                      type="button"
                      aria-label={textos.mesAnterior}
                      disabled={mesAntesDoMinimo(anterior.ano, anterior.mes)}
                      onClick={() => mudarMes(-1)}
                      className={botaoSeta}
                    >
                      {seta("esq")}
                    </button>
                    <button
                      type="button"
                      aria-label={textos.mesSeguinte}
                      onClick={() => mudarMes(1)}
                      className={botaoSeta}
                    >
                      {seta("dir")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={textos.anoAnterior}
                      disabled={mesAntesDoMinimo(mostrado.ano - 1, 11)}
                      onClick={() => setMostrado({ ano: mostrado.ano - 1, mes: mostrado.mes })}
                      className={botaoSeta}
                    >
                      {seta("esq")}
                    </button>
                    <button
                      type="button"
                      aria-label={textos.anoSeguinte}
                      onClick={() => setMostrado({ ano: mostrado.ano + 1, mes: mostrado.mes })}
                      className={botaoSeta}
                    >
                      {seta("dir")}
                    </button>
                  </>
                )}
              </div>
            </div>

            {vista === "dias" ? (
              <div role="grid" aria-labelledby={tituloId} onKeyDown={teclaNoDia}>
                <div role="row" className="grid grid-cols-7">
                  {dias.map((d) => (
                    <span
                      key={d.nome}
                      role="columnheader"
                      aria-label={d.nome}
                      className="py-1.5 text-center text-[11px] font-medium uppercase text-foreground/45"
                    >
                      {d.inicial}
                    </span>
                  ))}
                </div>
                {semanas.map((semana) => (
                  <div role="row" key={semana[0].iso} className="grid grid-cols-7">
                    {semana.map((d) => {
                      const escolhido = d.iso === valor;
                      const eHoje = d.iso === hoje;
                      const passou = antesDoMinimo(d.iso);
                      const nome = `${dataPorExtenso(d.iso, locale)}${eHoje ? `, ${textos.hoje}` : ""}${passou ? `, ${textos.passou}` : ""}`;
                      const cor = escolhido
                        ? "bg-moss-dark text-white font-semibold"
                        : passou
                          ? "text-foreground/25 cursor-default"
                          : eHoje
                            ? "text-moss-dark font-semibold hover:bg-foreground/[0.06]"
                            : d.doMes
                              ? "text-foreground hover:bg-foreground/[0.06]"
                              : "text-foreground/35 hover:bg-foreground/[0.06]";
                      return (
                        <span
                          role="gridcell"
                          key={d.iso}
                          aria-selected={escolhido}
                          className="grid place-items-center py-px"
                        >
                          <button
                            type="button"
                            data-iso={d.iso}
                            tabIndex={d.iso === foco ? 0 : -1}
                            aria-label={nome}
                            aria-disabled={passou || undefined}
                            aria-current={eHoje ? "date" : undefined}
                            onClick={() => escolher(d.iso)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                escolher(d.iso);
                              }
                            }}
                            className={`h-9 w-9 rounded-full text-[14px] tabular-nums transition-colors duration-micro ${cor}`}
                          >
                            {d.dia}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid grid-cols-3 gap-1.5 pt-1"
                role="group"
                aria-labelledby={tituloId}
              >
                {meses.map((nome, i) => {
                  const actual = i === mostrado.mes;
                  const passou = mesAntesDoMinimo(mostrado.ano, i);
                  return (
                    <button
                      key={nome}
                      type="button"
                      data-mes-actual={actual || undefined}
                      disabled={passou}
                      aria-pressed={actual}
                      onClick={() => {
                        const dia = foco ? (partesDe(foco)?.dia ?? 1) : 1;
                        const ultimo = new Date(mostrado.ano, i + 1, 0).getDate();
                        let novo = isoDe(mostrado.ano, i, Math.min(dia, ultimo));
                        if (antesDoMinimo(novo)) novo = minimo;
                        setFoco(novo);
                        setMostrado({ ano: mostrado.ano, mes: i });
                        setVista("dias");
                      }}
                      className={`h-11 rounded-xl text-[14px] transition-colors duration-micro disabled:text-foreground/25 ${
                        actual
                          ? "bg-moss-dark font-semibold text-white"
                          : "text-foreground hover:bg-foreground/[0.06] disabled:hover:bg-transparent"
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
