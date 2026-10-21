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
    "apps/mobile/",
    "a.txt"
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
  ],
  "arquivos_de_outro_worker": [
    "apps/mobile/src/x.ts",
    "a.txt"
  ]
}
```

fim
