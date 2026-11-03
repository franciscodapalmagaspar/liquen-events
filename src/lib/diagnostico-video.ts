/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGISTO ANÓNIMO DO VÍDEO DA ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (16/10, iPhone): «continua a parar» — «pára um bocadinho», ao mudar de
 * vídeo e a meio de um vídeo. Daqui não há iPhone nem Safari: o que se mede no
 * Chromium não é o que o iPhone dela faz. Perguntada, autorizou: «Sim, põe o
 * registo».
 *
 * Por isso, durante um mês (`DIAGNOSTICO_ATE`), cada abertura da página inicial
 * conta as paragens do vídeo à vista — mais de `PARAGEM_MS` sem um fotograma
 * novo — e, para cada uma, guarda o estado do vídeo e os últimos acontecimentos
 * antes dela. Vai para `/api/diagnostico-video`, que o guarda no `app_state`.
 *
 * ── O QUE NÃO VAI ────────────────────────────────────────────────────────
 * Nada que identifique alguém: nem o user agent inteiro (só a versão do iOS e
 * o browser, reduzidos — `aparelho`), nem o endereço, nem o `referrer`, nem
 * cookies. A sessão é um número ao acaso feito em cada abertura e esquecido ao
 * fechar. O servidor também não guarda o IP.
 *
 * Este ficheiro é puro (sem `window`): o relógio, o envio e o estado do vídeo
 * entram por fora, para se testar sem browser.
 */

/** Até quando o registo está ligado (dia, em UTC). Depois, nem envia nem grava. */
export const DIAGNOSTICO_ATE = "2026-11-16";

/** Sem fotograma novo durante mais do que isto, com o vídeo à vista, é uma paragem. */
export const PARAGEM_MS = 300;

/** Sem `requestVideoFrameCallback` (só o `timeupdate`, de ~250 ms em ~250 ms): mais largo. */
export const PARAGEM_SEM_FOTOGRAMAS_MS = 700;

/** Envios por página, no máximo. */
export const MAX_ENVIOS = 12;

/** Paragens guardadas por página (as mais recentes). */
export const MAX_PARAGENS = 20;

/** Acontecimentos guardados antes de cada paragem. */
export const ACONTECIMENTOS_ANTES = 10;

/**
 * O tamanho máximo do que se envia. A rota aceita 8 KB; fica uma folga para os
 * caracteres que o `TextEncoder` conta a dobrar (não há nenhum, mas não custa).
 */
export const CORPO_MAX_BYTES = 7500;

/** Quantos nomes diferentes de contadores a rota aceita. */
export const MAX_CONTADORES = 24;

/**
 * O nome de um acontecimento como a rota o aceita (`^[a-z-]{1,16}$`). Um nome
 * fora disto fazia a rota recusar o envio INTEIRO, calada: foi o que aconteceu
 * de 2/11 a 3/11 com «paragem-com-dados» (17 letras), e as visitas com
 * paragens deixaram de chegar.
 */
export function nomeQueARotaAceita(nome: string): string {
  const k = nome
    .toLowerCase()
    .replace(/[^a-z-]/g, "")
    .slice(0, 16);
  return k || "outro";
}

/** Espera depois de uma paragem antes de enviar (junta as que vierem seguidas). */
export const ENVIO_DEPOIS_MS = 3000;

export const ROTA_DO_DIAGNOSTICO = "/api/diagnostico-video";

/** A chave do `app_state` onde fica uma página: o dia (UTC) e a sessão. */
export function chaveDoDiagnostico(sessao: string, agora = new Date()): string {
  return `diagnostico-video:${agora.toISOString().slice(0, 10)}:${sessao}`;
}

/** O registo está ligado nesta data? */
export function diagnosticoLigado(agora: number = Date.now()): boolean {
  return agora < Date.parse(`${DIAGNOSTICO_ATE}T00:00:00Z`);
}

export const NAVEGADORES = [
  "safari",
  "instagram",
  "facebook",
  "chrome-ios",
  "firefox-ios",
  "outro-ios",
  "chrome",
  "firefox",
  "safari-mac",
  "outro",
] as const;
export type Navegador = (typeof NAVEGADORES)[number];

export interface Aparelho {
  /** «18.1» no iPhone/iPad; `null` fora do iOS. */
  ios: string | null;
  nav: Navegador;
  movel: boolean;
  /** «390x844@3». */
  ecra: string;
  alto: boolean;
  /** O `effectiveType` (4g, 3g…), quando o browser o diz. */
  ligacao: string | null;
}

/**
 * O aparelho, reduzido ao que serve para investigar. O user agent inteiro
 * NÃO sai daqui: só a versão do iOS e o nome do browser.
 */
