# Medições — a proposta online com o movimento de estúdio (31/10/2026)

**Como se mediu.** Uma proposta inventada («Ana & Rui»), montada com o mesmo componente da proposta verdadeira (`PropostaWeb`). Usa as fotografias AVIF que já estão no sítio público. A página que a monta existiu só nesta máquina e não está no git: as propostas verdadeiras não se abrem.

Lighthouse 12.8.2, telemóvel, rede e CPU travados a sério (`--throttling-method=devtools`: 4G lento, CPU ÷4). 3 corridas, mediana.

| | Desempenho | Acessibilidade | LCP (s) | Speed Index (s) | TBT (s) | CLS | Peso (MB) |
|---|---|---|---|---|---|---|---|
| antes (sem o movimento novo) | 98 | 100 | 1,1 | 3,6 | 0,08 | 0,046 | 1,0 |
| depois | **95** | **100** | 1,0 | 3,6 | 0,20 | 0,046 | 1,0 |

O SEO dá 69 nas duas medições: a página tem `noindex` de propósito, porque é privada. O CLS de 0,046 já existia, e o novo movimento não lhe mexe.

**O que custa os três pontos.**
- O primeiro título da proposta fica a um ecrã da capa. Por isso o GSAP (30 kB comprimidos) descarrega-se logo depois do `load`, e é avaliado dentro da janela que o Lighthouse conta.
- Numa primeira versão eram 93: o pacote levava o ScrollTrigger, e passou de 47 para 30 kB quando ele saiu.
- O casal não sente isto no arranque, porque a capa e o primeiro ecrã já estão desenhados.

**O que não se mediu aqui.**
- O scroll suave só existe com rato e não entra no telemóvel do Lighthouse.
- O tempo em produção, com uma proposta verdadeira: não verificado. Não se abrem propostas de clientes.
