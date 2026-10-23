# Um cabecalho por caso (o teste separa os blocos)

## verificacao G99

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": [
    {
      "verificacao": "G99",
      "caminho": "a",
      "motivo": "m"
    }
  ]
}
```

## caminho vazio

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": [
    {
      "verificacao": "G06",
      "caminho": "",
      "motivo": "m"
    }
  ]
}
```

## motivo ausente

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": [
    {
      "verificacao": "G06",
      "caminho": "a"
    }
  ]
}
```

## campo extra

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": [
    {
      "verificacao": "G06",
      "caminho": "a",
      "motivo": "m",
      "extra": 1
    }
  ]
}
```

## item que nao e objeto

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": [
    "G06"
  ]
}
```

## nao e lista

```json contrato
{
  "id": "exemplo",
  "modo": "agente normal",
  "executor": {
    "harness": "claude",
    "modelo": "sonnet"
  },
  "base": {
    "branch": "infra/m2",
    "commit": "8690626"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um"
  ],
  "excecoes_gate": {
    "verificacao": "G06",
    "caminho": "a",
    "motivo": "m"
  }
}
```
