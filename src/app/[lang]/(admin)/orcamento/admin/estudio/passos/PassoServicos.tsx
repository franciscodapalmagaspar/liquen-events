"use client";

import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import ServicesEditor from "../../ServicesEditor";
import { Section } from "../formulario/Section";
import type { Step } from "../tipos";

interface PropsPassoServicos {
  bilingue: boolean;
  doc: StudioDoc;
  guardarAgora: () => void;
  isDeco: boolean;
  notaDaSeccao: (chave: string, titulo: string) => React.JSX.Element;
  setServiceGroups: (
    update: (prev: StudioDoc["serviceGroups"]) => StudioDoc["serviceGroups"],
  ) => void;
  step: Step;
}

/**
 * O passo 2, «Serviços»: os grupos de serviços da proposta. Saiu do
 * `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function PassoServicos({
  bilingue,
  doc,
  guardarAgora,
  isDeco,
  notaDaSeccao,
  setServiceGroups,
  step,
}: PropsPassoServicos) {
  return (
    <Section
      title="Serviços"
      id="servicos"
      escondida={step !== "servicos"}
      rodape={notaDaSeccao("servicos", "Nota sobre os serviços")}
    >
      {/* O editor com teclado, arrasto e anular vive em ServicesEditor. */}
      <ServicesEditor
        groups={doc.serviceGroups}
        onGroupsChange={setServiceGroups}
        showDesc={!isDeco}
        // O Ctrl/Cmd+Enter dos Serviços é o MESMO gesto do botão
        // «Guardar agora» — e por isso a mesma função, não uma segunda
        // gravação com outras regras e outras palavras.
        onSave={guardarAgora}
        // As caixas inglesas dos grupos e das linhas. O editor não sabe
        // o que é uma proposta bilingue: recebe o interruptor e desenha
        // uma caixa a mais por campo, com a mesma pega e o mesmo rótulo
        // do resto da casa.
        bilingue={bilingue}
      />
    </Section>
  );
}
