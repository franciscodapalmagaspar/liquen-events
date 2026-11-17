import { type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { MAX_PHOTO_ORDER } from "@/lib/theme-types";
import { type AccaoDoAviso } from "../Toast";
import { capaDaFoto, type CapaDoCartao } from "../capa-do-cartao";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import { AccaoEmBloco, moveItem } from "@/lib/temas/listas-de-fotos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ARRUMAR A PASTA — a ordem das fotos, a capa e o nome do tema
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mudar uma foto de lugar (e gravar a ordem), escolher a capa, renomear o
 * tema, e as perguntas antes de remover fotos.
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasArrumacaoDaPasta {
  theme: ThemeSummary;
  onRename: (name: string) => void;
  onCover: (coverPath: string, capa: CapaDoCartao) => void;
  toast: (message: string, kind?: "success" | "error" | "info", accao?: AccaoDoAviso) => void;
  anular: (mensagem: string, repor: () => unknown, anulado?: string) => void;
  setImages: Dispatch<SetStateAction<ThemeImage[]>>;
  images: ThemeImage[];
  selected: Set<string>;
  setBulkBusy: Dispatch<SetStateAction<boolean>>;
  setARemover: Dispatch<SetStateAction<{ alvos: ThemeImage[]; emBloco: boolean } | null>>;
  setEmBloco: Dispatch<SetStateAction<AccaoEmBloco | null>>;
  coverPath: string | undefined;
  setCoverPath: Dispatch<SetStateAction<string | undefined>>;
  ordemMandada: RefObject<number>;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  setRenaming: Dispatch<SetStateAction<boolean>>;
  renamingBusy: RefObject<boolean>;
  alive: RefObject<boolean>;
  clearSelection: () => void;
  removeImages: (targets: ThemeImage[], aoProgredir?: (feitas: number) => void) => Promise<void>;
}

export function useArrumacaoDaPasta({
  theme,
  onRename,
  onCover,
  toast,
  anular,
  setImages,
  images,
  selected,
  setBulkBusy,
  setARemover,
  setEmBloco,
  coverPath,
  setCoverPath,
  ordemMandada,
  name,
  setName,
  setRenaming,
  renamingBusy,
  alive,
  clearSelection,
  removeImages,
}: EntradasArrumacaoDaPasta) {
  /**
   * Fixa a ordem que está à vista.
   *
   * Guarda-se o que ESTÁ carregado (cortado no teto do servidor): essas fotos
   * passam a ser o prefixo arrumado do tema e tudo o resto continua a vir por
   * data, atrás delas. É o que faz "pôr as boas à frente" custar meia dúzia de
   * caminhos em vez de uma cópia do catálogo.
   */
  async function persistOrder(
    next: ThemeImage[],
    previous: ThemeImage[],
    destino: number,
    comAnular = true,
  ): Promise<boolean> {
    const oQue = `guardar a nova ordem das fotos de "${theme.name}"`;
    // SÓ A ÚLTIMA ARRUMAÇÃO FALA. Cada Alt+seta é um PATCH seu, e cinco toques
    // seguidos a empurrar a mesma foto davam cinco avisos iguais empilhados —
    // ruído que ensina a não ler os avisos. O número diz qual é a arrumação
    // mais recente; as que ficaram para trás guardam-se na mesma, caladas.
    const minha = ++ordemMandada.current;
    /** A ordem volta ao que estava — e a frase diz que voltou. Mostrar uma
     *  arrumação que o servidor não guardou seria mentir-lhe até ao próximo
     *  recarregamento; deixá-la voltar sem aviso é pior ainda, porque ela vê a
     *  foto que arrastou saltar de novo para o sítio antigo. */
    const reverter = (mensagem: string) => {
      if (!alive.current) return;
      setImages(previous);
      toast(`${mensagem} A grelha voltou à ordem anterior.`, "error");
    };
    let res: Response;
    try {
      res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoOrder: next.slice(0, MAX_PHOTO_ORDER).map((im) => im.path) }),
      });
    } catch {
      reverter(porqueRebentou(oQue).mensagem);
      return false;
    }
    if (res.ok) {
      // O QUE NÃO SE VÊ É O SERVIDOR. A foto salta para o lugar novo no
      // instante do arrasto — o que ficava por dizer era se a arrumação lá
      // ficou, e a única pista era a grelha saltar para trás quando falhava.
      // Um ecrã que só fala quando corre mal é um ecrã em que o silêncio não
      // quer dizer nada.
      //
      // E diz a POSIÇÃO: numa grelha de sessenta fotos iguais, «ordem
      // guardada» não deixa reconhecer o gesto que foi mesmo guardado.
      //
      // E com «Anular»: a grelha volta à ordem de antes, gravada pelo mesmo
      // PATCH. (O próprio «Anular» não traz outro — diz «Anulado.».)
      if (comAnular && alive.current && minha === ordemMandada.current) {
        anular(`Ordem guardada — a foto ficou na posição ${destino + 1} de ${next.length}.`, () => {
          if (!alive.current) return false;
          setImages(previous);
          return persistOrder(previous, next, destino, false);
        });
      }
      return true;
    }
    const data = await res.json().catch(() => null);
    // A queixa da instalação por acabar (`db/schema.sql`) passa inteira: é uma
    // instrução para quem monta isto, e nenhuma frase nossa a substitui.
    const doServidor = typeof data?.error === "string" ? data.error : "";
    reverter(
      /db\/schema\.sql|base de dados/i.test(doServidor)
        ? doServidor
        : porqueFalhou(oQue, res, data).mensagem,
    );
    return false;
  }

  /** Move uma foto para outra posição da grelha (arrasto, setas ou "para o início"). */
  function moveTo(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      const next = moveItem(prev, from, to);
      if (next === prev) return prev;
      void persistOrder(next, prev, to);
      return next;
    });
  }

  /** Perguntar por uma foto solta. Quem age é o `removeImages`. */
  function pedirParaRemoverUma(im: ThemeImage) {
    setARemover({ alvos: [im], emBloco: false });
  }

  /**
   * Perguntar pelo lote seleccionado.
   *
   * Sem selecção não há pergunta nenhuma: perguntar «remover 0 fotografias?»
   * seria pedir uma decisão sobre nada.
   */
  function pedirParaRemoverAsSeleccionadas() {
    const targets = images.filter((i) => selected.has(i.path));
    if (targets.length === 0) return;
    setARemover({ alvos: targets, emBloco: true });
  }

  async function removeSelected(targets: ThemeImage[]) {
    if (targets.length === 0) return;
    setBulkBusy(true);
    // A remoção é otimista: a grelha e a seleção esvaziam-se já, e a barra de
    // ações desaparece com elas. O cartão fica no lugar dela, no mesmo sítio
    // colado ao topo — senão as fotos sumiam e mais nada dizia que ainda havia
    // pedidos a caminho do servidor.
    setEmBloco({ tipo: "remover", feito: 0, total: targets.length });
    try {
      await removeImages(targets, (feitas) => {
        if (!alive.current) return;
        setEmBloco((p) => (p && p.tipo === "remover" ? { ...p, feito: feitas } : p));
      });
    } finally {
      if (alive.current) {
        setBulkBusy(false);
        setEmBloco(null);
      }
    }
  }

  /** Escolhe a foto que representa o tema na lista. */
  async function setAsCover(im: ThemeImage, comAnular = true): Promise<boolean> {
    const capaAntes = coverPath;
    // Aqui não há nada a reverter: a capa só muda no ecrã depois de o servidor
    // confirmar. O que faltava era a frase saber distinguir a sessão expirada
    // do servidor em baixo — e nomear o tema, que é o que ela tem seis vezes
    // aberto em separadores diferentes.
    const oQue = `definir a capa de "${theme.name}"`;
    let res: Response;
    try {
      res = await fetch(`/api/temas/${theme.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPath: im.path }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, data).mensagem, "error");
      return false;
    }
    setCoverPath(im.path);
    onCover(im.path, capaDaFoto(im));
    clearSelection();
    // Com «Anular» quando a capa de antes está à mão (carregada na grelha):
    // volta a ser ela, pelo mesmo PATCH. Sem ela carregada não há os campos
    // que o cartão da lista precisa (`capa-do-cartao.ts`), e não se oferece.
    const fotoAntes = capaAntes ? images.find((i) => i.path === capaAntes) : undefined;
    if (comAnular && fotoAntes && fotoAntes.path !== im.path) {
      anular(`A capa de "${theme.name}" mudou.`, () => setAsCover(fotoAntes, false));
    }
    return true;
    // AQUI NÃO SE DIZ NADA, e é de propósito. A capa só muda depois de o
    // servidor confirmar, e o que ele confirmou aparece na própria foto que ela
    // escolheu — a etiqueta «Capa» no canto da célula, mais a barra da seleção
    // a desaparecer. Um aviso a dizer o que já está à frente dos olhos é ruído,
    // e é a mesma decisão que a estrela dos temas já tinha: o `alternarMarca`
    // avisa ao arquivar (o cartão sai da lista) e cala-se ao fixar (a estrela
    // acende-se à vista).
  }

  async function rename() {
    // O Enter fecha o campo e o onBlur dispara logo a seguir: sem esta guarda
    // saíam dois PATCH iguais para o servidor.
    if (renamingBusy.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === theme.name) {
      setName(theme.name);
      setRenaming(false);
      return;
    }
    renamingBusy.current = true;
    // O nome antigo fica guardado aqui: depois do `onRename` a lista lá fora já
    // mudou, e a frase precisa dos DOIS nomes para dizer o que mudou.
    const antigo = theme.name;
    const oQue = `mudar "${antigo}" para "${trimmed}"`;
    /** O campo volta ao nome antigo — e a frase diz que voltou, senão ela lê o
     *  nome antigo no cabeçalho e julga que escreveu no sítio errado. */
    const reverter = (falha: Falha) => {
      setName(theme.name);
      toast(`${falha.mensagem} O nome voltou a "${theme.name}".`, "error");
    };
    try {
      let res: Response;
      try {
        res = await fetch(`/api/temas/${theme.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {
        reverter(porqueRebentou(oQue));
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        reverter(porqueFalhou(oQue, res, data));
        return;
      }
      onRename(trimmed);
      // COM OS DOIS NOMES, como o renomear que se faz a partir da lista
      // (`renomearDaLista`) já dizia. «Tema renomeado.» obrigava a ir conferir
      // ao cabeçalho se o que lá ficou era mesmo o que ela escreveu — e com
      // seis pastas abertas em separadores diferentes, nem dizia qual.
      //
      // Com «Anular»: o nome de antes, pelo mesmo PATCH. Um 409 (outro tema
      // ficou entretanto com esse nome) diz-se e não aparece «Anulado.».
      anular(`"${antigo}" passou a "${trimmed}"`, async () => {
        const volta = `voltar a chamar "${antigo}" a "${trimmed}"`;
        let r: Response;
        try {
          r = await fetch(`/api/temas/${theme.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: antigo }),
          });
        } catch {
          toast(porqueRebentou(volta).mensagem, "error");
          return false;
        }
        if (!r.ok) {
          toast(
            r.status === 409
              ? `Já há um tema chamado "${antigo}".`
              : porqueFalhou(volta, r, await r.json().catch(() => null)).mensagem,
            "error",
          );
          return false;
        }
        onRename(antigo);
        if (alive.current) setName(antigo);
        return true;
      });
    } finally {
      renamingBusy.current = false;
      setRenaming(false);
    }
  }
  return {
    setAsCover,
    moveTo,
    pedirParaRemoverUma,
    rename,
    pedirParaRemoverAsSeleccionadas,
    removeSelected,
  };
}
