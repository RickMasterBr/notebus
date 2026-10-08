---
name: teamwork-prompt
description: Escreve o prompt de um projeto Teamwork do NoteBus com escopo, time e orçamento fechados. Use antes de iniciar qualquer /teamwork, ou quando o prompt do Teamwork estiver sendo redigido para aprovação.
---

# Teamwork do NoteBus: como escrever o prompt

Teamwork custa caro (uma auditoria com 8 agentes gastou cerca de 30% do limite de 5 horas). O prompt é a principal forma de controlar esse custo.

## Passo 1: isto é mesmo Teamwork?

Leia `docs/ai/modos-de-execucao.md`. Se a tarefa for pequena ou for um bug de causa desconhecida em poucos arquivos, não escreva o prompt: diga ao Rick qual modo serve (agente normal ou /boost) e por quê. Só continue se ele confirmar o Teamwork.

## Passo 2: preencha o modelo

Use o modelo de `docs/ai/modos-de-execucao.md`. Regras para cada campo:

- Objetivo: uma frase, com resultado que dá para verificar. Se precisar de duas frases, são dois projetos.
- Dentro do escopo: arquivos e pastas por nome. Nunca "o app" ou "o repositório".
- Fora do escopo: diga o que não ler e não propor. Se o Rick pediu só o diagnóstico, escreva "sem patches".
- Entregável: um relatório final. Não peça handoffs consolidados duas vezes.
- Time: o menor possível. Sem camada de PO. Um Explorer por frente que não edita os mesmos arquivos que outra.
- Verificação: no máximo um revisor independente (agente `qa`). A suíte completa roda uma vez, por quem fecha o gate.
- Critério de parada e orçamento: escreva o percentual do limite em que a equipe para e pergunta.

## Passo 3: confira as regras do projeto no prompt

O prompt deve mandar ler `AGENTS.md` e `docs/ai/mapa-para-agentes.md`, e repetir só o que a tarefa pode violar: teste existente não se reescreve nem se afrouxa, `packages/domain` não se altera sem teste novo, nenhum componente visual sem especificação.

## Passo 4: mostre ao Rick

Apresente o prompt e diga o modo, o tamanho do time e o orçamento. Só delegue depois do ok. Ao terminar a rodada, registre modo, agentes, % do limite e retorno em `docs/fase-6/custos.md`.

## Agentes disponíveis

`database` (banco local), `performance` (tempo e algoritmos), `qa` (revisão independente). Todos só leitura. Não crie outros sem a tarefa exigir.
