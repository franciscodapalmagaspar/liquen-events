"use client";

import { enderecoDaRotaDaFoto } from "./endereco-da-foto";
import { useState } from "react";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import type { EscolhaParaOEcra, OpcaoParaOEcra } from "@/lib/proposta-escolhas";
import type { TextosDaPagina } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ALTERNATIVAS — O ÚNICO SÍTIO DESTA PÁGINA ONDE O CASAL ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 * dois estilos de corredor), eles escolhem ali.»
 *
 * ── O QUE SE GRAVA, E QUANDO ──────────────────────────────────────────────
 *
 * Só o clique. Não há aqui nada que fale com o servidor ao abrir a página, ao
 * rolar, ao sair, nem passado um tempo: o único pedido que este componente faz
 * nasce de um dedo em cima de uma opção. É a regra dela, à letra — e é por
 * isso que não há `useEffect` nenhum neste ficheiro. O teste
 * `zero-rastreio.test.ts` lê este ficheiro e recusa-o se voltar a haver.
 *
 * ── PORQUE É QUE ISTO NÃO É UM `<form>` COM UM BOTÃO DE CONFIRMAR ─────────
 *
 * Porque não é um compromisso. Um casamento não se fecha num botão — e esta
 * escolha, ao contrário do aceite, também não fecha nada: é «gostamos mais
 * desta», e a conversa continua na mesma. Um passo de confirmação a mais
 * transformava uma preferência num contrato.
 *
 * E é por isso que a frase que aparece a seguir NÃO é «guardado»: é «ficámos a
 * saber, podem mudar de ideias quando quiserem». O que interessa ao casal não
 * é o nosso registo — é saber que a mensagem chegou a alguém e que não ficaram
 * presos à primeira ideia.
 *
 * ── UM ESTADO POR PERGUNTA, E NÃO UM PARA A PÁGINA ────────────────────────
 *
 * Duas escolhas na mesma página são duas conversas independentes. Com um
 * estado só, um erro de rede na segunda apagava a confirmação da primeira do
 * ecrã — e o casal ficava sem saber qual das duas tinha seguido.
 */

interface Props {
  /** Só os identificadores: o texto vem já traduzido em `emLingua` e a
   *  fotografia em `fotos`. Ver `escolhasParaOEcra`. */
  escolhas: EscolhaParaOEcra[];
  /** O que já estava escolhido quando a página foi desenhada, no servidor. */
  escolhido: Record<string, string>;
  /** A fotografia de cada opção, pelo id opaco `e{i}o{j}` — ver `proposta-fotos`. */
  fotos: Record<string, FotoDaProposta>;
  token: string;
  textos: TextosDaPagina;
  /** Já traduzido pelo servidor: rótulo, descrição, título e nota na língua. */
  emLingua: {
    titulo: Record<string, string>;
    nota: Record<string, string>;
    rotulo: Record<string, string>;
    descricao: Record<string, string>;
  };
}

type Estado = "quieto" | "a-enviar" | "seguiu" | "falhou";

/** A fotografia de uma opção. Sem fotografia não desenha caixa nenhuma: uma
 *  moldura cinzenta ao lado de um rótulo lê-se como uma foto que não carregou. */
function FotoDaOpcao({ foto, alt, token }: { foto?: FotoDaProposta; alt: string; token: string }) {
  /**
   * ── O DEGRAU DO MEIO, QUE AQUI FALTAVA ───────────────────────────────────
   *
   * A cascata era `miniatura → original`, sem nada pelo meio. E o original é o
   * ficheiro tal como saiu da máquina: 2,6 MB numa proposta típica, dentro de
   * uma caixa pequena, ao lado de uma pergunta.
   *
   * Basta a miniatura de 400 px falhar — uma assinatura caducada, um ficheiro
   * que ainda não tem derivada — para o telemóvel do casal descarregar
   * megabytes para desenhar um quadrado. É exactamente o defeito que a grelha
   * já corrigiu (ver `Inspiracao.tsx`); as escolhas ficaram para trás.
   *
   * O degrau do meio é a derivada de 1200 px: do CDN quando já está assinada, e
   * da nossa rota quando ainda não existe — que é quem a fabrica. O original
   * continua a ser a última rede, mas deixa de ser a PRIMEIRA alternativa.
   */
  const media = foto ? (foto.media ?? enderecoDaRotaDaFoto(token, foto)) : "";
  const { alvo, aoFalhar, desistiu } = useFotoComPlanoB(foto?.miniatura, [media, foto?.original]);
  if (!foto || !alvo || desistiu) return null;
  return (
    <span
      className="relative block overflow-hidden rounded-md bg-foreground/[0.04]"
      style={{
        aspectRatio: foto.largura && foto.altura ? `${foto.largura}/${foto.altura}` : "4/3",
      }}
    >
      {/* O BORRÃO, QUE ESTAVA CALCULADO E A SER DEITADO FORA.
          O `lqip` vem no HTML, em poucas centenas de bytes, e já é servido em
          todas as fotos (ver `proposta-fotos.ts`). Aqui não era pintado: as
          fotografias das opções são preguiçosas, e o que o casal via enquanto
          elas não chegavam era uma fila de rectângulos cinzentos ao lado das
          escolhas — no ecrã onde ele decide. */}
      {foto.lqip && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto.lqip}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-xl"
        />
      )}
      {/* `<img>` e não `next/image`: estes URLs são assinados e de vida curta,
          e o optimizador do Next guardaria em cache uma assinatura que expira.
          É a mesma decisão da galeria — ver `Inspiracao.tsx`. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={alvo}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={aoFalhar}
        /* `relative`: o borrão está em `absolute` por baixo. */
        className="relative h-full w-full object-cover"
      />
    </span>
  );
}

