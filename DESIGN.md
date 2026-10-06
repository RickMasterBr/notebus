# DESIGN.md · regras de tela do NoteBus

Leia antes de mexer em qualquer tela, folha ou texto. Cada regra diz **o que fazer**, **por que** (o defeito que já aconteceu) e **de onde veio** (decisão D-xxx, documento ou teste de guarda).

- Aparência não se inventa. A fonte é `docs/ux/4.3` a `4.6` (repositório privado). Sem especificação, **pare e pergunte** (`docs/fase-6/CLAUDE.md`, regra 3).
- Se uma regra daqui contradisser o plano ou uma decisão aprovada, **pare e pergunte**. Este arquivo resume; não decide.
- Quem prova o quê: teste automático prova lógica e varredura de código. **Rolagem, teclado, gesto, animação e VoiceOver só o iPhone prova** (marque `[hipótese, só o aparelho decide]`).
- Nada da MOBILIS neste repositório (D-091). Exemplo de teste é inventado.

## 1. Tokens (`apps/mobile/src/theme/tokens.ts`)

Use sempre o token. Valor solto (`#fff`, `13`, `0.5`) em tela é erro. Os números moram em `tokens.ts` e na `4.4`; aqui só o papel.

| Grupo | Tokens | Regra e porquê |
|---|---|---|
| Cor | `bg`, `surface`, `text`, `textSecondary`, `divider`, `accent`, `onAccent`, `fill`, `grab`, `scrim`, `highlight`, `toast*`, `trip*` | Pegue a cor de `useTheme().colors` (o tema claro ou escuro vem do sistema). Origem: D-037, D-128, D-148 |
| Estado | `danger`, `warning`, `switchTrackOff` | `danger` e `warning` só como **texto com ícone**, nunca preenchendo bloco. Não existe `success` (a cor era igual à da L5). Origem: D-041, D-067; `tokens.test.ts` |
| Linhas | `lineColors`, `lineOutline` | Mesma cor nos dois temas. O **número vem sempre junto da cor** e o selo **nunca** recebe opacidade reduzida (fica abaixo do AA). No escuro, contraste < 3:1 ganha contorno. Origem: D-036, D-046, D-051 |
| Texto | `type.*` | Fonte do sistema, escala com Dynamic Type. Horário usa `timeLg` ou `timeMd` (números tabulares). Não reduza fonte para caber: empilhe acima de `.xxLarge`. Origem: D-035, D-048 |
| Espaço | `space.xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32 | Escala de 4. `md` é a margem do conteúdo da folha; `lg` separa seções. Origem: D-038 |
| Raio | `radius.sm` a `full` | `sm` selo e chip; `md` cartão; `lg` topo da folha; `full` pílula e botão flutuante. Origem: D-038 |
| Sombra | `elevation.sheet < card < toast` | Só a ordem é regra. Origem: D-038 |
| Movimento | `motion.fast` 150, `normal` 250 | Com **Reduzir movimento** ligado, sem animação (use `useReduceMotion`). Origem: D-038, `AGENTS.md` |
| Esmaecido | `opacity.muted` | Só em texto de apoio (ex.: mensagem da Busca vazia). Nunca no selo de linha. Origem: D-140, D-051 |
| Toque | `minTouch` 44 | **Todo** alvo de toque tem pelo menos 44 pt de altura e largura, inclusive o que parece "só um texto" (o "Trocar" da E-03 só respondia no texto). Origem: 4.4 §5.12, E-03 F6 |

Se faltar um token, **não invente o valor**: pare e pergunte (vira questão Q-xx).

## 2. Folhas (bottom sheets)

Vale para toda folha, do `HomeSheet` ao `OptionSheet`. É a regra que mais custou: a rolagem das folhas tomou cerca de 20 tentativas na E-02 e **voltou** na E-04 porque um agente copiou o quadro errado.

| Regra | Porquê | Origem |
|---|---|---|
| **Quadro D-150 para qualquer folha com lista rolável.** A lista fica numa `View` de **altura fixa** (altura da folha aberta menos o **handle medido** por `detentMetrics`, `sheets/scrollInset.ts`), com `overflow: hidden`. Folha com vários detents ganha no fim da lista o `HiddenBelowSpacer`, medido por `animatedPosition`. Folha de um detent só (a TL-05, D-152) não leva espaçador | A biblioteca dá à área de rolagem a altura do detent **mais alto**; nos menores a lista rola até o fim da área e não até o fim do que se vê | D-150, D-152; `fase-6/E-02-registro-rolagem-gavetas.md` |
| **Proibido:** `tall`, `BottomSheetScrollView` ou `BottomSheetView` como casca da lista, ligar a altura ao `onChange`, remontar o `ScrollView` por `key` ou timer, painel de diagnóstico dentro do layout | Cada um deles causou faixa cinza, volta ao topo, corte da última linha ou a folha fechando ao rolar | D-150; E-04 rodada 1 (`RecordSheet`) |
| Ao criar folha com rolagem, **copie a `VerifySheet`** (ou a `RecordsSheet`, para lista virtualizada) e adapte. Não copie o quadro da Busca | O agente que copiou o quadro `tall` da Busca repetiu o bug | E-04 bloco 2d |
| Altura de folha e handle vêm de `scrollInset.ts` e dos `DETENTS` da própria folha. **Constante nova de altura não entra** | Número solto some quando o aparelho muda | `AGENTS.md`, skill `diagnostico-rolagem-bottom-sheet` |
| Folha coberta por outra recebe `pointerEvents="none"` (já no `SheetHost`) | A folha de baixo interceptava o gesto vertical | D-152 |
| `<BottomSheet>` leva `accessible={false}`, `accessibilityRole={null}` e `accessibilityLabel={null}` | O padrão da biblioteca faz o VoiceOver ler a gaveta inteira como **um botão ajustável** e esconde "Registrar" e os campos | Q-96, J6; `sheets/bottomSheetAccessible.test.ts` |
| O **handle** da folha com vários detents é um controle ajustável (rótulo `sheet.handle.a11y`, valor `sheet.detent.*`) com ações de expandir e recolher | VoiceOver precisa mudar o detent sem arrastar | D-129 (a ação de expandir ainda falha: bug 9, E-09) |
| **Um só ✕ por folha.** O ✕ padrão fica no canto direito do handle, alvo de 44 pt, rótulo `common.close`. Quem desenha o ✕ no próprio cabeçalho tem de usar `hideCloseButton` no `SheetHandle` | Três folhas (TL-06, TL-09, TL-04) saíram com dois ✕ | D-135, D-129; `sheets/singleCloseButton.test.ts` |
| Exceção que existe: a `RecordSheet` usa o ✕ do cabeçalho com `hideCloseButton` | O Rick escolheu o ✕ com círculo na rodada 2 da E-04. **Não há D-xxx** para essa posição: confirme antes de copiar para outra folha | E-04 bloco 2e |
| Campo de texto numa folha sobe acima do teclado (`paddingBottom` e `scrollToEnd` após o foco) | O teclado cobria a "Nota" | E-04 bloco 2e `[hipótese, só o aparelho decide]` |
| Folha empilhada escurece a de baixo com `scrim` (28% no claro, 50% no escuro). O fundo do Início no médio e no grande é transparente, não reage a toque e não dá háptico | Tocar fora não pode fechar nem repassar o toque à folha de baixo | D-043, D-145 |

## 3. Textos

| Regra | Porquê | Origem |
|---|---|---|
| **Todo texto de tela vem do catálogo `i18n/pt-BR.ts` via `t("chave")`.** Nada de texto solto no componente, inclusive "Linha 1", "Hoje", cabeçalho de dia | Texto solto escapa da aprovação e da futura tradução | RNF-06, 4.6 §2; E-05 bloco 2 (textos fixos) |
| **Sem literal em `accessibilityLabel` nem `accessibilityHint`**, nem template com texto fixo (`` `Linha ${n}` ``). Use `t()` | O VoiceOver lia texto que o catálogo não controlava | `ui/noLiteralA11y.test.ts` (E-05 fechamento b) |
| **Nenhuma mensagem repete o mesmo `{{nome}}`.** Quando precisar de dois valores do mesmo tipo, dê nomes diferentes (`{{leave}}` e `{{arrive}}`) | Duas partes diferentes da frase mostravam o mesmo horário (prévia da opção e frase do trajeto) | `i18n/noDuplicateInterpolation.test.ts` (E-05 fechamento c) |
| **Texto novo leva `// provisório`** no fim da linha da chave, e o relatório lista todos para o Rick aprovar | Texto não aprovado precisa ser achável | Q-88, Q-91 |
| Chave: `tela.elemento[.variante]`, minúscula. **Procure no catálogo antes de criar** (já existem duas chaves para "Linha {{n}}") | Duplicata diverge com o tempo | 4.6 §2 |
| **Sem preposição junto de nome de lugar** (`{{place}}`): escreva "{{origin}} → {{destination}}", "até aqui", nunca "da {{place}}" | O usuário dá nomes livres; o gênero quebra ("do Campus", "da Academia") | 4.6 §3.11 |
| Hora `HH:MM`; estimativa `~HH:MM` **sempre com o selo de confiança**; faixa `HH:MM–HH:MM` (traço longo); pior caso "até HH:MM"; duração "N min" | Formato único em todas as telas | 4.6 §4, D-040 |
| **Sem emoji nem caractere que o iOS desenhe como emoji** (`ℹ ✓ ✔ ⚠ ❗`, nem o seletor `U+FE0F`). Ícone se desenha em `ui/Glyphs.tsx` (`InfoGlyph`, `CheckGlyph`, `CrossGlyph`) | O `ℹ` apareceu como emoji colorido no iPhone | D-171; `ui/noEmojiGlyph.test.ts` |

