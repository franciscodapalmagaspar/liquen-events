"use client";

import { ESTADO, PRESSAO } from "../../ui/movimento";
import type { EstadoDosUrls } from "../tipos";

/**
 * O que a célula mostra quando NÃO desenha a fotografia: recusada pelo sítio,
 * sem remédio (com «Tentar novamente»), ou sem URL. Saiu do `Thumb` tal e
 * qual (fase 2 de `docs/ESTRUTURA-DO-CODIGO.md`); «os três estados» estão
 * explicados no próprio `Thumb`.
 */
export function CelulaSemFotografia({
  semRemedio,
  recusadaPeloSitio,
  semUrlEFalhou,
  ultimoAlvo,
  estadoDosUrls,
  aoTentarDeNovo,
  tentarDeNovo,
}: {
  semRemedio: boolean;
  recusadaPeloSitio: boolean;
  semUrlEFalhou: boolean;
  ultimoAlvo: string | undefined;
  estadoDosUrls: EstadoDosUrls;
  aoTentarDeNovo?: () => void;
  tentarDeNovo: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-center text-[9px] leading-tight text-foreground/40">
      {semRemedio && recusadaPeloSitio ? (
        /* ── NÃO É A FOTOGRAFIA: É O SÍTIO ──────────────────────────────
           Sem botão de tentar outra vez, e é a diferença que interessa: a
           recusa não muda por se insistir. O «Abrir ficheiro» fica, e
           funciona — abrir o endereço noutro separador é uma navegação, e
           as regras que barram uma imagem DENTRO desta página não têm nada
           a dizer sobre isso.

           A frase não diz «política», nem «directiva», nem o nome da
           regra: quem lê isto quer saber se a fotografia se perdeu (não se
           perdeu) e se o problema é dela (não é). O resto está escrito no
           `title` e, por extenso, no comentário da escuta lá em cima. */
        <>
          <span className="font-medium text-[var(--bo-text-muted)]">Fotografia guardada</span>
          {/* Curta porque tem de CABER: a caixa tem 104 px de altura e
              `overflow-hidden`, e a frase inteira levava o «Abrir ficheiro»
              para fora do corte. A explicação toda vai no `title` — é a
              mesma decisão, e a mesma medição, do ramo «não veio na lista». */}
          <span title="A fotografia está guardada e inteira — sai bem no PDF. Quem a recusou aqui foi este site, por uma definição dele. Insistir dá sempre o mesmo.">
            O site não a deixa aparecer.
          </span>
          {ultimoAlvo && (
            <a
              href={ultimoAlvo}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 underline underline-offset-2 text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
            >
              Abrir ficheiro
            </a>
          )}
        </>
      ) : semRemedio ? (
        <>
          {/* ── E TEM DE CABER NA CAIXA ────────────────────────────────
              MEDIDO a 390 px, numa célula de 89 × 104 px: a etiqueta, a
              frase, o botão e o link somavam 128 px de conteúdo e a caixa
              tem `overflow-hidden` — 24 px cortados em baixo, e o que
              ficava de fora era o «Abrir ficheiro». A última saída de uma
              célula morta estava a ser cortada pela explicação de por que
              é que ela morreu.

              A frase passa para o `title`, exactamente como no ramo «não
              veio na lista», que já tinha aprendido isto à sua custa: numa
              caixa desta altura, cada linha custa uma coisa que já lá
              estava. */}
          <span
            className="font-medium text-[var(--bo-text-muted)]"
            title="A fotografia está guardada. Não consegui mostrá-la neste ecrã."
          >
            Imagem guardada
          </span>
          <span className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {/* ── E TENTA MESMO ALGUMA COISA DIFERENTE ──────────────────
                MEDIDO com a rede a devolver 503: o botão antigo repetia,
                ao byte, os dois URL que acabavam de falhar — nenhum
                pedido novo com um endereço novo. Contra a causa mais
                provável de uma grelha inteira morta — assinaturas que já
                não servem — isso é um botão que não pode funcionar.

                Agora são as duas coisas, por esta ordem: pedir ao
                servidor a lista outra vez (URLs frescos, e a memória dos
                mortos garante que o mapa os aceita) e recomeçar a cascata
                desta célula. */}
            <button
              type="button"
              onClick={() => {
                aoTentarDeNovo?.();
                tentarDeNovo();
              }}
              className={`rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-[var(--bo-tinta-72)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
            >
              Tentar novamente
            </button>
            {ultimoAlvo && (
              <a
                href={ultimoAlvo}
                target="_blank"
                rel="noreferrer"
                className={`underline underline-offset-2 text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
              >
                Abrir ficheiro
              </a>
            )}
          </span>
        </>
      ) : semUrlEFalhou ? (
        /* ── NÃO HÁ URL, E NÃO VAI HAVER ────────────────────────────────
           Este é o ramo que ela viu — só que dizia «Imagem» e mais nada. A
           fotografia está guardada; o que falhou foi a leitura da lista.
           Dizê-lo, e dar um botão, é a diferença entre um ecrã avariado e
           um ecrã que explica.

           ── PORQUE É QUE A FRASE É TÃO CURTA ────────────────────────────
           MEDIDO a 375 px: uma célula de um mood board com oito fotos tem
           ~110×75 px, e a caixa tem `overflow-hidden`. A primeira versão
           dizia «Não consegui ir buscar as fotografias desta proposta.» —
           quatro linhas a 9 px mais o botão, e o que se via na captura era
           «as fotografias desta», com a primeira linha E o botão cortados.
           Uma explicação que não cabe não é uma explicação: é a mesma caixa
           cinzenta com outras palavras.

           Cabe uma etiqueta e o botão. A frase inteira vai no `title` e no
           `aria-label` do botão — que é onde ainda serve para alguma coisa
           (leitor de ecrã, rato) sem roubar o espaço a quem só precisa de
           saber que ISTO FALHOU e onde carregar. */
        <>
          {/* Sem ícone: MEDIDO, o ⚠ ocupava a linha que faltava ao botão e
              a captura mostrava o «Tentar» encostado ao corte de baixo. Numa
              caixa de 75 px, cada linha custa uma coisa que já lá estava. */}
          <span
            className="font-medium text-[var(--bo-text-muted)]"
            title={
              estadoDosUrls === "falhou"
                ? "Não consegui ir buscar as fotografias desta proposta."
                : "Esta fotografia está no documento, mas não veio na lista que o servidor devolveu."
            }
          >
            {estadoDosUrls === "falhou" ? "Não carregou" : "Não veio na lista"}
          </span>
          {aoTentarDeNovo && (
            <button
              type="button"
              onClick={aoTentarDeNovo}
              aria-label="Ir buscar outra vez as fotografias desta proposta"
              className={`mt-0.5 rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-[var(--bo-tinta-72)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
            >
              Tentar
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
