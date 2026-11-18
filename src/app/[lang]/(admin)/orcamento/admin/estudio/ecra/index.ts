/**
 * O ecrã do «Fazer proposta», peça a peça — a fronteira pública desta pasta.
 *
 * Só o `EcraDoEstudio` monta estas peças, e pela ordem em que aparecem no
 * ecrã: cabeçalho, avisos, passos, corpo, «Rever e enviar», a barra de baixo
 * e as janelas. Tudo o resto em `ecra/` (as secções de cada passo, a barra
 * por dentro) é interior: lê o estúdio pelo `useEstudio()` e não se importa
 * de fora. Uma peça nova que alguém precise de montar noutro sítio entra
 * AQUI, com a razão — não por um caminho para dentro da pasta.
 */
export { CabecalhoDoEstudio } from "./CabecalhoDoEstudio";
export { AvisoDoValorEnviado } from "./versoes/AvisoDoValorEnviado";
export { AvisosDoEstudio } from "./AvisosDoEstudio";
export { PassosDoEstudio } from "./PassosDoEstudio";
export { CorpoDoEstudio } from "./CorpoDoEstudio";
export { PassoDeRever } from "./rever/PassoDeRever";
export { BarraDeBaixo } from "./barra/BarraDeBaixo";
export { JanelasDoEstudio } from "./JanelasDoEstudio";
