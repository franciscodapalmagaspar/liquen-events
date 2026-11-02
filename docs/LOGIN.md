# Reconstruir o ecrã de início de sessão da Líquen segundo o sistema da Apple

> **Âmbito:** só a rota `/orcamento/admin/login` (e as variantes de recuperação).
> **Pré-requisito:** os tokens do `docs/DESIGN-SYSTEM.md`.
> **Marcações:** **[APPLE]** = regra publicada pela Apple · **[CALC]** =
> calculado · o resto é tradução para web.

---

## O QUE JÁ ESTÁ FEITO

Registado aqui para o próximo leitor não refazer nem duvidar.

| # | Correção | Estado |
|---|---|---|
| 1 | Dois botões primários a competir | **feito** — a palavra-passe é um link |
| 2 | Falta divulgação progressiva | **feito** — dois estados, com animação de altura |
| 3 | Separadores dentro do painel | **parcial** — o «ou» saiu; falta tirar o de baixo |
| 9 | Asteriscos vermelhos | **feito** — e o botão desactiva-se com `title` |
| 10 | Pontinhos como placeholder | **feito** |
| 11 | A seta «→» no botão | **feito** |
| 17 | «Área Restrita» em caixa de título | **feito** |
| 18 | «Escolhe como queres entrar» | **feito** |
| 20 | Aviso de Caps Lock | **já existia** |
| 21 | Interface condicional de chaves de acesso | **já existia** |
| — | Microcópia da Parte 9 | **feito** |
| 4 | O cartão a vidro sobre a fotografia | **decidido de outra maneira** (reauditado a 1/11) — as duas hipóteses foram desenhadas e medidas: a fotografia ocupa METADE do ecrã (`EntradaComFotografia.tsx`), com o formulário no seu chão claro. Com o cartão a flutuar sobre a fotografia inteira, o véu para o texto branco chegar aos 4,5:1 teria de cobrir o ecrã todo (57–70 % de preto) — a «mancha morta» de que ela falou. O porquê está no cabeçalho desse ficheiro |
| 5, 6 | Logótipo monocromático a 28 px | **não se faz — ela pediu o contrário**: olhou para a marca neste ecrã e disse «tem que ficar maior» (`h-32`, ver o comentário no `AdminLogin.tsx`). A cor fica |
| 7 | A saudação | **feito** (reauditado a 1/11) — «Bom dia / Boa tarde / Boa noite» contados em Lisboa (`useSaudacao`, sem erro de hidratação), na faixa de baixo da fotografia |
| 8 | O véu sob o texto da fotografia | **feito** (reauditado a 1/11) — `VEU_DO_TEXTO`, gradiente de 82 % a 0; o pior contraste medido é 10,88:1 |
| 19 | O botão do olho | **feito** (reauditado a 1/11) — 40×40 (44 no dedo), `aria-label` que muda com o estado e `aria-pressed` |

Por fazer (reauditado a 1/11): **3** (falta tirar o segundo separador), **12**
a **16**, **22**. Os 4, 5, 6, 7, 8 e 19 estão na tabela acima — feitos, ou
decididos de outra maneira, com o porquê.

---

## PARTE 1 — AUDITORIA

### Estruturais

**1. Dois botões primários a competir.** «Entrar com este dispositivo»
(preenchido) e «Entrar com palavra-passe →» (contornado) tinham a **mesma
largura e a mesma altura**. Lêem-se como duas acções de igual peso.
*Distinguir a opção preferida por **estilo**, nunca por tamanho; máximo 1–2
botões proeminentes por vista.* **[APPLE]**
Correção: o caminho da palavra-passe passa a **link de texto** enquanto o
formulário estiver escondido; escolhido, ganha o botão e o do dispositivo recua
para link.

**2. Falta divulgação progressiva.** O formulário estava sempre visível, mesmo
para quem ia usar a chave de acesso — e era isso que obrigava ao «ou».
*Esconder detalhes até serem relevantes.* **[APPLE, Disclosure controls]**
Correção: **dois estados**. A (por omissão): chave de acesso + link. B:
formulário, com a chave recuada a link. A transição é altura animada, não um
salto.

**3. Dois separadores dentro do mesmo cartão** — o «ou» e o que precede
«Mudaste de telemóvel ou de computador?». *Um cartão com cinco grupos separados
por linhas não tem hierarquia, tem fatias.* **[APPLE, Layout]**
Correção: o «ou» desaparece com a divulgação progressiva; o segundo desaparece
porque **«Mudei de aparelho» sai do cartão** para junto do rodapé.

