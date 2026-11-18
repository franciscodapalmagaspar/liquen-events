"use client";

import NavEstudio from "../../NavEstudio";
import { RascunhoSobreposto } from "./gravacao/RascunhoSobreposto";
import { ModeloDaProposta } from "./evento/ModeloDaProposta";
import { TraduzirTudo } from "./traducoes/TraduzirTudo";
import { SeccaoDoEvento } from "../passos/evento/SeccaoDoEvento";
import { SeccaoDaCapa } from "../passos/evento/SeccaoDaCapa";
import { PassoServicos } from "../passos/PassoServicos";
import { SeccaoDosMoodBoards } from "./inspiracao/SeccaoDosMoodBoards";
import { SeccaoDoCronograma } from "../passos/inspiracao/SeccaoDoCronograma";
import { SeccaoDoOrcamento } from "./orcamento/SeccaoDoOrcamento";
import { SeccaoDoTotal } from "./orcamento/SeccaoDoTotal";
import { PainelInternoDoOrcamento } from "./orcamento/PainelInternoDoOrcamento";
import { PaginasLadoALado } from "./inspiracao/PaginasLadoALado";
import { PainelAdiado } from "../VistasAdiadas";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { useEstudio } from "../contexto";

export function CorpoDoEstudio() {
  const {
    barra: { filaDasColunas, folgaDaBarra, painelLateralCabe },
    botaoDoEnvio: { faltasDoEnvio, noFormulario },
    camposPorConfirmar: { confirmado, realce },
    capa: { focoAutoDaCapa, idxDaCapa, removeCoverAt, setCoverAt, tamanhoDaCapa },
    carregamento: { uploading },
    carregar: { handleUpload },
    casamento: { casamentoConfirmado, chaveDoCasamentoConfirmado, setCasamentoConfirmado },
    confirmacoes: { perguntaDeRemocao },
    documento: { doc, patch, setDoc },
    escolha: { setPicker },
    fases: {
      addPhase,
      addPhaseItem,
      movePhase,
      removePhase,
      removePhaseItem,
      updatePhase,
      updatePhaseItem,
    },
    fotos: {
      aspetosDasFotos,
      assetMedias,
      assetOriginais,
      assetUrls,
      estadoDosUrls,
      marcarUrlMorto,
      registarAspeto,
    },
    guardar: { guardarAgora },
    hidratar: { tentarBuscarFotos },
    moodBoards: { setServiceGroups },
    nota: { notaDaSeccao },
    painel: {
      aVista,
      boardActivo,
      paginasParaOPainel,
      painelEscolherFotos,
      painelSaltar,
      pedidoComADataDoDoc,
    },
    passos: { formularioDosPassos, step },
    pedido: { quote, quotes },
    pronta: { isDeco, seccoes },
    referencia: { refEdited, setRefEdited },
    saltos: { irParaAFalta },
    sugestoesDoPedido: { sugestoes },
    tempoNaProposta: { anotarSeccao },
    traducoes: { bilingue, idiomaDoPdf, traducoesPorSeccao },
  } = useEstudio();
  return (
    <div
      ref={formularioDosPassos}
      className={`@container/estudio scroll-mt-[var(--bo-colado-topo)] ${noFormulario ? "view-in" : ""}`}
      hidden={!noFormulario}
    >
      <div
        ref={filaDasColunas}
        /* 40rem (640 px) é o mínimo para uma fila fazer sentido: o índice pede
           12rem e o que sobra tem de dar uma coluna de escrita que se leia.
           Abaixo disso o índice volta a ser a tira que já existe para o
           telemóvel — e a coluna de escrita fica com a largura toda. */
        className="@min-[40rem]/estudio:flex @min-[40rem]/estudio:gap-6"
        style={{ paddingBottom: folgaDaBarra }}
      >
        {/* Na Inspiração o índice sai, e a coluna dos mood boards fica com
              a largura toda — é o passo onde as fotografias pedem espaço (A2). */}
        {step !== "inspiracao" && (
          <NavEstudio
            seccoes={seccoes}
            faltas={faltasDoEnvio}
            onSeccaoActual={anotarSeccao}
            porTraduzir={traducoesPorSeccao}
            onIr={(seccao) => irParaAFalta(seccao)}
          />
        )}
        {/* ── QUEM MANDA É A COLUNA ONDE ELA ESCREVE, NÃO A JANELA ─────────
            Esta coluna vive dentro de três outras: a barra lateral do back
            office (`w-64`, a partir de 1024), o índice do estúdio (`NavEstudio`,
            `w-48`, a partir de 1024) e o painel «O que vai sair» (`w-[21rem]`,
            a partir de 1440). Medida:

              janela   esta coluna
                375       ~351 px
                640       ~592 px
               1023       ~975 px
               1024       ~504 px   ← perde 471 px de um pixel para o outro
               1440       ~560 px

            É por isso que `sm:` mente aqui dentro: dispara aos 640 de JANELA e
            nunca mais volta atrás, portanto tudo o que decidiu «duas colunas»
            com 592 px de caixa continua a decidir duas colunas quando a caixa
            passa a ter 504. Este ficheiro tinha quarenta regras de largura e
            zero `@container`; era esse o defeito de fundo.

            O `@container` põe a pergunta onde ela existe — na largura DESTA
            coluna — e os limiares são os que a casa já usa (22, 24 e 26 rem),
            mais as 36 rem que o `PaymentsPanel` usa para o mesmo caso de uma
            fila de campos com colunas fixas. O método está escrito por extenso
            em `ProposalBuilder.tsx:973-1009`; aqui é a mesma conta noutra
            caixa. */}
        <div className="@container min-w-0 flex-1">
          <RascunhoSobreposto />
          <ModeloDaProposta />

          <TraduzirTudo />

          {/* Event fields */}
          <SeccaoDoEvento
            casamentoConfirmado={casamentoConfirmado}
            chaveDoCasamentoConfirmado={chaveDoCasamentoConfirmado}
            confirmado={confirmado}
            doc={doc}
            isDeco={isDeco}
            patch={patch}
            pedidoComADataDoDoc={pedidoComADataDoDoc}
            quote={quote}
            quotes={quotes}
            realce={realce}
            refEdited={refEdited}
            setCasamentoConfirmado={setCasamentoConfirmado}
            setDoc={setDoc}
            setRefEdited={setRefEdited}
            step={step}
            sugestoes={sugestoes}
          />

          {/* A fotografia da capa — ver `SeccaoDaCapa`. */}
          <SeccaoDaCapa
            aspetosDasFotos={aspetosDasFotos}
            assetMedias={assetMedias}
            assetOriginais={assetOriginais}
            assetUrls={assetUrls}
            doc={doc}
            estadoDosUrls={estadoDosUrls}
            focoAutoDaCapa={focoAutoDaCapa}
            handleUpload={handleUpload}
            idxDaCapa={idxDaCapa}
            marcarUrlMorto={marcarUrlMorto}
            notaDaSeccao={notaDaSeccao}
            patch={patch}
            registarAspeto={registarAspeto}
            removeCoverAt={removeCoverAt}
            setCoverAt={setCoverAt}
            setPicker={setPicker}
            step={step}
            tamanhoDaCapa={tamanhoDaCapa}
            tentarBuscarFotos={tentarBuscarFotos}
            uploading={uploading}
          />

          {/* Service groups */}
          <PassoServicos
            bilingue={bilingue}
            doc={doc}
            guardarAgora={guardarAgora}
            isDeco={isDeco}
            notaDaSeccao={notaDaSeccao}
            setServiceGroups={setServiceGroups}
            step={step}
          />

          <SeccaoDosMoodBoards />

          {/* Cronograma — organizacao only */}
          {!isDeco && (
            <SeccaoDoCronograma
              addPhase={addPhase}
              addPhaseItem={addPhaseItem}
              doc={doc}
              movePhase={movePhase}
              notaDaSeccao={notaDaSeccao}
              perguntaDeRemocao={perguntaDeRemocao}
              removePhase={removePhase}
              removePhaseItem={removePhaseItem}
              step={step}
              updatePhase={updatePhase}
              updatePhaseItem={updatePhaseItem}
            />
          )}

          <SeccaoDoOrcamento />

          <SeccaoDoTotal />

          <PainelInternoDoOrcamento />

          <PaginasLadoALado />
        </div>
        {/*
         * ── A TERCEIRA ZONA ──────────────────────────────────────────────
         *
         * «Uma pré-visualização grande e fixa à direita, no espaço hoje
         * vazio.» O índice diz onde estou, a coluna do meio é o que escrevo, e
         * isto é o que vai sair. Ver `PainelDoEstudio` para o resto das razões
         * — em particular por que é um painel só e por que só aparece muito
         * largo.
         */}
        <PainelAdiado
          cabe={painelLateralCabe}
          paginas={paginasParaOPainel}
          activa={boardActivo ?? undefined}
          seccao={aVista.seccao}
          urls={assetUrls}
          originais={assetOriginais}
          aspetos={aspetosDasFotos}
          doc={doc as ProposalDoc}
          onSaltar={painelSaltar}
          onEscolherFotos={painelEscolherFotos}
          quoteId={quote.id}
          idioma={idiomaDoPdf}
        />
      </div>
    </div>
  );
}