export default function Escolhas({ escolhas, escolhido, fotos, token, textos, emLingua }: Props) {
  const [respostas, setRespostas] = useState<Record<string, string>>(escolhido);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  /**
   * A opção que se TENTOU, por pergunta — que não é a mesma coisa que a opção
   * escolhida.
   *
   * Quando o envio falha, a marca volta atrás (senão a página mentia). Sem
   * guardar aqui o que se tentou, o «Tentar outra vez» ficava sem saber o que
   * repetir — carregava-se nele e não acontecia nada, que é a pior forma de um
   * botão falhar.
   */
  const [tentado, setTentado] = useState<Record<string, string>>({});

  const escolher = async (escolha: EscolhaParaOEcra, opcao: OpcaoParaOEcra) => {
    const anterior = respostas[escolha.id];
    setTentado((t) => ({ ...t, [escolha.id]: opcao.id }));
    // O ecrã responde já: a escolha é uma preferência, e esperar meio segundo
    // por um servidor para o botão reagir faz o casal carregar outra vez.
    setRespostas((r) => ({ ...r, [escolha.id]: opcao.id }));
    setEstados((e) => ({ ...e, [escolha.id]: "a-enviar" }));
    try {
      const res = await fetch(`/api/proposta/${encodeURIComponent(token)}/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolhaId: escolha.id, opcaoId: opcao.id }),
        // A9-007: sem prazo, uma rede que pendura deixava o botão em «a
        // enviar» para sempre. Ao fim de 15 s dá-se por falhado, e o casal
        // tem o «Tentar outra vez».
        signal: AbortSignal.timeout?.(15_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEstados((e) => ({ ...e, [escolha.id]: "seguiu" }));
    } catch {
      // E VOLTA ATRÁS. Deixar a marca em cima da opção nova depois de o envio
      // falhar era a página a dizer «escolhido» sobre coisa nenhuma — o casal
      // fechava o separador convencido, e do lado de cá não havia nada.
      setRespostas((r) => {
        const volta = { ...r };
        if (anterior) volta[escolha.id] = anterior;
        else delete volta[escolha.id];
        return volta;
      });
      setEstados((e) => ({ ...e, [escolha.id]: "falhou" }));
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-12">
      {escolhas.map((escolha, i) => {
        const estado = estados[escolha.id] ?? "quieto";
        const nota = emLingua.nota[escolha.id];
        return (
          <div key={escolha.id}>
            <h3 className="text-foreground/85 text-[17px] font-medium">
              {emLingua.titulo[escolha.id]}
            </h3>
            {nota && <p className="mt-1 text-foreground/70 text-sm leading-relaxed">{nota}</p>}

            {/* Uma coluna no telemóvel — a mesma razão da galeria: duas
                alternativas lado a lado num ecrã de 390 px dão 180 px cada, e
                aí a fotografia da paleta deixa de se ver, que é o único
                motivo de ela lá estar. */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {escolha.opcoes.map((opcao, j) => {
                const escolhida = respostas[escolha.id] === opcao.id;
                const rotulo = emLingua.rotulo[opcao.id];
                const descricao = emLingua.descricao[opcao.id];
                return (
                  <button
                    key={opcao.id}
                    type="button"
                    onClick={() => void escolher(escolha, opcao)}
                    disabled={estado === "a-enviar"}
                    // `aria-pressed` e não um `radio`: são botões que se podem
                    // voltar a carregar, e quem ouve o ecrã precisa de saber
                    // qual está marcado sem ter de procurar a marca visual.
                    aria-pressed={escolhida}
                    className={`alvo-toque flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-progress ${
                      escolhida
                        ? "border-moss bg-moss/8"
                        : "border-foreground/12 hover:border-moss/50 hover:bg-moss/4"
                    }`}
                  >
                    <FotoDaOpcao foto={fotos[`e${i}o${j}`]} alt={rotulo} token={token} />
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground/85 text-sm font-medium">{rotulo}</span>
                      {escolhida && (
                        <span className="shrink-0 text-moss text-[10px] uppercase tracking-[0.18em]">
                          {textos.escolhida}
                        </span>
                      )}
                    </span>
                    {descricao && (
                      <span className="text-foreground/70 text-[13px] leading-relaxed">
                        {descricao}
                      </span>
                    )}
                    {/* O nome que o leitor de ecrã anuncia é o gesto inteiro,
                        e não só o rótulo da paleta. */}
                    <span className="sr-only">
                      {textos.escolherEsta} {rotulo}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* O desfecho DESTA pergunta, por baixo dela. `aria-live` porque a
                frase aparece sem que nada mude de sítio. */}
            <p className="mt-3 min-h-5 text-[13px]" aria-live="polite">
              {estado === "seguiu" && <span className="text-moss">{textos.escolhaGuardada}</span>}
              {estado === "falhou" && (
                <span className="text-[color:var(--danger)]">
                  {textos.escolhaFalhou}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      const opcao = escolha.opcoes.find(
                        (o) => o.id === (tentado[escolha.id] ?? ""),
                      );
                      setEstados((e) => ({ ...e, [escolha.id]: "quieto" }));
                      if (opcao) void escolher(escolha, opcao);
                    }}
                    className="alvo-toque underline"
                  >
                    {textos.escolhaRepetir}
                  </button>
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
