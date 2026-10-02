/**
 * Catálogo pt-BR (RNF-06): texto de tela vem daqui, nunca escrito no componente.
 * Fonte: docs/ux/4.6-conteudo-e-a11y.md §3 (chave `tela.elemento[.variante]`, placeholders `{{x}}`).
 */
export const ptBR = {
  "common.day_type.weekday": "dia útil",
  "common.day_type.saturday": "Sábado",
  "common.day_type.sunday_holiday": "Domingo/feriado",
  "first_run.tagline": "Seu caderno de horários de ônibus. Aprende o horário real com o que você anota.",
  "first_run.question": "Como você quer começar?",
  "first_run.import_mobilis": "Importar MOBILIS Leiria",
  "first_run.recommended": "Recomendado",
  "first_run.import_mobilis.detail": "{{count}} linhas com os horários oficiais de {{date}}. Tudo editável.",
  "first_run.start_empty": "Começar do zero",
  "first_run.start_empty.detail": "Você cadastra só os seus pontos e linhas.",
  "first_run.privacy": "Seus dados ficam só neste aparelho.",
  "first_run.importing": "Importando {{count}} linhas…",
  "first_run.import_invalid": "Não foi possível importar. O arquivo não está no formato esperado.",
  "first_run.import_failed": "Não foi possível importar. Nada foi alterado. Tente de novo.",
  "home.empty.title": "Comece pelo ponto onde você pega o ônibus",
  "home.empty.body": "Cadastre o ponto e as linhas que passam nele. O horário vem do que você anotar.",
  "home.empty.action": "Cadastrar meu ponto",
  "migration.failed": "Não foi possível atualizar os dados; nada foi perdido.",
  "toast.save_failed.title": "Não foi possível gravar",
} as const;

export type MessageKey = keyof typeof ptBR;
