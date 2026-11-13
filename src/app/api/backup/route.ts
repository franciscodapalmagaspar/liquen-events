import { NextRequest, NextResponse, after } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { hojeNoEstudio } from "@/lib/proposal-doc";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listSuppliers } from "@/lib/suppliers-store";
import { listTasks } from "@/lib/tasks-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { listInvoices } from "@/lib/invoices-store";
import { listContracts } from "@/lib/contracts-store";
import { listItems } from "@/lib/inventory-store";
import { listMaterial } from "@/lib/material-store";
import { listLists } from "@/lib/material-lists-store";
import { listAllListItems } from "@/lib/material-list-items-store";
import { listRules } from "@/lib/material-rules-store";
import { listEventMaterial } from "@/lib/event-material-store";
import { listAllEventItems } from "@/lib/event-material-items-store";
import { listAllLog } from "@/lib/event-material-log-store";
import { listTemplatesWithDefaults } from "@/lib/email-templates-store";
import { listThemes } from "@/lib/themes-store";
import { listEtiquetas } from "@/lib/biblioteca-etiquetas-store";
import { listFotos } from "@/lib/biblioteca-fotos-store";
import { listFotoEtiquetas } from "@/lib/biblioteca-foto-etiquetas-store";
import { readOverviewSettings } from "@/lib/overview-settings-store";
import { listarDefinicoes } from "@/lib/proposta-definicoes-store";
import { listarServicos } from "@/lib/servicos-catalogo-store";
import { listProposalDrafts } from "@/lib/proposal-drafts";
import { listEnviosDeProposta } from "@/lib/envios-de-proposta";
import { registarCopiaEnviada } from "@/lib/copia-de-seguranca-marcador";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
// Lê treze conjuntos de dados inteiros. O gémeo agendado já pedia 60.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cópia de segurança COMPLETA dos dados de negócio, num único ficheiro JSON.
 *
 * Isto não é um export de conveniência: é o ficheiro que fica na mão de quem
 * gere o negócio se a base de dados desaparecer. Uma cópia incompleta é pior do
 * que nenhuma — dá a certeza de estar salvo a quem já não está. Durante muito
 * tempo esta rota levava apenas pedidos/propostas/fornecedores/tarefas/agenda e
 * deixava de fora o LIVRO DE FATURAS e os CONTRATOS ACEITES (a prova legal de
 * que o cliente aceitou as condições), além do inventário, dos modelos de email
 * e dos temas. Por isso a lista de conjuntos deixou de viver espalhada pelo
 * corpo do handler e passou a ser `BACKUP_DATASETS`, que os testes cruzam com
 * os `*-store.ts` do disco e com `db/schema.sql` — quem acrescentar um conjunto
 * novo e se esquecer da cópia leva um teste vermelho, não um silêncio.
 */

/** Um conjunto de dados que vai na cópia. */
export interface BackupDataset {
  /** Chave no ficheiro (e em `counts`). ESTÁVEL: um restauro depende dela. */
  key: string;
  /** Tabela de onde vêm os dados — é o que liga a cópia ao schema e aos stores. */
  table: string;
  /** Leitura completa do conjunto. */
  list: () => Promise<unknown[]>;
}

/**
 * Contadores de numeração fiscal (`invoice_counters`), lidos diretamente porque
 * não têm store próprio — a app só lhes toca pela função atómica
 * `next_invoice_seq`. Vão na cópia por uma razão concreta: repor as faturas sem
 * repor o contador faz a numeração recomeçar em FT AAAA/0001 e emitir números
 * já usados, o que num livro fiscal português é um problema legal, não um
 * incómodo. Sem Supabase configurado (só desenvolvimento) o contador vive em
 * `app_state` e aqui devolve-se vazio.
 */
