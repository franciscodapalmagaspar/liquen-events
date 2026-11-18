"use client";

import { Ajuda, Button } from "../../ui";
import { MenuDeAccoes } from "../../ui/MenuDeAccoes";
import { useEstudio } from "../contexto";

/**
 * EMPILHA no telemóvel, em vez de repartir a largura.
 * O que estava aqui era um `flex` em linha com o texto de um lado e três
 * botões do outro, marcados `shrink-0`. A 375 px os botões ficavam com
 * ~330 px e o parágrafo com o que sobrava: encolhia até à largura da
 * palavra mais comprida e passava a UMA PALAVRA POR LINHA — dois ecrãs
 * de scroll para ler duas frases. O `min-w-0` do lado do texto, que
 * existe para o truncar deixar de empurrar, aqui deixava-o chegar a zero.
 * É o padrão a evitar em todo o back office: texto e barra de acções na
 * mesma linha só a partir de `sm`.
 *
 * ── E A FILA PERGUNTA À CAIXA (auditoria de 14/11, n.º 2) ─────────
 * Com `sm:` a fila abria aos 640 px de JANELA. A 768 o grupo dos botões
 * era `shrink-0` e pedia 794: a página ganhava scroll de lado, o
 * «Trocar de cliente» ficava cortado e o nome do cliente encolhia para
 * 10 px. Os seis botões pedem ~740 px; a fila só abre quando a CAIXA
 * tem 64rem, e até lá empilha — o nome em cima, os botões por baixo.
 */
