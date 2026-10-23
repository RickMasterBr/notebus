import { readFileSync } from 'node:fs';

// Le JSON em UTF-8 tirando um BOM inicial (o Out-File do PowerShell 5 grava BOM).
export const lerJson = (caminho) => JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