**4. O cartão é invisível** — branco sobre branco, com um traço de 1 px. Em
modo claro a elevação faz-se por **sombra**. **[APPLE, Dark Mode]** Correção:
o cartão passa a **painel de vidro sobre a fotografia**, com sombra real. É o
único ecrã do produto com conteúdo media-rich por baixo, portanto o único onde
o vidro se justifica pela regra da Apple.

**5. Duas cores de marca no mesmo ecrã** — logótipo dourado, botão sálvia.
*Escolher **uma** cor de acento; a marca defere ao conteúdo.* **[APPLE]**
Correção: **logótipo monocromático**.

**6. Logótipo repetido e sobredimensionado.** *Resistir a repetir o logótipo;
espaço gasto só a exibir um activo de marca é espaço roubado ao conteúdo.*
**[APPLE]** Correção: fica, porque é a porta de entrada — mas a 28 px e
monocromático.

**7. A saudação está no sítio errado** — no canto inferior esquerdo, por baixo
de tudo. Correção: sobe para o terço inferior com scrim próprio, em
`text-title1`, com a assinatura em `text-body` a 80%. Alterna **Bom dia**
(5–12) · **Boa tarde** (12–20) · **Boa noite** (20–5), calculada no servidor.

**8. O texto sobre a fotografia não tem protecção garantida** — o branco é
legível porque calhou. Correção: gradiente obrigatório,
`rgb(0 0 0 / .62) → transparent` a 45% da altura. O contraste passa a ser
propriedade do layout, não da fotografia. **[APPLE, Images]**

### De execução

**9. Asteriscos que não informam nada.** Ambos os campos são obrigatórios,
portanto o asterisco não distingue coisa nenhuma — e usa cor como único
portador de significado. Correção: fora; o botão fica desactivado até estarem
preenchidos, com `title` a dizer o que falta. **[APPLE]**

**10. A palavra-passe mostra pontinhos como placeholder.** Um campo vazio que
aparenta estar preenchido. Correção: placeholder vazio.

**11. A seta «→» no botão.** Não é convenção da Apple — a convenção são
reticências, e só quando o botão abre outra vista que pede mais input. Aqui não
abre nada. **[APPLE]**

**12. Raios sem relação entre si.** Correção: painel 26 → padding 32 →
controlos a 10 px, rectângulo arredondado. **Nenhuma cápsula neste ecrã.**

**13. Ritmo vertical a olho.** Correção: grelha de 4.

**14. Sem anel de foco visível.** 3 px, `--focus-ring`, `outline-offset: 2px`,
nos dois temas. **[APPLE]**

**15. Sem estados de pressão.** `scale(.97)` a 80 ms na ida, regresso com
`--ease-press`. **[APPLE]**

**16. Sem movimento nenhum.** É o primeiro ecrã que ela vê todos os dias.

**17. «Área Restrita» em capitalização de título.** **[APPLE, Writing]**

**18. «Escolhe como queres entrar.»** Pede uma decisão que ela não quer tomar.

**19. O botão do olho não é um alvo real.** 40×40, `aria-label` que muda de
estado, `aria-pressed`.

**20. Falta o aviso de Caps Lock.** **[EI: convenção macOS]**

**21. Falta a interface condicional de chaves de acesso.**
`autocomplete="username webauthn"` e `mediation: "conditional"`.

**22. Nada responde a `prefers-reduced-motion` nem a
`prefers-reduced-transparency`.**

---

## PARTE 2 — A ESTRUTURA CORRETA

```
ESTADO A — por omissão                    ESTADO B — palavra-passe
┌────────────────────────────┐            ┌────────────────────────────┐
│   [logótipo]               │            │   [logótipo]               │
│   Área restrita            │            │   Área restrita            │
│   Painel de gestão         │            │   Painel de gestão         │
│   Bem-vindo de volta.      │            │   Bem-vindo de volta.      │
│   ┌──────────────────────┐ │            │   Email                    │
│   │ 🔒 Entrar com a      │ │            │   ┌──────────────────────┐ │
│   │    chave de acesso   │ │            │   └──────────────────────┘ │
│   └──────────────────────┘ │            │   Palavra-passe            │
│   Usa o rosto, a impressão │            │   ┌──────────────────┬───┐ │
│   digital ou o PIN.        │            │   └──────────────────┴───┘ │
│                            │  ←clique→  │   ☐ Manter sessão 30 dias  │
│   Entrar com palavra-passe │            │   ┌──────────────────────┐ │
│                            │            │   │ Entrar               │ │
└────────────────────────────┘            │   └──────────────────────┘ │
                                          │   Esqueci-me da…           │
   Mudei de aparelho                      │   Entrar com a chave…      │
   Líquen Events · Portugal               └────────────────────────────┘
```

