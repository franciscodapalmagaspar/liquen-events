import { blocosDaFolha } from "./orcamento/folha-da-timeline";
import { SITE } from "./site";
import type { TimelineItem } from "./orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARTILHAR PELO WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que haja uma opção para partilhar logo pelo WhatsApp e apareça logo os
 * contactos do WhatsApp. E o mesmo quando enviamos proposta no fazer proposta.»
 *
 * ── O QUE A WEB DEIXA E O QUE NÃO DEIXA ──────────────────────────────────
 *
 * **Não deixa** ler a lista de contactos de ninguém. Não há API nenhuma, em
 * browser nenhum, que devolva os contactos do WhatsApp a uma página — e ainda
 * bem, porque a página seguinte também os leria.
 *
 * **Deixa** abrir o WhatsApp já com a mensagem escrita. E o WhatsApp, ao abrir
 * assim, mostra a LISTA DE CONTACTOS para ela escolher a quem manda — que é o
 * que ela quer dizer com «aparecem logo os contactos». No telemóvel abre a
 * aplicação; no computador abre o WhatsApp Web. É o `wa.me`, e é oficial.
 *
 * ── E PORQUE É QUE NÃO SE MANDA DIRECTO AO CLIENTE ───────────────────────
 *
 * Dava para pôr o número do cliente no link e cair já na conversa dele — um
 * toque a menos. Não se faz, por duas razões, e a segunda é a que manda:
 *
 *  1. ela pediu os contactos à vista, e são eles que aparecem;
 *  2. a timeline vai para dez fornecedores e a proposta vai para o casal. Um
 *     link que escolhe sozinho o destinatário acerta quase sempre — e no dia
 *     em que erra, mandou uma proposta com preços à florista.
 */

/** O tecto do texto que se põe no link, em caracteres. */
const TECTO = 1400;

/**
 * O WhatsApp aceita mensagens longas, mas quem as recebe abre-as no telemóvel:
 * uma parede de texto de três páginas não se lê, rola-se. Cortar com uma frase
 * que DIZ que cortou é melhor do que entregar uma folha a meio sem avisar — e é
 * o sinal de que aquele dia pede o PDF e não uma mensagem.
 */
function cortar(texto: string): string {
  if (texto.length <= TECTO) return texto;
  const corte = texto.slice(0, TECTO);
  const fim = corte.lastIndexOf("\n");
  return `${corte.slice(0, fim > TECTO * 0.6 ? fim : TECTO)}\n\n(…) A timeline completa vai no PDF.`;
}

/**
 * O endereço que abre o WhatsApp com a mensagem escrita e a lista de contactos
 * à espera.
 *
 * `api.whatsapp.com` e não `wa.me`: o `wa.me` sem número redirecciona para uma
 * página de apresentação em alguns browsers, e esta entra directa no envio.
 */
export function linkDoWhatsApp(texto: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(cortar(texto))}`;
}

export interface FolhaParaWhatsApp {
  titulo: string;
  adultos?: string;
  criancas?: string;
  staff?: string;
  momentos: readonly TimelineItem[];
}

/**
 * A timeline escrita para uma mensagem.
 *
 * Agrupa pelas MESMAS duas regras da folha e do PDF (`blocosDaFolha`): a hora
 * escreve-se uma vez, o local escreve-se quando muda. Uma mensagem que
 * agrupasse de outra maneira era uma terceira versão do mesmo dia a andar por
 * aí — e esta é a que fica no telemóvel do fornecedor, longe do papel.
 *
 * Os asteriscos são negrito no WhatsApp. É a única formatação que ele tem, e
 * chega para separar a hora do que acontece nela.
 */
export function timelineParaWhatsApp(folha: FolhaParaWhatsApp): string {
  const linhas: string[] = [`*${folha.titulo}*`];

  const contagens = [
    folha.adultos && `${folha.adultos} adultos`,
    folha.criancas && `${folha.criancas} crianças`,
    folha.staff && `${folha.staff} staff`,
  ].filter(Boolean);
  if (contagens.length > 0) linhas.push(contagens.join(" · "));

  for (const b of blocosDaFolha(folha.momentos)) {
    linhas.push("");
    linhas.push(b.locais.length > 0 ? `*${b.hora}* — ${b.locais.join(" / ")}` : `*${b.hora}*`);
    for (const d of b.descricoes) linhas.push(`• ${d}`);
    /* As notas vão todas no fim do bloco e não coladas a cada momento: são «o
       que é preciso garantir» daquela hora, e na folha vivem numa coluna à
       parte pela mesma razão. */
    for (const n of b.notas) linhas.push(`  ↳ ${n}`);
  }

  linhas.push("");
  linhas.push(`${SITE.name} · ${SITE.phoneDisplay}`);
  return linhas.join("\n");
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR A CONVERSA COM O CLIENTE — o número que o `wa.me` entende
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `wa.me` só aceita o número internacional em dígitos (`351912345678`). Os
 * links da gaveta, dos Clientes e do dossier eram feitos com o telefone CRU,
 * tirando-lhe o que não era dígito — e um pedido antigo com «912 345 678»,
 * sem o +351, dava `wa.me/912345678`: o WhatsApp abria e dizia que o número
 * não existe.
 *
 * Desde 30/10 os telefones novos gravam-se em E.164 (`contacto-do-pedido.ts`),
 * e esses passam tal e qual. Os antigos não mudam na base de dados (não se
 * reescrevem dados), por isso a correcção é aqui, na leitura: um número sem
 * indicativo é português, como o servidor sempre o tratou.
 *
 * Fica sem a `libphonenumber-js` de propósito: estes links estão em ecrãs que
 * abrem a toda a hora, e para pôr o 351 à frente de nove dígitos não é preciso
 * trazer as regras de 245 países. Validar o número é trabalho de quem o grava.
 */
export function numeroParaWhatsApp(telefone: string | null | undefined): string {
  const t = (telefone ?? "").trim();
  if (!t) return "";
  const digitos = t.replace(/\D/g, "");
  if (/^\(?\s*\+/.test(t)) return digitos;
  if (digitos.startsWith("00")) return digitos.slice(2);
  // Nove dígitos a começar por 9, 2 ou 3: um número português sem o 351.
  if (/^[239]\d{8}$/.test(digitos)) return `351${digitos}`;
  return digitos;
}

/** O link que abre a conversa com este telefone, ou `""` se não houver número. */
export function linkDaConversa(telefone: string | null | undefined): string {
  const n = numeroParaWhatsApp(telefone);
  return n ? `https://wa.me/${n}` : "";
}