## 4. Comportamento

| Regra | Porquê | Origem |
|---|---|---|
| **Todo botão tem `onPress` e rótulo.** Botão sem ação é pior que botão ausente; grupo ou destino que ainda não existe **não aparece** | "Cadastrar meu ponto" não fazia nada ao tocar | `screens/emptyHomePressable.test.ts` (só `EmptyHome.tsx`); 4.6 §3.12 |
| **A hora vem do relógio do app** (`data/clock.ts`, via `NowProvider`). Ninguém chama `new Date()` nem `Date.now()` fora dele | O relógio de teste precisa valer para o app inteiro | D-095; `data/noDirectClock.test.ts` |
| **Apagar:** arrastar a linha revela "Apagar" (um só aberto por vez), toast com **Desfazer**. Nunca diálogo "tem certeza?" | Princípio de não interromper | D-052, `swipeCoordinator` |
| **Confirmar é toast**, nunca tela: até 2 ações, 5 s (8 s com VoiceOver), erro não some sozinho, sempre **acima do teclado**. Toque de sucesso com haptic | O toast ficava escondido sob o teclado | D-039, D-043, D-044; E-03 F4 |
| **Carregando é esqueleto**, só se a espera passar de 200 ms e por no mínimo 400 ms. Nunca indicador giratório | Dado local chega em milissegundos; piscar é pior | D-127 |
| Erro de formulário: mensagem em `type.caption` embaixo do campo, borda `danger`. Switch é configuração persistente; botão-alternância é ação com toast | Dois padrões, dois propósitos | D-053, D-055 |
| Destino é o atalho: tocar em **Facul** abre "Ir para Facul". Origem da tela de destino: última escolhida; senão **Casa**; senão o primeiro trajeto | Foi a maior fonte de confusão do Rick | D-175 |
| Acessibilidade: selo de linha lê "Linha N" (`common.line.a11y`); cada parada da linha do tempo é **um** elemento | O VoiceOver lia número e destino soltos | D-046, D-047 |

