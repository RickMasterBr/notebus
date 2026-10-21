# Contrato

texto

```json contrato
{
  "modo": "agente normal",
  "executor": {
    "harness": "vim",
    "modelo": "x"
  },
  "base": {
    "branch": "b",
    "commit": "xyz"
  },
  "pista": "Maiuscula",
  "arquivos_permitidos": [
    "tools\\agents\\lib\\",
    "tools/agents/validar.mjs"
  ],
  "comandos_validacao": [
    "node --test"
  ],
  "limites": {
    "turnos": 0,
    "minutos": 25
  },
  "criterios": [],
  "harness": 1,
  "extra": 1
}
```

fim