- **A acção primária muda de estado, o estilo não.** Nunca há dois preenchidos.
- O caminho não escolhido é sempre **link de texto**.
- «Esqueci-me da palavra-passe» só aparece no estado B.
- «Mudei de aparelho» vive **fora do painel**, junto ao rodapé.
- A transição A↔B é `grid-template-rows: 0fr → 1fr` com `--ease-quick` (325 ms).

---

## PARTE 3 — GEOMETRIA

```css
.login {
  --split: 58%;  --panel-w: 400px;  --panel-pad: 32px;  --panel-radius: 26px;
  --control-radius: 10px;  --field-h: 42px;  --button-h: 46px;
  --gap-label: 8px;  --gap-field: 20px;  --gap-group: 28px;  --gap-section: 36px;
}
```

Ritmo do painel: logótipo · **24** · «Área restrita» · **6** · «Painel de
gestão» · **8** · subtítulo · **36** · acção primária · **10** · texto de ajuda
· **28** · link alternativo.

A fotografia ocupa 58% e **o painel flutua sobre ela**, a 8% da margem direita,
centrado na vertical. Abaixo de 1024 px a fotografia passa a fundo de ecrã
inteiro; abaixo de 600 px recolhe para uma faixa de 180 px e o painel fica
opaco.

---

## PARTE 4 — O PAINEL DE VIDRO

Único ecrã que cumpre as três condições da Apple para vidro sobre média.
Variante **regular**, não `clear`: o painel tem muito texto. **[APPLE]**

```css
.login-panel {
  width: var(--panel-w); padding: var(--panel-pad);
  border-radius: var(--panel-radius);
  background: var(--glass-bg);
  backdrop-filter: blur(34px) saturate(180%);
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1.5px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo),
              0 24px 64px rgb(10 16 12 / .34);
  color: var(--glass-fg);
}
@media (prefers-reduced-transparency: reduce) {
  .login-panel { background: var(--bg-surface); backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .login-panel { background: var(--bg-surface); border-color: currentColor; box-shadow: none; }
}
@supports not (backdrop-filter: blur(1px)) {
  .login-panel { background: rgb(255 255 255 / .94); }
}
.login-scrim {
  position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(to top, rgb(0 0 0 / .62) 0%, rgb(0 0 0 / .28) 28%, transparent 45%),
    linear-gradient(to right, transparent 55%, rgb(0 0 0 / .18) 100%);
}
```

---

## PARTE 5 — COMPONENTES

Campo: altura 42, raio 10, `font-size: 15px` (16 em toque, senão o Safari faz
zoom), foco com `box-shadow: 0 0 0 3px var(--focus-ring)`. Rótulo em
`text-footnote/600`, sempre visível. Placeholder só onde comunica FORMATO —
`nome@dominio.pt` no email, **nada** na palavra-passe. **[APPLE]**

Botão primário: altura 46, raio 10 (**não cápsula**), `--accent`, branco por
cima (**6.2:1** **[CALC]**). Nunca `#5F7C66` — dá 4.6:1 e falha.

Link secundário: `text-body`, `--accent`, `text-underline-offset: 3px`, alvo de
40 px.

Botão do olho: 40×40, `aria-label` que alterna, `aria-pressed`, Magic Replace
na barra com `stroke-dashoffset` a 320 ms. **[APPLE]**

---

## PARTE 6 — COREOGRAFIA DE ENTRADA

Três grupos, 40 ms de intervalo. Máximo três elementos.

| Momento | Elemento | Animação |
|---|---|---|
| 0 ms | Fotografia | `opacity 0 → 1`, 400 ms, `--ease-out` |
| 80 ms | Saudação | `translateY(10px) → 0` + fade, 420 ms, `--ease-quick` |
| 120 ms | Painel | `scale(.985) → 1` + `translateY(8px) → 0` + fade, 460 ms |
| 160 ms | Conteúdo | fade, 320 ms, `--ease-out` — **sem** deslocação própria |

O painel **não** usa `--ease-bouncy`: ressalto em elementos grandes lê-se como
erro. A entrada é só no primeiro render — nunca ao alternar entre A e B.

---

## PARTE 7 — ESTADOS

**A entrar.** Spinner de 16 px dentro do botão, rótulo «A entrar…», cliques
bloqueados, campos `readonly` mas visíveis. Acima de **3 s**, «A verificar as
credenciais…».

