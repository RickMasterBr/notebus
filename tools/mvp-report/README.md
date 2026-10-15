# @notebus/mvp-report

Ferramenta CLI para geração do relatório dos critérios 2 e 4 de saída do MVP do NoteBus (E-09 §3.8 e §4, D-117), operando sobre o arquivo de backup exportado pelo app.

## Uso

```bash
npm --workspace=@notebus/mvp-report start -- <arquivo-de-backup.json> [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--json <saida.json>]
```

### Argumentos e opções

- `<arquivo-de-backup.json>`: Caminho para o arquivo JSON de backup do NoteBus. A ferramenta valida o checksum e a versão do formato.
- `--from AAAA-MM-DD`: Data inicial (inclusive, dia local de Lisboa).
- `--to AAAA-MM-DD`: Data final (inclusive, dia local de Lisboa).
- `--json <saida.json>`: Caminho opcional para gravação do resultado estruturado em formato JSON.

Se `--from` e `--to` forem omitidos, a ferramenta restringe a análise aos últimos 14 dias com registro ao vivo encontrados no backup.
