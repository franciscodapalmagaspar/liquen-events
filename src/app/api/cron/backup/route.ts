import { createHash, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { buildBackupPayload } from "@/app/api/backup/route";
import { isAuthed } from "@/lib/admin-auth";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { construirManifesto, type ManifestoDeFotografias } from "@/lib/manifesto-de-fotografias";
import { registarCopiaEnviada } from "@/lib/copia-de-seguranca-marcador";
import { correrRetencao } from "@/lib/retencao";
import { limparExpiradas } from "@/lib/reciclagem";
import { isMissingTable } from "@/lib/repository";
import { listQuotes } from "@/lib/quotes-store";
import { log } from "@/lib/logger";
import type { aquecerPdfsEmFalta } from "@/lib/aquecimento-de-pdf";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CÓPIA DE SEGURANÇA DEIXA DE DEPENDER DE ALGUÉM SE LEMBRAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cópia já existia e é boa — 13 conjuntos, livro de facturas, contratos,
 * contador fiscal, com um `readme` lá dentro e os conjuntos que falharam
 * REGISTADOS em vez de saírem vazios em silêncio. O que faltava era o gatilho:
 * `/api/backup` só corre quando ela carrega no botão em Definições.
 *
 * Numa semana com três montagens ninguém carrega em botão nenhum. Passam-se
 * dois meses, e no dia em que uma proposta se apaga por engano — ou em que o
 * projecto de base de dados é suspenso — o que existe é o ficheiro de há dois
 * meses: todas as propostas, contratos e facturas desde então desaparecem.
 *
 * ── PORQUÊ POR EMAIL, E NÃO PARA UM BUCKET ────────────────────────────────
 *
 * Porque uma cópia guardada no mesmo sítio que os dados não é uma cópia. O que
 * protege contra "o projecto Supabase deixou de existir" é o ficheiro estar
 * NOUTRO lado — e a caixa de correio dela é o outro lado que já existe, sem
 * contas novas, sem custos e sem configuração. Chega lá comprimido, com a data
 * no nome, e fica no histórico do email a servir de arquivo.
 *
 * ── O QUE ESTE FICHEIRO NÃO FAZ ───────────────────────────────────────────
 *
 * Não copia as FOTOGRAFIAS (vivem no Storage, são gigabytes, não cabem num
 * email). A cópia leva os CAMINHOS delas, portanto uma reposição devolve as
 * propostas e os moodboards a apontar para imagens que têm de existir. Isso
 * continua a ser a maior lacuna, está dito no `RESILIENCE.md`, e os BYTES
 * resolvem-se do lado do Supabase (ver a recomendação nesse ficheiro) ou com um
 * descarregamento dos buckets de vez em quando.
 *
 * O que passou a ir é a LISTA delas — um segundo anexo com o manifesto dos
 * buckets de originais: chaves, tamanhos e assinaturas, sem transferir um byte.
 * Não devolve uma fotografia perdida; responde à pergunta que se faz primeiro e
 * que hoje não tinha resposta nenhuma: «o que é que se perdeu?». Se falhar, a
 * cópia dos DADOS segue à mesma — entre as duas, a que tem de sair é essa.
 *
 * Também não substitui as cópias automáticas do próprio Supabase — é uma
 * segunda linha, deliberadamente noutra tecnologia e noutro fornecedor.
 *
 * ── E DEIXA DITO QUE CORREU ───────────────────────────────────────────────
 *
 * Cada envio bem sucedido carimba `copia-de-seguranca:ultima`. É o que permite
 * ao back office dizer «não chega uma cópia há nove dias» em vez de toda a
 * gente presumir que ela anda a correr — que é exactamente o que acontece
 * quando `CRON_SECRET` não está definida e isto responde 401 em silêncio.
 */

/**
 * Mesmo guarda do resumo diário: Bearer com `CRON_SECRET`, comparado em tempo
 * constante, e a falhar fechado em produção quando o segredo não está posto.
 * Uma sessão de administração também serve, para ela poder disparar à mão.
 */
function authorized(req: NextRequest): boolean {
  if (isAuthed(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const provided = createHash("sha256")
    .update(req.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

/** 20 MB — abaixo do limite prático de anexo da esmagadora maioria dos servidores. */
const TECTO_ANEXO = 20 * 1024 * 1024;

const MB = (bytes: number) => (bytes / 1048576).toFixed(1);

/**
 * A lista das fotografias, comprimida, para ir como segundo anexo.
 *
 * Devolve `null` em vez de lançar, e é deliberado: o manifesto é um extra e a
 * cópia dos dados é a razão de esta tarefa existir. Um Storage em baixo às
 * quatro da manhã não pode ser o motivo pelo qual as propostas e as facturas
 * deste dia não saem de casa.
 */
async function juntarManifesto(): Promise<{
  manifesto: ManifestoDeFotografias;
  comprimido: Buffer;
} | null> {
  try {
    const manifesto = await construirManifesto();
    return { manifesto, comprimido: gzipSync(Buffer.from(JSON.stringify(manifesto), "utf8")) };
  } catch (err) {
    log.error(
      "cron backup: não consegui listar as fotografias — a cópia dos dados segue à mesma",
      err,
    );
    return null;
  }
}

async function GET_semMedida(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // O relógio desta função, para o aquecimento dos PDF lá em baixo saber
  // quanto tempo lhe sobra. `maxDuration` é 60 s e a cópia é o que não pode
  // faltar; ver a nota no fim.
  const arrancou = Date.now();

  try {
    const payload = await buildBackupPayload();
    const dia = payload.exportedAt.slice(0, 10);
    const cru = Buffer.from(JSON.stringify(payload), "utf8");
    const comprimido = gzipSync(cru);

    /**
     * O ASSUNTO DIZ O ESTADO, PORQUE É O QUE ELA VÊ SEM ABRIR.
     *
     * Se algum conjunto falhou, `incomplete` traz o nome. Uma cópia parcial que
     * chega com ar de cópia boa é pior do que não chegar nenhuma: ela deixa de
     * desconfiar exactamente no dia em que devia.
     */
    const falhados = payload.incomplete ?? [];
    const parcial = falhados.length > 0;
    const linhas = Object.entries(payload.counts ?? {})
      .map(([k, n]) => `${k}: ${n}`)
      .join(" · ");

    if (comprimido.byteLength > TECTO_ANEXO) {
      // Não mandar nada seria pior: pelo menos avisa-se que a cópia deixou de
      // caber, para ela poder passar ao descarregamento manual.
      //
      // E NÃO se carimba: não saiu cópia nenhuma. Carimbar aqui punha o painel
      // do back office a dizer "está em dia" no dia em que ela deixou de caber.
      log.error("cron backup: a cópia excedeu o tecto do anexo", null, {
        bytes: comprimido.byteLength,
      });
      await sendMail({
        subject: `Cópia de segurança de ${dia} — grande demais para email`,
        html:
          `<p>A cópia de hoje tem ${MB(comprimido.byteLength)} MB ` +
          `comprimidos e já não cabe num anexo.</p>` +
          `<p>Descarrega-a no back office, em <b>Definições → Cópia de segurança</b>, ` +
          `e guarda-a fora do computador de trabalho.</p><p>${linhas}</p>`,
        headers: { "Auto-Submitted": "auto-generated" },
      });
      return NextResponse.json({
        ok: false,
        reason: "grande demais",
        bytes: comprimido.byteLength,
      });
    }

    /**
     * A LISTA DAS FOTOGRAFIAS, que é o que existe em vez das fotografias.
     *
     * Vai como segundo anexo e não misturada no ficheiro dos dados de
     * propósito: o ficheiro dos dados é o que a REPOSIÇÃO lê, e o formato dele
     * é um contrato (`SCHEMA_VERSION`, os conjuntos, o ensaio). Uma chave nova
     * lá dentro obrigava o outro lado a saber ignorá-la. Aqui é um ficheiro
     * separado, com o seu próprio `readme`, que ninguém confunde com uma cópia
     * de dados.
     */
    const fotos = await juntarManifesto();
    const linhaDasFotos = fotos
      ? `<p style="color:#666;font-size:13px">As fotografias continuam a NÃO ir nesta cópia (são ` +
        `${MB(fotos.manifesto.bytes)} MB nos buckets). Vai a LISTA delas — ` +
        `${fotos.manifesto.ficheiros} ficheiros — para se saber o que falta se alguma se perder.` +
        (fotos.manifesto.completo
          ? ""
          : ` <b>A lista está incompleta:</b> ${fotos.manifesto.avisos.join("; ")}`) +
        `</p>`
      : `<p style="color:#666;font-size:13px">Não foi possível listar as fotografias desta vez ` +
        `(o Storage não respondeu). Esta cópia leva os dados; a lista das fotos falta.</p>`;

    const { sent } = await sendMail({
      to: MAIL_TO,
      subject: parcial
        ? `⚠ Cópia de segurança de ${dia} — INCOMPLETA (${falhados.join(", ")})`
        : `Cópia de segurança de ${dia}`,
      html:
        (parcial
          ? `<p><b>Atenção:</b> estes conjuntos não puderam ser lidos e vão vazios: ` +
            `<b>${falhados.join(", ")}</b>. Não reponhas esta cópia sem falar com quem a fez.</p>`
          : `<p>Cópia automática do dia. Guarda-a — é a que serve se alguma coisa se perder.</p>`) +
        `<p style="color:#666;font-size:13px">${linhas}</p>` +
        linhaDasFotos,
      attachments: [
        {
          filename: `liquen-backup-${dia}.json.gz`,
          content: comprimido,
          contentType: "application/gzip",
        },
        ...(fotos
          ? [
              {
                filename: `liquen-fotografias-${dia}.json.gz`,
                content: fotos.comprimido,
                contentType: "application/gzip",
              },
            ]
          : []),
      ],
      headers: { "Auto-Submitted": "auto-generated" },
    });

    /**
     * ── SEM EMAIL, NÃO HÁ CÓPIA — E ENTÃO NADA SE APAGA ──────────────────
     *
     * O `sendMail` não lança quando o email não sai (SMTP por configurar, conta
     * bloqueada, servidor que recusou): devolve `sent: false`. E o resto deste
     * trabalho seguia como se a cópia tivesse saído — carimbava «há cópia»,
     * aplicava a retenção dos 12 meses e esvaziava a Reciclagem. É exactamente
     * o contrário da promessa escrita mais abaixo: «nada é apagado sem estar
     * dentro da cópia desse mesmo dia».
     *
     * Por isso pára aqui: sem carimbo, sem retenção, sem Reciclagem, sem
     * aquecimento. O que havia para apagar fica para o dia em que a cópia sair.
     * O 502 faz o trabalho aparecer como falhado na Vercel, e o painel continua
     * a dizer há quanto tempo não há cópia — que é a verdade. (SEG-2 do
     * `docs/PLANO-SITE-E-GALERIA.md`.)
     */
    if (!sent) {
      log.error("cron backup: o email da cópia NÃO saiu — nada foi apagado hoje", undefined, {
        dia,
        bytes: comprimido.byteLength,
      });
      return NextResponse.json(
        { ok: false, sent: false, dia, error: "O email da cópia não saiu." },
        { status: 502 },
      );
    }

    /**
     * O carimbo vai DEPOIS do envio, nunca antes: ele diz «existe uma cópia
     * fora daqui», e prometê-lo antes de o email sair era a mesma mentira que
     * este sistema já apanhou uma vez noutro sítio — dizer «guardado» sobre
     * qualquer coisa que não ficou guardada.
     */
    await registarCopiaEnviada({ bytes: comprimido.byteLength, parcial, modo: "automatica" });

    /**
     * ══════════════════════════════════════════════════════════════════════
     * E SÓ AGORA A RETENÇÃO DOS 12 MESES
     * ══════════════════════════════════════════════════════════════════════
     *
     * A política de privacidade publicada promete que «pedidos que não deem
     * origem a contrato são eliminados no prazo máximo de 12 meses após o
     * último contacto». Não havia nada a fazê-lo: dois trabalhos automáticos,
     * e nenhum apagava seja o que for.
     *
     * ── PORQUE É QUE VIVE AQUI DENTRO ───────────────────────────────────
     *
     * Não é para poupar um ficheiro. É a ORDEM: a cópia já foi enviada quando
     * isto corre, portanto **nada é apagado sem estar dentro da cópia desse
     * mesmo dia**. Um trabalho à parte podia correr antes, ou num dia em que a
     * cópia falhasse, e aí um apagamento correcto passava a ser uma perda.
     *
     * E há a razão prática: esta casa já teve um deploy RECUSADO por assumir
     * um plano de alojamento que não tinha (ver `agendamento.contrato.test.ts`
     * — «assumi mal, e só o deploy é que mo disse»). Um terceiro agendamento é
     * uma aposta nesse mesmo plano; esta linha não é.
     *
     * ── E NUNCA PODE DEITAR A CÓPIA ABAIXO ──────────────────────────────
     *
     * A cópia de segurança é a razão de ser deste trabalho e já foi feita. Se
     * a retenção falhar, isso regista-se e a resposta continua a dizer que a
     * cópia seguiu — porque seguiu. Trocar uma cópia bem-sucedida por um 500
     * por causa da limpeza seria vender o essencial pelo acessório.
     */
    let retencao: Awaited<ReturnType<typeof correrRetencao>> | null = null;
    try {
      retencao = await correrRetencao(await listQuotes());
    } catch (e) {
      log.error("cron backup: a retenção falhou (a cópia seguiu na mesma)", e, { dia });
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A RECICLAGEM DOS 30 DIAS (fase R3 do «tudo reversível»)
     * ══════════════════════════════════════════════════════════════════════
     *
     * O que foi apagado há mais de 30 dias sai de vez. Aqui, e não num
     * agendamento próprio, pela mesma razão da retenção: depois da cópia do
     * dia, e sem apostar num plano de alojamento que não temos. Se falhar, a
     * cópia seguiu na mesma — e amanhã tenta outra vez. Sem a tabela (a
     * migração ainda não correu), não há nada para limpar.
     */
    let reciclagem: { apagadas: number; ficaram: number } | null = null;
    try {
      // 20 s: a função tem 60, e a cópia e a retenção já gastaram parte. O
      // que não couber (uma pasta grande de fotos) fica para amanhã.
      reciclagem = await limparExpiradas(new Date(), 50, 20_000);
      if (reciclagem.ficaram > 0) {
        log.warn("cron backup: há fotografias da Reciclagem que não saíram — fica para amanhã", {
          dia,
          ficaram: reciclagem.ficaram,
        });
      }
    } catch (e) {
      if (!isMissingTable(e)) {
        log.error("cron backup: a limpeza da Reciclagem falhou (a cópia seguiu na mesma)", e, {
          dia,
        });
      }
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * E, COM O TEMPO QUE SOBRAR, OS PDF DAS PROPOSTAS JÁ ENVIADAS
     * ══════════════════════════════════════════════════════════════════════
     *
     * A pergunta dela: «mesmo nas propostas em que já enviamos (…) se também
     * vai acontecer nestas propostas que já enviamos». Para tudo o resto a
     * resposta é sim sem se fazer nada. O PDF é a excepção — o ficheiro é
     * guardado no ENVIO, portanto as propostas anteriores a isso, e as que
     * ficaram órfãs quando a chave mudou a 26/08, não têm nenhum. O primeiro
     * casal a carregar no botão paga o desenho inteiro.
     *
     * Aqui desenha-se de noite o que falta, para ninguém o pagar de dia. A
     * razão de viver dentro deste trabalho, e não num agendamento novo, está
     * no `aquecimento-de-pdf.ts`: um terceiro agendamento é uma aposta no
     * plano de alojamento, e esta casa já teve um deploy recusado por isso.
     *
     * ── E NUNCA PODE DEITAR A CÓPIA ABAIXO ──────────────────────────────
     *
     * Mesma regra da retenção, e pela mesma razão: a cópia já seguiu quando
     * isto corre. Se o aquecimento falhar, regista-se e a resposta continua a
     * dizer que a cópia seguiu — porque seguiu. O `aquecerPdfsEmFalta` já não
     * lança; o `try` é o cinto por cima dos suspensórios, e o `import()`
     * mantém o desenhador fora do arranque das noites em que não há nada a
     * fazer.
     */
    let aquecimento: Awaited<ReturnType<typeof aquecerPdfsEmFalta>> | null = null;
    try {
      const { aquecerPdfsEmFalta } = await import("@/lib/aquecimento-de-pdf");
      aquecimento = await aquecerPdfsEmFalta(Date.now() - arrancou);
    } catch (e) {
      log.error("cron backup: o aquecimento dos PDF falhou (a cópia seguiu na mesma)", e, { dia });
    }

    log.info("cron backup enviado", {
      dia,
      bytes: comprimido.byteLength,
      sent,
      parcial,
      fotografias: fotos?.manifesto.ficheiros ?? null,
    });
    return NextResponse.json({
      ok: true,
      sent,
      dia,
      bytes: comprimido.byteLength,
      incomplete: falhados,
      fotografias: fotos
        ? {
            ficheiros: fotos.manifesto.ficheiros,
            bytes: fotos.manifesto.bytes,
            completo: fotos.manifesto.completo,
          }
        : null,
      retencao,
      reciclagem,
      aquecimento,
    });
  } catch (err) {
    log.error("cron backup falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("cron-backup GET", GET_semMedida);