async function listInvoiceCounters(): Promise<unknown[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("invoice_counters")
    .select("year, n")
    .order("year", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * TUDO o que a cópia leva.
 *
 * `table` é o nome da tabela escrito à mão DE PROPÓSITO, em vez de importado do
 * `mapper` de cada store: importar os mappers obrigava toda a suite a devolver
 * `mapper` sempre que um teste substitui um store (a auditoria de guardas de
 * autenticação, por exemplo, substitui-os todos) e transformava esta rota numa
 * fonte de partidas à distância. O risco de o literal divergir da tabela real é
 * fechado do outro lado: `route.coverage.test.ts` compara-o com o `mapper.table`
 * verdadeiro de cada store, e uma gralha aqui deixa o store por cobrir — teste
 * vermelho, com o nome do ficheiro em falta.
 */
export const BACKUP_DATASETS: readonly BackupDataset[] = [
  { key: "quotes", table: "quotes", list: listQuotes },
  { key: "proposals", table: "proposals", list: listAllProposals },
  { key: "suppliers", table: "suppliers", list: listSuppliers },
  { key: "tasks", table: "tasks", list: listTasks },
  { key: "calendarEvents", table: "calendar_events", list: listCalendarEvents },
  { key: "invoices", table: "invoices", list: listInvoices },
  { key: "invoiceCounters", table: "invoice_counters", list: listInvoiceCounters },
  { key: "contracts", table: "contracts", list: listContracts },
  { key: "inventoryItems", table: "inventory_items", list: listItems },
  // O catálogo de logística: é o inventário físico da empresa, escrito à mão
  // ou importado de uma folha de cálculo que pode já não existir.
  { key: "materialItems", table: "material_items", list: listMaterial },
  // As listas base são receitas escritas à mão ao longo de meses. Perdê-las
  // custa mais do que perder o catálogo, que se reimporta de um CSV.
  { key: "materialLists", table: "material_lists", list: listLists },
  { key: "materialListItems", table: "material_list_items", list: listAllListItems },
  // As regras são meses de afinação escritos à mão; as checklists dos eventos
  // são o registo de quem marcou o quê e quando, que é o que resolve uma
  // discussão sobre material perdido.
  { key: "materialRules", table: "material_rules", list: listRules },
  { key: "eventMaterial", table: "event_material", list: listEventMaterial },
  { key: "eventMaterialItems", table: "event_material_items", list: listAllEventItems },
  // O registo é a prova de quem marcou o quê. Sem ele, uma discussão sobre
  // material perdido não tem como se resolver.
  { key: "eventMaterialLog", table: "event_material_log", list: listAllLog },
  // `...WithDefaults` de propósito: interessa guardar os modelos TAL COMO a
  // equipa os vê, incluindo os que ainda estão na versão de origem.
  { key: "emailTemplates", table: "email_templates", list: listTemplatesWithDefaults },
  { key: "themes", table: "proposal_themes", list: listThemes },
  // A Biblioteca visual, os três a seguir. O que aqui importa mesmo é o
  // terceiro: as fotos reconstroem-se do bucket e o vocabulário são 23 linhas,
  // mas "esta foto é um seating plan em terracotta" só existe porque alguém o
  // disse — é trabalho à mão que nada repõe.
  { key: "bibliotecaEtiquetas", table: "biblioteca_etiquetas", list: listEtiquetas },
  { key: "bibliotecaFotos", table: "biblioteca_fotos", list: listFotos },
  { key: "bibliotecaFotoEtiquetas", table: "biblioteca_foto_etiquetas", list: listFotoEtiquetas },
  // A Visão Geral guarda os dois campos como duas LINHAS (`notas`, `meta`);
  // `readOverviewSettings` devolve-as indexadas por campo — aqui voltam a ser
  // linhas, que é a forma como o resto do ficheiro fala e como se repõem.
  {
    key: "overviewSettings",
    table: "overview_settings",
    list: async () => Object.values(await readOverviewSettings()),
  },
  // Os números com que o estúdio faz contas — o preço do combustível, o resto
  // do custo por quilómetro, a margem mínima. Entram na cópia porque são
  // trabalho dela e não um derivado: perdidos, as propostas seguintes voltam a
  // calcular com os valores de partida sem nada a assinalá-lo.
  {
    key: "propostaDefinicoes",
    table: "proposal_settings",
    list: listarDefinicoes,
  },
  // A biblioteca de serviços é redacção — horas de escrever bem, que não se
  // reconstroem de mais lado nenhum.
  {
    key: "servicosCatalogo",
    table: "service_catalog",
    list: listarServicos,
  },
  // ── Os rascunhos do Estúdio de Propostas ────────────────────────────────
  //
  // O maior bloco de trabalho IRRECUPERÁVEL do sistema, e durante todo este
  // tempo era precisamente o que a cópia saltava. Uma proposta por acabar —
  // fotos escolhidas do bucket, mood boards compostos, textos, valores — é
  // trabalho de horas que não existe em mais lado nenhum: as propostas
  // ENVIADAS têm a sua coluna `doc` (essa já vem em `proposals`), mas o que
  // ainda não seguiu vive só aqui.
  //
  // ATENÇÃO ao que isto leva da tabela `app_state`: leva o espaço de nomes dos
  // rascunhos (`proposal-draft:`) e MAIS NADA. Os marcadores de operação da
  // mesma tabela ficam de fora de propósito — ver `PARTIALLY_BACKED_UP`, que é
  // onde essa decisão está escrita e onde o ficheiro a vai buscar.
  //
  // `listProposalDrafts` LANÇA quando a varredura não se conseguiu fazer
  // inteira, e é isso que faz este conjunto aparecer em `incomplete` em vez de
  // sair vazio com ar de "não havia rascunhos nenhuns".
  {
    key: "proposalDrafts",
    table: "app_state",
    list: listProposalDrafts,
  },
  // As CÓPIAS dos emails de proposta que saíram (`envio-de-proposta:…`), pelo
  // mesmo caminho e pela mesma razão: a cópia levava a PROPOSTA e não levava o
  // email que a acompanhou. No dia da reposição, a pergunta que se faz ao
  // telefone — «o que é que nós lhes escrevemos?» — voltava a não ter resposta.
  //
  // `listEnviosDeProposta` também LANÇA quando a varredura fica truncada: é
  // isso que põe o conjunto em `incomplete` em vez de o deixar sair vazio com
  // ar de «não se enviou nada».
  {
    key: "proposalEmails",
    table: "app_state",
    list: listEnviosDeProposta,
  },
] as const;

/**
 * Tabelas que NÃO vão na cópia, e a razão. Não é uma lista de esquecimentos: é
 * uma decisão registada, e os testes obrigam a que qualquer tabela nova de
 * `db/schema.sql` esteja aqui ou em `BACKUP_DATASETS`.
 */
export const NOT_BACKED_UP: Readonly<Record<string, string>> = {
  reciclagem:
    "O que se apagou nos últimos 30 dias (fase R3 do «tudo reversível»). Cada linha é uma CÓPIA de uma coisa que, enquanto existiu, foi nas cópias diárias como qualquer outra — a cópia do dia anterior ao apagar tem-na viva, na tabela dela. Levar a Reciclagem também seria levar o mesmo dado duas vezes, e uma reposição escreveria por cima a Reciclagem de hoje com a de há dois meses: ressuscitava, como apagado, o que entretanto foi reposto. O que fica de fora é só o que nasceu e se apagou no mesmo dia, entre duas cópias.",
  message_links:
    "As anotações da caixa de entrada de email — a ligação de uma mensagem a um pedido, as etiquetas, o alfinete e o arquivo. A caixa de entrada foi APAGADA a pedido dela (ver o cabeçalho do RUNBOOK): nada no sistema volta a escrever ou a ler esta tabela, e as linhas que lá estão apontam para identificadores de mensagens de um ecrã que já não existe. A tabela NÃO foi deitada abaixo — as linhas continuam na base de dados, intactas, e podem ser lidas ou apagadas à mão por quem quiser. O que deixou de fazer sentido é levá-las numa cópia de segurança que existe para repor o que a casa usa.",
  push_subscriptions:
    "Subscrições Web Push, uma por browser/dispositivo: um endereço de entrega mais duas chaves SECRETAS. São credenciais de browser, caducam sozinhas e são recriadas quando a equipa volta a autorizar as notificações — repô-las não devolve nada e exportá-las era espalhar segredos por um ficheiro que anda de email em email.",
  passkeys:
    "Os dispositivos registados para entrar sem palavra-passe. São credenciais, não dados do negócio, e ficam de fora por uma razão que vale mais do que a comodidade de as repor: uma reposição escreve por cima do conjunto inteiro, portanto passkeys na cópia significaria que repor um ficheiro de há dois meses RESSUSCITAVA o aparelho de alguém que entretanto saiu da equipa — sem ninguém reparar, porque a atenção estaria toda nos dados. Ficando de fora, a reposição não lhes toca: quem estava registado continua, quem foi removido continua removido. Perder a tabela obriga cada pessoa a registar outra vez o seu aparelho, o que se faz em segundos e sempre com a palavra-passe como caminho alternativo.",
  registo_de_acoes:
    "O registo de «quem fez o quê» no back office (13/11): quem, quando, o método e o caminho de cada alteração — nunca o conteúdo. É um diário de auditoria, não dados do negócio, e fica de fora por duas razões. Repor uma cópia escreve por cima do conjunto inteiro, e um registo de auditoria que se pode reescrever com o de há dois meses deixa de provar o que quer que seja. E a cópia diária vai por email: levar doze meses de entradas era fazer crescer o anexo todos os dias sem nada a ganhar na reposição. Perder a tabela não tira nada à casa — perde-se só o histórico de quem mexeu.",
};

/**
 * Tabelas que vão na cópia SÓ EM PARTE, e o que fica de fora de cada uma.
 *
 * Porque é que isto existe: `app_state` guarda duas coisas com valores
 * opostos. Guarda os RASCUNHOS do estúdio (`proposal-draft:…`), que são o
 * maior bloco de trabalho irrecuperável da casa, e guarda os MARCADORES DE
 * OPERAÇÃO, que não são dados do negócio. A tabela inteira estava em
 * `NOT_BACKED_UP` com a razão dos marcadores — escrita quando só eles aqui
 * viviam, e nunca corrigida depois de os rascunhos se lhes juntarem.
 *
 * Pôr a tabela em `BACKUP_DATASETS` e mais nada resolvia os rascunhos e criava
 * outra mentira: o ficheiro passava a dar a entender que leva a tabela toda. E
 * `NOT_BACKED_UP` não podia ficar com ela — uma tabela ao mesmo tempo excluída
 * e na cópia é uma contradição que os testes recusam, e com razão.
 *
 * Daí esta terceira lista. Não é uma excepção administrativa: é a frase que
 * falta para o ficheiro dizer a verdade, e vai LÁ DENTRO, em `notIncluded`.
 */
export const PARTIALLY_BACKED_UP: Readonly<Record<string, string>> = {
  app_state:
    "Desta tabela vão na cópia APENAS dois espaços de nomes: os rascunhos do Estúdio de Propostas (chaves `proposal-draft:…`, conjunto `proposalDrafts`), porque as propostas por acabar são trabalho de horas que não existe em mais lado nenhum; e as cópias dos emails de proposta enviados (chaves `envio-de-proposta:…`, conjunto `proposalEmails`), porque o que foi escrito ao casal também não existe em mais lado nenhum — o modelo guardado é o ponto de partida e pode ter sido reescrito para aquele casal. Fica DE FORA todo o resto, que são marcadores de funcionamento — os fechos já enviados à Meta e o contador de faturas de DESENVOLVIMENTO (em produção a numeração está em `invoice_counters`, essa sim na cópia, e é a que tem valor legal). Fica de fora também o tempo activo por proposta (chaves `tempo-activo:…`, ver `tempo-activo-servidor.ts`): é uma MEDIÇÃO de como a casa trabalha, não trabalho da casa — perdida, volta a acumular-se a partir do zero na proposta seguinte, e nenhuma proposta fica pior por causa disso. Copiá-la obrigaria a repor números de esforço ao lado de dados de negócio numa reposição em que a atenção tem de estar toda nos segundos. Ficam de fora, por fim, os MODELOS reutilizáveis — os de proposta (chave `proposal-templates`) e os de guião do dia (chave `guiao-templates`): são pontos de partida e não trabalho de um cliente, e cada um deles refaz-se em segundos a partir de uma proposta ou de um guião reais, que esses vão na cópia. Não é esquecimento: repor marcadores de operação de há dois meses faz a Meta receber conversões repetidas — ruído numa reposição em que a atenção tem de estar toda nos dados. Perdidos, refazem-se sozinhos com um aviso repetido, no máximo.",
};

/**
 * O que não cabe num JSON e tem de ser copiado à parte. Vai escrito dentro do
 * próprio ficheiro para que quem o guarda saiba o que ainda lhe falta.
 */
export const EXTERNAL_ASSETS: Readonly<Record<string, string>> = {
  "storage:proposal-assets":
    "Fotos das propostas (bucket privado do Supabase Storage). As propostas guardam o CAMINHO de cada foto, não a foto — o bucket tem de ser copiado à parte.",
  "storage:theme-assets":
    "Fotos da Biblioteca de Temas (bucket privado, uma pasta por tema). O mesmo: os temas guardam nomes de ficheiro, as imagens ficam no bucket.",
};

const README = [
  "Cópia de segurança dos dados de negócio da Líquen Events.",
  "Inclui pedidos, propostas, faturas (livro completo + contadores de numeração), contratos aceites, fornecedores, tarefas, agenda, inventário, modelos de email, temas, as notas/meta da Visão Geral e os RASCUNHOS do Estúdio de Propostas (as propostas por acabar).",
  "Da tabela `app_state` vêm SÓ os rascunhos: os marcadores de funcionamento que lá vivem ao lado deles ficam de fora de propósito (ver `notIncluded`).",
  "NÃO inclui as fotos (vivem nos buckets listados em `notIncluded`) — sem elas, propostas e temas repõem-se com os caminhos das imagens mas sem as imagens.",
  "PARA REPOR: back office → Backup → Repor cópia (POST /api/backup/restore). Carregar o ficheiro mostra primeiro um ENSAIO — o que aconteceria, sem escrever nada — e a reposição real exige uma frase escrita à mão. Repor SUBSTITUI o conteúdo de cada conjunto e faz antes uma cópia do estado actual, que é entregue para o caso de a reposição ter sido um engano. Os campos aqui estão como a aplicação os usa (`quoteId`, `clientName`), não como as colunas se chamam na base de dados (`quote_id`, `client_name`) — a conversão é a do `mapper` de cada store em src/lib. Guarda este ficheiro fora do computador de trabalho.",
  "Se `incomplete` não estiver vazio, ESTA CÓPIA ESTÁ INCOMPLETA — algum conjunto falhou a leitura e ficou vazio no ficheiro. Repete a exportação (a reposição recusa-se a repor esses conjuntos, para não trocar dados bons por um vazio de avaria).",
].join(" ");

/** Formato do ficheiro. Subir isto quando as chaves mudarem de forma incompatível.
 *  Exportado porque a REPOSIÇÃO tem de saber que versões sabe ler — e há um
 *  teste que cruza este número com o `BACKUP_SCHEMA_VERSION` do lado de lá. */
export const SCHEMA_VERSION = 2;

/** A cópia completa, tal e qual como vai no ficheiro descarregável.
 *
 *  Exportada por uma razão de segurança, não de arrumação: a REPOSIÇÃO faz uma
 *  cópia do estado actual antes de escrever por cima dele, e essa cópia tem de
 *  ser exactamente a mesma coisa que o botão Backup produz — a mesma função,
 *  não uma segunda parecida que envelheceria ao lado desta. `incomplete` é o
 *  que diz à reposição que a cópia de recuo não é fiável e que deve desistir. */
export async function buildBackupPayload(): Promise<{
  exportedAt: string;
  schemaVersion: number;
  readme: string;
  counts: Record<string, number>;
  incomplete: string[];
  notIncluded: Record<string, string>;
  [dataset: string]: unknown;
}> {
  // Um conjunto que falha degrada para [] para não levar a cópia inteira
  // atrás — mas fica REGISTADO em `incomplete`. Um vazio silencioso lê-se
  // como "não havia nada", que é exatamente a mentira que abre este ficheiro.
  const results = await Promise.all(
    BACKUP_DATASETS.map(async (d) => {
      try {
        return { key: d.key, rows: await d.list(), ok: true };
      } catch (err) {
        log.error("backup: conjunto falhou a leitura — cópia INCOMPLETA", err, {
          dataset: d.key,
          table: d.table,
        });
        return { key: d.key, rows: [] as unknown[], ok: false };
      }
    }),
  );

  // Pela ordem de declaração, não pela ordem em que as avarias aconteceram:
  // duas exportações seguidas do mesmo estado devem ler-se igual.
  const incomplete = results.filter((r) => !r.ok).map((r) => r.key);
  const data = Object.fromEntries(results.map((r) => [r.key, r.rows]));
  const counts = Object.fromEntries(results.map((r) => [r.key, r.rows.length]));

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    readme: README,
    counts,
    incomplete,
    // As três razões, numa lista só, porque quem abre o ficheiro tem uma
    // pergunta só: "o que é que isto NÃO tem?". As tabelas que só vão em parte
    // aparecem com o sufixo `(parte)` — sem ele, ler `app_state` nesta lista
    // dava a entender que a tabela ficou toda de fora, que é o contrário do
    // que acontece.
    notIncluded: {
      ...NOT_BACKED_UP,
      ...Object.fromEntries(
        Object.entries(PARTIALLY_BACKED_UP).map(([tabela, razao]) => [`${tabela} (parte)`, razao]),
      ),
      ...EXTERNAL_ASSETS,
    },
    ...data,
  };
}

/** Cópia completa (ver `BACKUP_DATASETS`) num único ficheiro JSON descarregável. */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const payload = await buildBackupPayload();
    /**
     * Sem espaços: é o mesmo JSON (o restauro lê-o igual — há teste a prová-lo),
     * mais pequeno, e por isso mais depressa no telemóvel. Quem o quiser ler à
     * mão abre-o num editor que o arruma.
     */
    const corpo = JSON.stringify(payload);

    /**
     * Uma cópia descarregada à mão CONTA como cópia.
     *
     * O carimbo é lido pelo painel do back office para dizer «não chega uma
     * cópia há N dias» (ver `lib/copia-de-seguranca-marcador.ts`). Se só a
     * tarefa agendada carimbasse, quem faz o descarregamento à mão — que é
     * precisamente o que o RUNBOOK manda fazer antes de mexer em dados, e o
     * caminho enquanto o `CRON_SECRET` não estiver resolvido — continuaria a
     * levar com o aviso. Um aviso que aparece a quem acabou de fazer o que ele
     * pede é um aviso que se aprende a ignorar.
     *
     * DEPOIS DA RESPOSTA, e não com um `void` solto (ver a mesma nota em
     * `/api/admin/recuperar`): o `after` mantém a função viva até a escrita
     * acabar, enquanto o `void` deixava o contentor congelar assim que o
     * ficheiro saísse — o carimbo nunca chegava a ser gravado e o painel
     * continuava a dizer «não chega uma cópia há N dias» a quem tinha acabado
     * de descarregar uma. O ficheiro continua a ser o que interessa: falhar
     * aqui não pode fazer falhar o descarregamento.
     */
    after(async () => {
      try {
        await registarCopiaEnviada({
          bytes: Buffer.byteLength(corpo, "utf8"),
          parcial: (payload.incomplete ?? []).length > 0,
          modo: "manual",
        });
      } catch (err) {
        log.warn("backup: carimbo da cópia manual não gravado", { erro: String(err) });
      }
    });

    return new NextResponse(corpo, {
      headers: {
        "Content-Type": "application/json",
        // O tamanho à frente: é o que deixa o back office mostrar quanto da
        // cópia já chegou, em vez de um botão parado.
        "Content-Length": String(Buffer.byteLength(corpo, "utf8")),
        "Content-Disposition": `attachment; filename="liquen-backup-${hojeNoEstudio()}.json"`,
      },
    });
  } catch (err) {
    log.error("backup GET falhou", err);
    return NextResponse.json({ error: "Erro ao gerar backup" }, { status: 500 });
  }
}
