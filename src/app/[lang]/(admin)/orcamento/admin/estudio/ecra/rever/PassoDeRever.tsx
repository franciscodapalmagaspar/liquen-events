"use client";

import { EstaPronta } from "../../passos/rever/EstaPronta";
import { PreviewSummary } from "../../resumo/PreviewSummary";
import { CustoDaGeracao } from "../../resumo/CustoDaGeracao";
import { EnviarAoCliente } from "../../passos/rever/EnviarAoCliente";
import { PorOndeSegue } from "../../passos/rever/PorOndeSegue";
import { useEstudio } from "../../contexto";

/**
 * ══════════ /PASSOS 1 a 4 ══════════
 */
export function PassoDeRever() {
  const {
    accoesDoDocumento: { confirmarPdfVisto },
    avisos: { toast },
    documento: { doc, patch, setDoc },
    enviar: { emailDoCliente },
    envio: {
      assuntoDoEmail,
      bytesDoPdf,
      canal,
      corpoDoEmail,
      escolherCanal,
      pdfVisto,
      sent,
      setAssuntoDoEmail,
      setConfirmSend,
      setCorpoDoEmail,
      setModeloDoEmail,
      setSent,
    },
    fotos: { assetMedias, assetOriginais, assetUrls },
    geracoes: { amostras },
    ocupado: { busy },
    paginasDaProposta: { totalDeFotos },
    passos: { passoDoEnvio, step },
    pdfDaProposta: { fotosPorConfirmar, preview },
    pedido: { quote, quotes },
    pronta: { aoSaberQueFaltam, pdfConfirmado, pdfVistoAgora, setEscolhidasQueFaltam, temErros },
    resumo: { resumoParaCopiar },
    saltos: { irParaAFalta, irParaCampo },
    total: { money, pctSinal, split },
    traducoes: { idiomaDoPdf },
    versoesAntigas: { inserirParagrafoDoQueMudou, restaurarVersao },
  } = useEstudio();
  return (
    <>
      {/* ══════════ PASSO 5 · Rever e enviar — «Está pronta?», LOGO EM CIMA ══════════
          Decisão dela a 10/11 (o plano de 9/11, fase 5): primeiro o que falta
          — a Conferência, as fotografias em falta, as gralhas, o que ficou por
          traduzir —, depois ver o PDF final, depois o resumo e o email, e só
          no fim por onde segue. Substitui a ordem de 14/10, em que «Por onde
          segue» vinha em cima: ela escolheu «Está pronta?» primeiro. */}
      <EstaPronta
        aoSaberQueFaltam={aoSaberQueFaltam}
        busy={busy}
        canal={canal}
        confirmarPdfVisto={confirmarPdfVisto}
        doc={doc}
        fotosPorConfirmar={fotosPorConfirmar}
        idiomaDoPdf={idiomaDoPdf}
        irParaAFalta={irParaAFalta}
        irParaCampo={irParaCampo}
        money={money}
        pdfConfirmado={pdfConfirmado}
        pdfVisto={pdfVisto}
        pdfVistoAgora={pdfVistoAgora}
        preview={preview}
        quote={quote}
        quotes={quotes}
        sent={sent}
        setDoc={setDoc}
        setEscolhidasQueFaltam={setEscolhidasQueFaltam}
        step={step}
        temErros={temErros}
        toast={toast}
      />

      {/* ══════════ PASSO 5 · Rever e enviar — o resumo, montado só aqui ══════════ */}
      {/* Only mount the preview while it's the active step. It was previously
          kept mounted (just `hidden`), so its filter/map over every service
          group + budget line re-ran on EVERY keystroke in the content step —
          the main source of typing lag on large proposals. */}
      {step === "enviar" && (
        // Este monta de raiz (ver o comentário aqui em cima), portanto a
        // `.view-in` corre sozinha na montagem — não precisa de sair e voltar.
        <div className="view-in">
          <PreviewSummary
            doc={doc}
            assetUrls={assetUrls}
            assetOriginais={assetOriginais}
            assetMedias={assetMedias}
            money={money}
            split={split}
            pctSinal={pctSinal}
          />
          <CustoDaGeracao fotos={totalDeFotos} amostras={amostras} />
        </div>
      )}

      {/* ══════════ PASSO 5 · Rever e enviar — o envio ══════════ */}
      <EnviarAoCliente
        amostras={amostras}
        assuntoDoEmail={assuntoDoEmail}
        bytesDoPdf={bytesDoPdf}
        canal={canal}
        corpoDoEmail={corpoDoEmail}
        doc={doc}
        idiomaDoPdf={idiomaDoPdf}
        inserirParagrafoDoQueMudou={inserirParagrafoDoQueMudou}
        passoDoEnvio={passoDoEnvio}
        patch={patch}
        quote={quote}
        restaurarVersao={restaurarVersao}
        resumoParaCopiar={resumoParaCopiar}
        sent={sent}
        setAssuntoDoEmail={setAssuntoDoEmail}
        setConfirmSend={setConfirmSend}
        setCorpoDoEmail={setCorpoDoEmail}
        setModeloDoEmail={setModeloDoEmail}
        setSent={setSent}
        step={step}
        totalDeFotos={totalDeFotos}
      />

      {/* ══════════ PASSO 5 · Rever e enviar — por onde segue, NO FIM (10/11) ══════════
          Até 10/11 vinha logo em cima, por um pedido dela de 14/10 que o
          comentário de baixo conta; a 10/11 ela escolheu «Está pronta?»
          primeiro, e este passou para depois do email.
          Palavras dela, a 14/10, com a captura deste bloco: «coloca isto em
          cima para se ver logo no início e coloca o logo do email e do
          WhatsApp». Estava a meio do passo, depois do resumo inteiro — a
          primeira escolha do envio era a última coisa que se via. Sempre
          montado e escondido como o envio aqui em baixo, para o salto de
          «Falta o email» (`#seccao-envio`) ter onde cair. */}
      <PorOndeSegue
        canal={canal}
        emailDoCliente={emailDoCliente}
        escolherCanal={escolherCanal}
        sent={sent}
        step={step}
      />
    </>
  );
}