export function aparelho(
  ua: string,
  ecra: { largura: number; altura: number; densidade: number },
  ligacao?: string | null,
): Aparelho {
  const ios = /\b(?:iPhone|iPad|iPod)\b.*?\bOS (\d+)[_.](\d+)/.exec(ua);
  const nav: Navegador = /\bInstagram\b/.test(ua)
    ? "instagram"
    : /\bFBAN|FBAV\b/.test(ua)
      ? "facebook"
      : ios
        ? /\bCriOS\b/.test(ua)
          ? "chrome-ios"
          : /\bFxiOS\b/.test(ua)
            ? "firefox-ios"
            : /\bSafari\b/.test(ua)
              ? "safari"
              : "outro-ios"
        : /\bFirefox\b/.test(ua)
          ? "firefox"
          : /\bChrome\b/.test(ua)
            ? "chrome"
            : /\bSafari\b/.test(ua)
              ? "safari-mac"
              : "outro";
  const l = Math.round(ecra.largura);
  const a = Math.round(ecra.altura);
  return {
    ios: ios ? `${ios[1]}.${ios[2]}` : null,
    nav,
    movel: !!ios || /\bMobile\b|\bAndroid\b/.test(ua),
    ecra: `${l}x${a}@${Math.round(ecra.densidade * 10) / 10}`,
    alto: a > l,
    ligacao: ligacao && /^[a-z0-9-]{1,8}$/.test(ligacao) ? ligacao : null,
  };
}

/** Um acontecimento do motor ou do vídeo: quando (ms desde a abertura), o quê, que take. */
export interface Acontecimento {
  t: number;
  k: string;
  v?: number;
}

/** O estado do vídeo à vista no instante em que parou. */
export interface EstadoDoVideo {
  take: number;
  ct: number;
  dur: number | null;
  rs: number;
  ns: number;
  paused: boolean;
  ended: boolean;
  fonte: "blob" | "rede" | "source" | "nenhuma";
  formato: string | null;
  leve: boolean;
  aPassar: boolean;
  /** Segundos já descarregados à frente do tempo actual. */
  aFrente: number;
}

export interface Paragem {
  inicio: number;
  /** `null` enquanto não voltou a andar. */
  ms: number | null;
  estado: EstadoDoVideo;
  antes: Acontecimento[];
}

export interface CorpoDoDiagnostico {
  v: 1;
  sessao: string;
  motivo: "paragem" | "saida";
  aparelho: Aparelho;
  /** Há quanto tempo (ms) a página abriu. */
  desde: number;
  paragens: Paragem[];
  contadores: Record<string, number>;
  qualidade: { perdidos: number; total: number } | null;
}

