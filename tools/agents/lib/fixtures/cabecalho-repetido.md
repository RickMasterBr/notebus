# Contrato

texto

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
    "commit": "e3be0a8"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools\\agents\\lib\\",
    "tools/agents/validar.mjs"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um",
    "C2 dois"
  ]
}
```

fim

# Contrato

texto

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
    "commit": "e3be0a8"
  },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools\\agents\\lib\\",
    "tools/agents/validar.mjs"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 30,
    "minutos": 25
  },
  "criterios": [
    "C1 um",
    "C2 dois"
  ]
}
```

fim
