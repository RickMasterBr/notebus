# Contrato com excecoes

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
      "caminho": "apps/mobile/src/",
      "motivo": "pasta liberada"
    },
    {
      "verificacao": "G07",
      "caminho": "package.json",
      "motivo": "arquivo exato"
    },
    {
      "verificacao": "G08",
      "caminho": "tsconfig.json",
      "motivo": "arquivo exato"
    },
    {
      "verificacao": "G14",
      "caminho": "README.md",
      "motivo": "arquivo exato"
    }
  ]
}
```

fim