export function CabecalhoDoEstudio() {
  const {
    accaoDeDesfazer: { desfazer },
    avisos: { toast },
    copia: { setCopiaSubstitui, setCopiarAberto, setNomeModelo },
    documento: { camposTocadosRef, doc, podeDesfazer },
    limpeza: { clearDraft, trabalhoNoDocumento },
    pedido: { cliente },
    rascunho: { docDoServidorRef, jaGravouRef },
  } = useEstudio();
  return (
    <div className="mb-4 flex flex-col gap-3 @min-[64rem]:flex-row @min-[64rem]:items-start @min-[64rem]:justify-between">
      {/* ── O CABEÇALHO CUSTAVA UM TERÇO DO ECRÃ DELA ────────────────────
            Somando as classes num iPhone SE (375×667), gastavam-se ~702 px
            antes do primeiro campo onde ela escreve — ou seja, ele nascia
            abaixo da dobra. Este cabeçalho eram ~213 desses píxeis, e ~74 eram
            três linhas de instrução que se lêem UMA VEZ e depois ficam lá as
            outras cinquenta.

            A correcção é a mesma que a explicação do «Extra» já levou duzentas
            linhas abaixo, e o critério é o do `ui/Ajuda.tsx`: úteis na primeira
            vez, ruído a partir da segunda. Passa a estar onde a pergunta se faz
            — atrás de um «?» ao pé do nome da secção.

            UM texto num sítio só, e não duas cópias com um `hidden` a escolher:
            o que aqui se poupa é altura, e duas cópias não poupam altura
            nenhuma a quem lê o HTML. */}
      <div className="min-w-0">
        {cliente ? (
          <>
            {/* O nome da zona continua a existir para quem ouve o ecrã — e
                  para os passeios que o usam como sinal de que o estúdio
                  montou. À vista, o que se lê primeiro é para quem é. */}
            <h2 className="sr-only">Estúdio de propostas (PDF)</h2>
            <p className="flex items-center gap-1.5 text-caption text-[var(--bo-text-muted)]">
              Proposta para
              <Ajuda sobre="o que se faz no estúdio de propostas">
                Monta aqui a proposta em PDF para o cliente, em cinco passos: Evento, Serviços,
                Inspiração, Orçamento e Rever e enviar. Podes saltar entre eles à vontade — nada se
                perde. A página à direita é a do PDF, tal e qual vai sair.
              </Ajuda>
            </p>
            <p className="truncate text-title3 font-semibold text-[var(--bo-text)]">
              {cliente.nome}
            </p>
          </>
        ) : (
          <p className="bo-eyebrow flex items-center gap-1.5">
            Estúdio de propostas (PDF)
            <Ajuda sobre="o que se faz no estúdio de propostas">
              Monta aqui a proposta em PDF para o cliente, em cinco passos: Evento, Serviços,
              Inspiração, Orçamento e Rever e enviar. Podes saltar entre eles à vontade — nada se
              perde.
            </Ajuda>
          </p>
        )}
      </div>
      {/* `flex-wrap` e não `shrink-0`: com três botões a 375 px, um deles
            saía pela margem direita e ficava cortado ("Limpa…"). */}
      <div className="flex flex-wrap items-center gap-2 @min-[64rem]:shrink-0">
        {/* A acção principal desta secção: quase todas as propostas são uma
              variação de uma anterior. É a única aqui a verde. */}
        <Button
          size="sm"
          onClick={() => {
            // Achado n.º 7: a cópia só pergunta se houver trabalho a perder
            // — escrito nesta sessão, ou num rascunho que já estava gravado.
            // Uma proposta acabada de abrir, com o que veio do pedido, não
            // pergunta nada (um aviso sempre ligado ensina a não o ler).
            const houveTrabalho =
              camposTocadosRef.current.size > 0 ||
              docDoServidorRef.current != null ||
              jaGravouRef.current;
            const partes = trabalhoNoDocumento(doc);
            setCopiaSubstitui(
              houveTrabalho ? (partes.length > 0 ? partes.join(", ") : "texto escrito") : null,
            );
            setCopiarAberto(true);
          }}
        >
          Criar a partir de…
        </Button>
        {/* DESFAZER TEM DE SE PODER TOCAR.
              Isto existia só como `Cmd+Z`, e num telemóvel não há `Cmd+Z`:
              desfazer um engano era uma coisa que só se podia fazer sentada ao
              computador. Fica ao lado de "Limpar rascunho" de propósito — é o
              par dela, e é onde se vai procurar depois de estragar alguma
              coisa. Apagado quando não há para onde voltar, para não prometer
              o que não faz. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!podeDesfazer}
          onClick={() => {
            if (desfazer()) toast("Desfeito.", "info");
          }}
        >
          Desfazer
        </Button>
        {/* ── NUM ECRÃ ESTREITO, O RESTO VAI PARA O «⋯» ───────────────────
              Seis botões soltos eram três linhas de botões num telemóvel, por
              cima dos passos (9/11, «está uma confusão brutal»). Fica à vista o
              que se usa a meio do trabalho — «Criar a partir de…» e «Desfazer»
              — e o resto entra no menu. Num ecrã largo continua tudo à vista. */}
        <div className="contents @max-[40rem]:hidden">
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(doc.eventType || "")}>
            Guardar como modelo
          </Button>
          <Button variant="ghost" size="sm" onClick={clearDraft}>
            Limpar rascunho
          </Button>
          {cliente && (
            <>
              {/* As portas do pedido, separadas das do rascunho por um traço:
                  estas saem do estúdio, as de cima mexem nele. */}
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--bo-hairline-strong)]" />
              <Button variant="ghost" size="sm" onClick={cliente.onAbrirPedido}>
                Abrir o pedido
              </Button>
              <Button variant="ghost" size="sm" onClick={cliente.onTrocar}>
                Trocar de cliente
              </Button>
            </>
          )}
        </div>
        <div className="@min-[40rem]:hidden">
          <MenuDeAccoes
            sobre={cliente?.nome ?? "esta proposta"}
            sempreVisivel
            accoes={[
              ...(cliente
                ? [
                    { id: "pedido", rotulo: "Abrir o pedido", onAccao: cliente.onAbrirPedido },
                    { id: "trocar", rotulo: "Trocar de cliente", onAccao: cliente.onTrocar },
                  ]
                : []),
              {
                id: "modelo",
                rotulo: "Guardar como modelo",
                onAccao: () => setNomeModelo(doc.eventType || ""),
                separadorAntes: !!cliente,
              },
              { id: "limpar", rotulo: "Limpar rascunho", onAccao: clearDraft, destrutiva: true },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