## 5. Vocabulário da tela (para checklists e relatórios)

**Checklist do Rick usa o nome que aparece na tela.** Nunca `TL-04`, "editor de opção" ou "folha Lugares" sem dizer onde fica. Cada passo diz **onde estar, o que fazer e o que deve acontecer**. Ordene os passos para ele **reinstalar o app uma vez só** e **não omita passo-chave** ("desinstale o app antes de importar").

| Nome na tela | Onde fica | Código interno (só para agente, nunca no checklist) |
|---|---|---|
| **Início** | Tela principal: pílula de busca, faixa de atalhos (Casa, Facul, Academia, "+"), "Perto de você", botão Registrar | TL-01 |
| **Ponto** | Abre ao tocar num cartão de ponto ou resultado da Busca; tem chips de tipo de dia e a lista de horários | TL-02 |
| **Registrar embarque** | Abre pelo botão **Registrar** ou "Registrar aqui" | TL-03 |
| **Ir para Facul** (e demais destinos) | Abre ao tocar num atalho; cartões "sair às". Trajetos ficam sob o **destino** | TL-04 |
| **Daqui para a frente** | Abre ao tocar numa linha do Ponto ou no cartão "Em viagem" | TL-05 |
| **Registro** | Edição de um registro: hora, linha, ponto, Nota, "Apagar registro" | TL-06 |
| **Registros** | Lista de todos os registros; deslizar revela **Apagar** | TL-08 |
| **Conferir registro** | "Qual foi?", **Corrigir a hora**, **Não sei** | TL-09 |
| **Lugares e trajetos** | Em **Ajustes**: reordenar, criar e apagar lugares, criar e editar trajetos e opções | TL-10 |
| **Ajustes** | Engrenagem do Início: Versão, Exportar, Importar, Último backup | TL-12 |
| **Como você quer começar?** | Primeiro uso: **Importar MOBILIS Leiria** ou **Começar do zero** | TL-13 |
| **Busca** | Abre ao tocar na pílula; "Recentes", "Pontos" | TL-14 |

