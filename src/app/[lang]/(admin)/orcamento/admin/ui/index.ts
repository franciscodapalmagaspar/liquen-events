/**
 * Barrel for the back-office UI primitives (the redesign foundation).
 *
 * Import from here so screens pull the shared, calm ChatGPT-app-like primitives
 * instead of re-hand-rolling Tailwind strings:
 *
 *   import { Button, Card, SectionCard, Field, PageHeader, EmptyState,
 *            Toolbar, Segmented } from "@/app/[lang]/(admin)/orcamento/admin/ui";
 *
 * All are `"use client"`, presentational, and free of any store import.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Card, SectionCard } from "./Card";
export type { CardProps, CardPadding, SectionCardProps } from "./Card";

export { Ajuda } from "./Ajuda";

// A espera desenhada de uma maneira só. Ver `EmCurso.tsx`: uma espera com doze
// desenhos diferentes não é uma linguagem, e o olho reaprende em cada ecrã.
export { EmCurso, useDecorrido } from "./EmCurso";
export type { EmCursoProps } from "./EmCurso";

export { PerguntaDestrutiva } from "./PerguntaDestrutiva";
export type { PerguntaDestrutivaProps } from "./PerguntaDestrutiva";

export { Field } from "./Field";
export type { FieldProps } from "./Field";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Toolbar } from "./Toolbar";
export type { ToolbarProps } from "./Toolbar";

// ── Escolher, sem a caixa do sistema operativo ─────────────────────────────
// A lista de um `<select>` é desenhada FORA do documento e nenhum CSS lhe
// chega. Este é o substituto da casa — com o teclado, o leitor de ecrã e o
// formulário que o nativo dava de graça, e com o nativo mantido no dedo (a
// justificação está no cabeçalho do ficheiro).
export { CampoDeHora } from "./CampoDeHora";
export type { CampoDeHoraProps } from "./CampoDeHora";
export { Escolha } from "./Escolha";
export type { EscolhaProps, OpcaoDeEscolha } from "./Escolha";

export { Segmented } from "./Segmented";
export type { SegmentedProps, SegmentedOption } from "./Segmented";

export { cn } from "./cn";

// ── Fundações adaptativas ──────────────────────────────────────────────────
// Responsivo ≠ adaptativo: estes não encolhem, mudam de forma. Ver
// ADAPTIVE-PRIMITIVES.md para quando usar cada um (e quando NÃO usar nenhum,
// que é sempre que a diferença for só de estilo — isso faz-se em CSS).
export {
  CORTES,
  useAdaptativo,
  useLargura,
  useCapacidade,
  useMontado,
  usePodeEsconderNoHover,
} from "./adaptativo";
export type { Largura, Capacidade, Adaptativo } from "./adaptativo";

export { FolhaOuDialogo } from "./FolhaOuDialogo";
export type { FolhaOuDialogoProps } from "./FolhaOuDialogo";

// O inspector: coluna de 320 px à direita a partir de `lg`, folha abaixo
// disso, ⌘I para abrir e fechar. Opaco — o vidro do ecrã é do cabeçalho.
export { Inspector } from "./Inspector";
export type { InspectorProps } from "./Inspector";

export { TabelaOuCartoes } from "./TabelaOuCartoes";
export type { TabelaOuCartoesProps, Coluna } from "./TabelaOuCartoes";

// A lista agrupada «como as Definições do macOS»: linhas de 44 px, rótulo e
// valor, `›` quando levam a algum lado. Conteúdo — sem sombra, sem vidro.
export { ListaAgrupada, LinhaAgrupada } from "./ListaAgrupada";
export type { ListaAgrupadaProps, LinhaAgrupadaProps } from "./ListaAgrupada";

// O esqueleto da cor da fotografia vive com os outros esqueletos
// (`../Skeleton.tsx`); sai também por aqui para os ecrãs o encontrarem ao pé
// dos primitivos. Sem cor válida, é o `.bo-skeleton` de sempre.
export { EsqueletoDeCor } from "../Skeleton";
export type { EsqueletoDeCorProps } from "../Skeleton";

export { MenuDeAccoes, emGrupos } from "./MenuDeAccoes";
export type { MenuDeAccoesProps, AccaoDeItem } from "./MenuDeAccoes";

export { CampoData, porExtenso } from "./CampoData";
export type { CampoDataProps } from "./CampoData";

// ── A escala de movimento ──────────────────────────────────────────────────
// Duas velocidades de interacção (toque 20 ms, estado 120 ms) e as duas curvas
// que a casa já tinha. Exportada para que os ecrãs possam convergir para a
// mesma escala em vez de cada um escolher a sua — ver `movimento.ts` para o
// censo que a motivou e para as três avarias silenciosas que ele encontrou.
export { ESTADO, PRESSAO, PROGRESSO, TOQUE_MS, ESTADO_MS, PROGRESSO_MS } from "./movimento";

/**
 * A superfície de vidro. Uma por ecrã — vidro sobre vidro duplica o custo e
 * transforma o fundo em papa cinzenta (`docs/LIQUID-GLASS.md`, Parte 5).
 */
export { Glass } from "@/components/Glass";
export type { GlassProps, SuperficieDeVidro } from "@/components/Glass";