/** O formato pelo endereço do vídeo («…-hevc.mp4» → hevc). */
export function formatoDoSrc(src: string): string | null {
  if (!src) return null;
  if (src.startsWith("blob:")) return "blob";
  const m = /-(hevc|av1)\.mp4(?:$|\?)|\.(mp4|webm)(?:$|\?)/.exec(src);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

const arred = (n: number, casas = 2) =>
  Number.isFinite(n) ? Math.round(n * 10 ** casas) / 10 ** casas : 0;

export interface OpcoesDoRegisto {
  agora: () => number;
  enviar: (corpo: string) => void;
  /** Agenda uma chamada (o `setTimeout` do motor, que se limpa com ele). */
  depois: (ms: number, fn: () => void) => void;
  aparelho: Aparelho;
  sessao: string;
  /** O browser tem `requestVideoFrameCallback` (paragens mais finas). */
  fotogramasFinos: boolean;
}

/**
 * O registo de uma página. O motor diz-lhe os acontecimentos, cada fotograma
 * pintado do vídeo à vista, e chama `verificar` de vez em quando com o estado.
 */
export class RegistoDoVideo {
  private readonly o: OpcoesDoRegisto;
  private readonly t0: number;
  private readonly acontecimentos: Acontecimento[] = [];
  private readonly paragens: Paragem[] = [];
  private readonly contadores: Record<string, number> = {};
  private qualidade: { perdidos: number; total: number } | null = null;
  private ultimoFotograma = 0;
  private aberta: Paragem | null = null;
  private envios = 0;
  private envioMarcado = false;

  constructor(o: OpcoesDoRegisto) {
    this.o = o;
    this.t0 = o.agora();
  }

  private rel(): number {
    return Math.round(this.o.agora() - this.t0);
  }

  get limite(): number {
    return this.o.fotogramasFinos ? PARAGEM_MS : PARAGEM_SEM_FOTOGRAMAS_MS;
  }

  /** Um acontecimento (fica só o fim da lista: o que importa é o que veio antes). */
  acontecimento(nome: string, v?: number) {
    const k = nomeQueARotaAceita(nome);
    this.acontecimentos.push(v === undefined ? { t: this.rel(), k } : { t: this.rel(), k, v });
    if (this.acontecimentos.length > 40)
      this.acontecimentos.splice(0, this.acontecimentos.length - 40);
    this.contar(k);
  }

  contar(nome: string) {
    const k = nomeQueARotaAceita(nome);
    // A rota recusa mais do que `MAX_CONTADORES` nomes: um nome novo a mais
    // fica de fora, em vez de deitar fora o envio inteiro.
    if (!(k in this.contadores) && Object.keys(this.contadores).length >= MAX_CONTADORES) return;
    this.contadores[k] = (this.contadores[k] ?? 0) + 1;
  }

  /** Foi pintado um fotograma novo do vídeo à vista. Fecha a paragem aberta, se havia. */
  fotograma() {
    const agora = this.o.agora();
    if (this.aberta) {
      this.aberta.ms = Math.round(agora - this.t0 - this.aberta.inicio);
      this.aberta = null;
      this.marcarEnvio();
    }
    this.ultimoFotograma = agora;
  }

  /**
   * Deixou de contar (separador escondido, fora do ecrã, à espera de um toque,
   * nada à vista): o relógio recomeça, para isso não passar por paragem.
   */
  pausa() {
    this.ultimoFotograma = 0;
    if (this.aberta) {
      this.aberta.ms = Math.round(this.o.agora() - this.t0 - this.aberta.inicio);
      this.aberta = null;
    }
  }

  /**
   * Chamado de vez em quando (o motor: de 250 em 250 ms). `ativo` diz se o
   * vídeo devia estar a andar; `estado` só se lê quando abre uma paragem.
   */
  verificar(ativo: boolean, estado: () => EstadoDoVideo | null) {
    if (!ativo) {
      this.pausa();
      return;
    }
    const agora = this.o.agora();
    if (!this.ultimoFotograma) {
      this.ultimoFotograma = agora;
      return;
    }
    if (this.aberta || agora - this.ultimoFotograma <= this.limite) return;
    const e = estado();
    if (!e) return;
    this.aberta = {
      inicio: Math.round(this.ultimoFotograma - this.t0),
      ms: null,
      estado: {
        ...e,
        ct: arred(e.ct),
        dur: e.dur === null || !Number.isFinite(e.dur) ? null : arred(e.dur),
        aFrente: arred(e.aFrente),
      },
      antes: this.acontecimentos.slice(-ACONTECIMENTOS_ANTES),
    };
    this.paragens.push(this.aberta);
    if (this.paragens.length > MAX_PARAGENS)
      this.paragens.splice(0, this.paragens.length - MAX_PARAGENS);
    this.contar("paragem");
  }

  /** Os fotogramas perdidos e totais do browser (`getVideoPlaybackQuality`). */
  medirQualidade(perdidos: number, total: number) {
    this.qualidade = {
      perdidos: Math.max(0, Math.round(perdidos)),
      total: Math.max(0, Math.round(total)),
    };
  }

  /**
   * O corpo a enviar. Cabe sempre em `CORPO_MAX_BYTES`: se não couber, saem as
   * paragens mais antigas (a rota deita fora, calada, um corpo maior do que
   * 8 KB — e eram justamente as visitas com mais paragens que se perdiam).
   */
  corpo(motivo: CorpoDoDiagnostico["motivo"]): CorpoDoDiagnostico {
    const c = this.corpoInteiro(motivo);
    while (c.paragens.length && JSON.stringify(c).length > CORPO_MAX_BYTES) c.paragens.shift();
    return c;
  }

  private corpoInteiro(motivo: CorpoDoDiagnostico["motivo"]): CorpoDoDiagnostico {
    return {
      v: 1,
      sessao: this.o.sessao,
      motivo,
      aparelho: this.o.aparelho,
      desde: this.rel(),
      paragens: this.paragens.map((p) => ({ ...p, antes: [...p.antes] })),
      contadores: { ...this.contadores },
      qualidade: this.qualidade,
    };
  }

  private marcarEnvio() {
    if (this.envioMarcado) return;
    this.envioMarcado = true;
    this.o.depois(ENVIO_DEPOIS_MS, () => {
      this.envioMarcado = false;
      this.enviar("paragem");
    });
  }

  /** Envia o estado inteiro desta página (cada envio substitui o anterior no servidor). */
  enviar(motivo: CorpoDoDiagnostico["motivo"]) {
    if (this.envios >= MAX_ENVIOS) return;
    this.envios++;
    this.o.enviar(JSON.stringify(this.corpo(motivo)));
  }
}

/** Uma sessão ao acaso, só para juntar os envios da mesma página. */
export function novaSessao(sorteio: () => number = Math.random): string {
  let s = "";
  while (s.length < 12) s += Math.floor(sorteio() * 36).toString(36);
  return s.slice(0, 12);
}