**Erro.** Nunca em toast. **Inline**, acima do botão, `role="alert"`.
Credenciais erradas → limpa a palavra-passe, **preserva o email**, devolve o
foco à palavra-passe. Chave de acesso cancelada → **nenhum erro**: cancelar não
é falhar.

**Abanão do painel** em falha de autenticação — é o que o macOS faz. 420 ms,
desligado com `prefers-reduced-motion`.

**Sucesso.** Nenhuma confirmação: a navegação é a confirmação. **[APPLE]**

---

## PARTE 8 — CHAVES DE ACESSO

Para quem já tem chave registada, ela deve aparecer sozinha na barra de
preenchimento automático — `autocomplete="username webauthn"` no email e
`navigator.credentials.get({ mediation: "conditional" })` ao montar.

- **Nunca** `mediation: "required"` sem gesto do utilizador.
- Aborta a operação condicional quando o formulário é submetido.
- Chama-lhe **chave de acesso**, não «biometria» nem «WebAuthn».

---

## PARTE 9 — MICROCOPY

| Atual | Novo |
|---|---|
| Área Restrita | Área restrita |
| Bem-vindo de volta. Escolhe como queres entrar. | Bem-vindo de volta. |
| Entrar com este dispositivo | Entrar com a chave de acesso |
| Com o rosto, a impressão digital ou o PIN deste aparelho. | Usa o rosto, a impressão digital ou o PIN deste aparelho. |
| O teu email * | Email |
| Palavra-passe * | Palavra-passe |
| Entrar com palavra-passe → | Entrar *(no botão)* · Entrar com palavra-passe *(no link)* |
| Manter a sessão iniciada 30 dias neste aparelho. | Manter a sessão iniciada neste aparelho durante 30 dias |
| Esqueceste-te da palavra-passe? | Esqueci-me da palavra-passe |
| Mudaste de telemóvel ou de computador? | Mudei de aparelho |

Saudação: **Bom dia** (05:00–11:59) · **Boa tarde** (12:00–19:59) · **Boa
noite** (20:00–04:59), com `Europe/Lisbon`.

---

## PARTE 10 — ACESSIBILIDADE

`<main>` com `aria-labelledby`; fotografia decorativa (`alt=""`); rótulos
visíveis e associados; `aria-invalid` e `role="alert"` no erro; anel de foco de
3 px **visível sobre o vidro** (testar especificamente — é onde falha); ordem de
tabulação email → palavra-passe → olho → checkbox → entrar → links; Enter
submete de qualquer campo; contraste do texto sobre a fotografia medido **na
zona mais clara**, com o scrim aplicado; percurso completo só com teclado; zoom
a 200% sem scroll horizontal.

---

## PARTE 11 — CRITÉRIOS DE ACEITAÇÃO

1. **Exactamente um** botão preenchido em qualquer dos dois estados.
2. Zero separadores horizontais dentro do painel.
3. Nenhuma cápsula; controlos a 10 px, concêntricos com o painel a 26 px.
4. Uma só cor de acento; o logótipo é monocromático.
5. Zero asteriscos.
6. `grep` por hexadecimais e por `px` fora dos tokens devolve zero.
7. Com `prefers-reduced-transparency`, o vidro desaparece e o painel continua legível.
8. Com `prefers-reduced-motion`, não há entrada, nem abanão, nem transição de altura.
9. Com `prefers-contrast: more`, o painel é opaco e as bordas visíveis.
10. Cancelar a folha da chave de acesso não produz erro nenhum.
11. Uma credencial errada preserva o email, limpa a palavra-passe, devolve o foco.
12. O aviso de Caps Lock aparece e desaparece correctamente.
13. Lighthouse de acessibilidade a 100. É um ecrã pequeno; não há desculpa.

---

## PARTE 12 — PROIBIÇÕES

Dois botões de largura total com o mesmo peso · separadores dentro do painel ·
cartão delimitado por borda em vez de sombra · cápsulas · asteriscos de
obrigatório · setas em rótulos de botão · pontinhos como placeholder de
palavra-passe · toast ou alerta para erro de autenticação · confirmação de
sucesso · mensagem de erro ao cancelar a chave de acesso · `mediation:
"required"` sem gesto · texto sobre a fotografia sem scrim · logótipo a duas
cores · animação de entrada repetida ao alternar entre estados · ressalto no
painel · `autofocus` em viewport pequeno · qualquer valor literal fora dos
tokens.