Botões que o Rick vê: **Registrar**, **Desci aqui**, **Dispensar**, **Trocar**, **Fechar**, **Desfazer**, **Ajustar**, **Tentar de novo**, **Apagar**, **Cadastrar meu ponto**, **Usar minha localização agora**, **Adicionar opção**, **Novo lugar**, **Novo trajeto até aqui**, **Todos os registros**, **Exportar**, **Importar**.

Mensagens que o Rick vê (confira o texto exato no catálogo antes de escrever o passo): "Embarque registrado", "Registro alterado", "Voltou para conferir", "Fica para depois", "Recentes limpos", "Sem viagem hoje por esta opção".

## 6. Quem vigia cada regra

| Teste de guarda | O que pega | O que **não** pega |
|---|---|---|
| `ui/noEmojiGlyph.test.ts` | 5 caracteres e `U+FE0F` nos `.tsx` de `sheets/` e `ui/` | `screens/`, o catálogo `pt-BR.ts`, outros emojis |
| `sheets/bottomSheetAccessible.test.ts` | `accessible={false}` em `StackedSheet` e `HomeSheet` | Qualquer outro arquivo com `<BottomSheet>` |
| `sheets/singleCloseButton.test.ts` | `SheetHandle` com ✕ somado a `<CrossGlyph` própria, em `sheets/` | O ✕ padrão do `StackedSheet`; folhas fora de `sheets/` |
| `ui/noLiteralA11y.test.ts` | `accessibilityLabel` e `Hint` com literal ou template fixo | Outras props de texto; texto direto dentro de `<Text>` |
| `i18n/noDuplicateInterpolation.test.ts` | `{{nome}}` repetido em chave de uma linha | Linha com comentário no fim, como as marcadas `// provisório` (21 de 375 hoje); valor em várias linhas |
| `screens/emptyHomePressable.test.ts` | `Pressable` com `role="button"` sem `onPress` | Qualquer arquivo além de `EmptyHome.tsx` |
| `data/noDirectClock.test.ts` | `new Date()` e `Date.now()` fora de `clock.ts` | Formatadores que leem "agora" sem argumento |
| `theme/tokens.test.ts` | Chaves iguais nos dois temas e valores revisados | `type`, `space`, `radius`, `minTouch`, `opacity` |

A lista completa de defeitos e das lacunas sem guarda está em `docs/fase-6/regressoes.md` (privado).
