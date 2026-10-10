/**
 * Catálogo pt-BR (RNF-06): texto de tela vem daqui, nunca escrito no componente.
 * Fonte: docs/ux/4.6-conteudo-e-a11y.md §3 (chave `tela.elemento[.variante]`, placeholders `{{x}}`).
 */
export const ptBR = {
  "common.close": "Fechar",
  "common.loading": "Carregando",
  "common.confidence.high": "alta",
  "common.confidence.medium": "média",
  "common.confidence.low": "baixa",
  "common.confidence.estimated": "estimado",
  "common.today": "Hoje",
  "common.line.a11y": "Linha {{line}}",
  "common.list.and": "e",
  "common.weekday.0": "domingo",
  "common.weekday.1": "segunda",
  "common.weekday.2": "terça",
  "common.weekday.3": "quarta",
  "common.weekday.4": "quinta",
  "common.weekday.5": "sexta",
  "common.weekday.6": "sábado",
  "common.weekday.short.0": "dom",
  "common.weekday.short.1": "seg",
  "common.weekday.short.2": "ter",
  "common.weekday.short.3": "qua",
  "common.weekday.short.4": "qui",
  "common.weekday.short.5": "sex",
  "common.weekday.short.6": "sáb",
  "common.month.1": "janeiro",
  "common.month.2": "fevereiro",
  "common.month.3": "março",
  "common.month.4": "abril",
  "common.month.5": "maio",
  "common.month.6": "junho",
  "common.month.7": "julho",
  "common.month.8": "agosto",
  "common.month.9": "setembro",
  "common.month.10": "outubro",
  "common.month.11": "novembro",
  "common.month.12": "dezembro",
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
  "search.group.stops": "Pontos",
  "search.group.recent": "Recentes",
  "search.empty.prompt": "Pesquise um ponto de ônibus para começar",
  "search.empty.no_results": "Nada encontrado para “{{term}}”",
  "search.clear.a11y": "Limpar busca",
  "search.result.stop.a11y": "{{name}}, linhas {{lines}}",
  "sheet.handle.a11y": "Tamanho da folha",
  "sheet.detent.small": "pequeno",
  "sheet.detent.medium": "médio",
  "sheet.detent.large": "grande",
  "home.search_placeholder": "Buscar ponto, linha ou lugar",
  "home.section.nearby": "Perto de você",
  "home.stop_card.eta_label": "no ponto às",
  "home.stop_card.bus_eta": "ônibus ~{{time}} · {{range}}",
  "home.stop_card.a11y.destination": "para {{destination}}",
  "home.stop_card.a11y.next_bus": "próximo às {{time}}",
  "home.stop_card.a11y.be_at": "esteja no ponto às {{time}}",
  "sheet_stop.line_direction": "→ {{destination}}",
  "sheet_stop.no_service.sunday_holiday": "Não circula aos domingos e feriados",
  "sheet_stop.no_service.weekdays_only": "Só circula em dias úteis",
  "sheet_stop.no_service.season": "não circula em {{months}}",
  "sheet_stop.next_day": "próximo: {{weekday}}, {{time}}",
  "sheet_stop.no_service.no_table": "Sem horário para este tipo de dia",
  "sheet_stop.may_pass_now": "Pode passar a qualquer momento, até {{time}}",
  "sheet_stop.end_of_route": "fim do percurso · não embarque",
  "sheet_stop.end_of_route_short": "(fim do percurso)",
  "sheet_stop.a11y.passage": "passagem {{number}}",
  "sheet_stop.a11y.came_from": "veio {{origin}}",
  "sheet_stop.a11y.at": "às {{time}}",
  "sheet_stop.a11y.range": "faixa {{start}} a {{end}}",
  "terminal.filter.all_lines": "Todas",
  "terminal.filter.line_only.a11y": "Só a linha {{line}}",
  "terminal.trip.starts_here": "começa aqui · {{place}} {{time}}",
  "terminal.trip.second_pass": "2ª passagem · veio {{origin}}",
  "terminal.trip.nth_pass": "{{ordinal}} passagem · veio {{origin}}",
  "terminal.trip.ends_here": "Termina aqui",
  "terminal_detail.title": "Daqui para a frente",
  "terminal_detail.context": "viagem das {{time}} · {{place}}, {{pass_ordinal}} passagem",
  "terminal_detail.you_are_here": "você",
  "terminal_detail.return_here": "↺ volta aqui · fim",
  "terminal_detail.gap": "+ {{count}} paragens",
  "terminal_detail.footnote": "Entre os pontos de controlo, horário interpolado.",
  // Q-72 (provisórias, a aprovar): a 4.6 só tem a frase inteira "…volta ao Terminal às {{time}}", com o nome do ponto
  // de exemplo, e não cobre ponto que a viagem passa uma vez só, volta no meio da viagem, ponto de controle na leitura
  // do VoiceOver nem a dica da linha do Ponto.
  "terminal_detail.narrative_going": "**Está indo** para {{places}}.",
  "terminal_detail.narrative_return": "Depois **volta aqui às {{time}}**.",
  "terminal_detail.places_last": "{{rest}} e {{last}}",
  "terminal_detail.context_single": "viagem das {{time}} · {{place}}",
  "terminal_detail.return_here_mid": "↺ volta aqui",
  "terminal_detail.a11y.timepoint": "ponto de controle",
  "sheet_stop.a11y.open_ahead": "toque para ver o caminho",
  "home.empty.title": "Comece pelo ponto onde você pega o ônibus",
  "home.empty.body": "Cadastre o ponto e as linhas que passam nele. O horário vem do que você anotar.",
  "home.empty.action": "Cadastrar meu ponto",
  "migration.failed": "Não foi possível atualizar os dados; nada foi perdido.",
  "settings.title": "Ajustes",
  "settings.version": "Versão",
  "test_clock.banner": "Relógio de teste: {{when}} · toque para desligar",
  "test_clock.banner.a11y": "Relógio de teste ligado, {{when}}, toque para desligar",
  "test_clock.date": "{{weekday}} {{date}}",
  "test_clock.day": "Dia",
  "test_clock.hour": "Hora",
  "test_clock.minute": "Minuto",
  "test_clock.step.more": "{{unit}}, mais",
  "test_clock.step.less": "{{unit}}, menos",
  "test_clock.turn_on": "Ligar",
  "toast.save_failed.title": "Não foi possível gravar",
  // E-03 bloco 2. Textos da 4.6 (aprovados): home.register_button*, home.trip.*, sheet_board.*, sheet_alight.*,
  // sheet_stop.register_here, toast.*, search.recent.clear* (D-143).
  "common.now": "agora",
  "home.register_button": "Registrar",
  "home.register_button.a11y": "Registrar embarque",
  "home.trip.title": "Em viagem → {{destination}}",
  // texto provisório, Q-88
  "trip_card.unmatched": "Sem viagem na tabela agora",
  "home.trip.subtitle": "embarcou {{time}} · {{stop_name}}",
  "home.trip.alight_button": "Desci aqui",
  "home.trip.dismiss_button": "Dispensar",
  "sheet_board.title": "Registrar embarque",
  "sheet_board.change_button": "Trocar",
  "sheet_board.change_stop.a11y": "Trocar o ponto",
  "sheet_board.line_prompt": "Qual linha você pegou?",
  "sheet_board.expected": "esperado ~{{time}} · {{relative}}",
  "sheet_board.time_note": "Hora do registro: {{time}} (agora). Dá para ajustar depois, no aviso.",
  "sheet_alight.title": "Onde você desceu?",
  "sheet_alight.trip_ref": "viagem das {{board_time}} · agora {{now}}",
  "sheet_alight.sort_hint": "Mais provável agora primeiro",
  "sheet_alight.stop.subtitle": "esperado {{time}} · ID {{id}}",
  "sheet_stop.register_here": "Registrar aqui",
  "notif.title": "Saia agora",
  "notif.body": "Linha {{line}} às ~{{time}} na {{stop_name}}. Esteja lá às {{arrive_time}}.",
  "notif.action.board": "Registrar embarque",
  "notif.action.snooze": "Adiar 5 min",
  "notif.action.dismiss": "Dispensar",
  "notif.snoozed": "Novo aviso às {{time}}",
  "notif.snoozed_body": "Assim você chega ao ponto depois das {{stop_time}}",
  "notif.renew": "Abra o NoteBus para renovar os avisos", // provisório
  "notif.test.title": "Aviso de teste", // provisório
  "toast.board.title": "Embarque registrado",
  "toast.board.body": "Linha {{line}} · {{stop_name}} · {{time}}",
  "toast.alight.title": "Desembarque registrado",
  "toast.alight.body": "{{stop_name}} · {{time}} · viagem de {{minutes}} min",
  "toast.undo_done.title": "Registro desfeito",
  "toast.undo_board.body": "O embarque das {{time}} foi apagado",
  "toast.undo_alight.body": "Você continua em viagem",
  "toast.trip_dismissed.title": "Viagem dispensada",
  "toast.trip_dismissed.body": "A descida não foi registrada",
  "toast.action.undo": "Desfazer",
  "toast.action.retry": "Tentar de novo",
  "toast.save_failed.body": "O registro não foi salvo.",
  "toast.recents_cleared.title": "Recentes limpos",
  "search.recent.clear": "Limpar",
  "search.recent.clear.a11y": "Limpar recentes",
  // Q-83 (provisórias, a aprovar): a 4.5, o canvas e a 4.6 não têm o "Não embarquei" do cartão Em viagem (D-073).
  "home.trip.not_boarded_button": "Não embarquei",
  "toast.not_boarded.title": "Virou “vi passar”",
  "toast.not_boarded.body": "Linha {{line}} · {{stop_name}} · {{time}}",
  "toast.undo_not_boarded.body": "Voltou para embarque",
  // E-03 bloco 2 (provisórias, a aprovar): a 4.6 dá o formato "daqui a N min" (§4) sem chave, não tem "há N min", nem os
  // textos abaixo. Nenhum altera copy aprovada.
  "common.relative.in": "daqui a {{minutes}} min",
  "common.relative.ago": "há {{minutes}} min",
  "sheet_board.pick_stop": "Escolher o ponto",
  "sheet_board.pick_stop_hint": "Escolha o ponto onde você está",
  "sheet_board.no_lines": "Nenhuma linha para embarcar neste ponto",
  "sheet_alight.stop.subtitle_no_id": "esperado {{time}}",
  "sheet_alight.pass_ordinal": "{{ordinal}} passagem",
  "sheet_alight.no_stops": "Sem paragens para mostrar",
  "home.trip.a11y.open_list": "Ver as paragens até o fim da viagem",
  "home.trip.title_no_destination": "Em viagem",
  "home.trip.eta.a11y": "chegada prevista {{time}}",
  // E-03 bloco 3, backup (provisórias, a aprovar): a 4.6 não tem os textos do backup. O lembrete e o toast da importação
  // seguem as frases do plano E-03 §5.4 e §5.5; o resto é novo.
  "settings.export_backup": "Exportar backup",
  "settings.import_backup": "Importar backup",
  "settings.last_backup": "Último backup: {{date}}",
  "settings.never_exported": "Nunca exportado",
  "settings.export_backup.a11y": "Exportar backup. {{last}}",
  "settings.import_backup.hint": "Escolha um arquivo de backup do NoteBus",
  "backup.share_title": "Backup do NoteBus",
  "backup.preview.title": "Importar backup",
  "backup.preview.checking": "Verificando o arquivo…",
  "backup.preview.summary": "Backup de {{date}}, {{records}} registros, {{places}} lugares. MOBILIS {{datasets}}",
  "backup.preview.merge": "Entram {{inserted}}, substituem {{replaced}} mais antigos e ficam {{kept}} do app. Nada é apagado.",
  "backup.preview.orphans": "{{count}} registros apontam para pontos ou linhas que não existem mais. Entram assim mesmo.",
  "backup.preview.import": "Importar",
  "backup.preview.cancel": "Cancelar",
  "backup.preview.error_title": "Este arquivo não pode ser importado",
  "backup.problem.not_json": "O arquivo está incompleto ou não é um backup.",
  "backup.problem.not_backup": "Este arquivo não é um backup do NoteBus.",
  "backup.problem.checksum_mismatch": "O arquivo foi alterado ou está corrompido. Nada foi gravado.",
  "backup.problem.format_newer": "Este backup é de uma versão mais nova do app. Atualize o app.",
  "backup.problem.format_unknown": "O formato deste backup não é conhecido.",
  "backup.problem.counts_mismatch": "O arquivo está incompleto: as contagens não batem.",
  "backup.problem.dataset_missing": "Importe primeiro a MOBILIS {{versions}}.",
  "home.backup_reminder.body": "Seu último backup foi há {{days}} dias.",
  "home.backup_reminder.body_never": "Você ainda não exportou um backup.",
  "home.backup_reminder.export": "Exportar agora",
  "home.backup_reminder.snooze": "Agora não",
  "toast.export_failed.title": "Backup não exportado",
  "toast.export_failed.verify": "O arquivo não passou na conferência.",
  "toast.export_failed.share": "Não foi possível abrir o compartilhar.",
  "toast.import_done.title": "{{count}} registros restaurados",
  "toast.import_undone.title": "Importação desfeita",
  "toast.import_failed.title": "Backup não importado",
  "toast.import_failed.body": "Nada foi gravado.",
  // E-04 (TL-06, TL-09, Início, 4.6 §3.11)
  "toast.action.adjust": "Ajustar",
  "sheet_verify.title": "Conferir registro",
  "sheet_verify.record": "{{weekday}} {{date}} · {{time}} · {{kind}}",
  "sheet_verify.orphan": "Nenhuma viagem da linha {{line}} costuma passar aqui às {{time}}. Até você conferir, este registro fica fora da estimativa.",
  "sheet_verify.ambiguous": "Duas viagens da linha {{line}} passam aqui perto das {{time}}. Até você conferir, este registro fica fora da estimativa.",
  "sheet_verify.which": "Qual foi?",
  "sheet_verify.trip.late": "A das {{time}}, {{minutes}} min atrasada",
  "sheet_verify.trip.early": "A das {{time}}, {{minutes}} min adiantada",
  "sheet_verify.trip.on_time": "A das {{time}}, na hora",
  "sheet_verify.trip.detail": "→ {{destination}} · sai do {{first_stop}} às {{time}}",
  "sheet_verify.other_line": "Ou foi outra linha?",
  "sheet_verify.ride_hint": "Sua descida em {{stop_name}} às {{time}} bate com esta",
  "sheet_verify.fix_time": "Corrigir a hora",
  "sheet_verify.dont_know": "Não sei",
  "toast.verified.title": "Registro conferido",
  "toast.verified.body": "Linha {{line}} · viagem das {{time}} · entra na estimativa",
  "toast.verified_other_line.body": "Trocado para a linha {{line}} · viagem das {{time}}",
  "toast.dont_know.title": "Fica para depois",
  "toast.dont_know.body": "Fora da estimativa. Está em Registros.",
  "toast.undo_verify.body": "Voltou para conferir",
  "sheet_record.title": "Registro",
  "sheet_record.field.line": "Linha",
  "sheet_record.field.stop": "Ponto",
  "sheet_record.field.day": "Dia",
  "sheet_record.field.alight": "Descida",
  "sheet_record.alight.none": "ainda em viagem",
  "sheet_record.day.today": "Hoje · {{weekday}} {{date}}",
  "sheet_record.kind.boarded": "Embarquei",
  "sheet_record.kind.passed": "Só vi passar",
  "common.kind.boarded.short": "embarquei",
  "sheet_record.time": "Hora",
  "sheet_record.time.exact": "Exata",
  "sheet_record.time.range": "Mais ou menos",
  "sheet_record.time.aria": "Hora {{time}}, tocar para escolher",
  "sheet_record.time.yesterday_at": "ontem às {{time}}",
  "sheet_record.adjust.before.aria": "{{count}} minuto(s) antes",
  "sheet_record.adjust.after.aria": "{{count}} minuto(s) depois",
  "sheet_record.range.chip": "± {{minutes}} min",
  "sheet_record.match.auto": "Casa com a viagem das {{trip_time}} · pela tabela passa aqui às {{time}} · você: {{relative}}",
  "sheet_record.relative.late": "{{minutes}} min depois",
  "sheet_record.relative.early": "{{minutes}} min antes",
  "sheet_record.relative.on_time": "na hora",
  "sheet_record.match.orphan": "Nenhuma viagem da linha {{line}} costuma passar aqui às {{time}}. Vai ficar para conferir, fora da estimativa.",
  "sheet_record.match.orphan_range": "Nenhuma viagem da linha {{line}} costuma passar aqui entre {{start}} e {{end}}. Vai ficar para conferir, fora da estimativa.",
  "sheet_record.match.ambiguous": "Duas viagens podem ter sido essa. Vai ficar para conferir.",
  "sheet_record.memory": "Anotei de memória",
  "sheet_record.memory.detail": "Não tenho certeza da hora · pesa menos na estimativa",
  "sheet_record.note": "Nota (opcional)",
  "sheet_record.note.placeholder": "ex.: ônibus lotado",
  "sheet_record.delete": "Apagar registro",
  "toast.record_changed.title": "Registro alterado",
  "toast.record_changed.body": "Linha {{line}} · {{stop_name}} · {{time}}",
  "toast.record_deleted.title": "Registro apagado",
  "toast.record_deleted.body": "Embarque das {{time}} · linha {{line}}",
  "toast.undo_record.body": "Voltou para {{time}}",
  "toast.undo_delete.body": "O embarque voltou",
  "alight_picker.second_pass": "{{ordinal}} passagem · segue para a {{destination}}",
  "common.end_of_route": "fim do percurso",
  "home.pending": "{{count}} registros para conferir",
  "home.pending_review": "{{count}} registros para conferir",
  // Q-91 (textos provisórios para o Rick aprovar ou trocar)
  "toast.record_not_saved.title": "Alteração não gravada", // Q-91
  "sheet_record.problem.before_boarding": "A descida não pode ser antes do embarque", // Q-91
  "sheet_record.problem.position_not_after": "A descida precisa ser depois do embarque, no mesmo percurso", // Q-91
  "sheet_record.problem.pattern_differs": "Embarque e descida precisam ser do mesmo percurso", // Q-91
  "sheet_record.problem.future": "A hora não pode ser no futuro", // Q-91
  "sheet_record.problem.invalid_interval": "O intervalo não pode passar de 30 minutos", // Q-91
  "sheet_record.kind_passed_warning": "Ao trocar para “vi passar”, a descida deste registro será apagada. O Desfazer devolve.", // Q-91
  "sheet_record.day.other": "{{weekday}} {{date}}", // Q-91
  "toast.record_deleted_pair.title": "Embarque e descida apagados", // Q-91
  "common.kind.passed.short": "vi passar", // Q-91
  "common.kind.alighted.short": "desci", // Q-91
  "sheet_verify.problem.alight_conflict": "Este embarque já tem descida: apague a descida antes de trocar de linha", // Q-91
  "trip_card.unmatched_next": "próxima às {{time}}", // Q-91
  "trip_card.unmatched_next_day": "próxima: {{weekday}}, {{time}}", // Q-91
  "home.pending_one": "1 registro para conferir", // Q-91
  // E-04 Bloco 3 (TL-08 Registros, Início, Ontem)
  "common.yesterday": "Ontem",
  "sheet_records.title": "Registros",
  "sheet_records.section.pending": "Para conferir",
  "sheet_records.chip.pending": "para conferir",
  "sheet_records.chip.not_verified": "não conferido",
  "sheet_records.empty.title": "Nenhum registro ainda",
  "sheet_records.empty.action": "Registrar",
  "sheet_records.action.delete": "Apagar",
  "sheet_records.row.a11y": "{{time}}, Linha {{line}}, {{stop}}, {{kind}}{{state}}",
  "sheet_records.row.state_pending": ", para conferir",
  "sheet_records.row.state_not_verified": ", não conferido",
  "home.section.all_records": "Todos os registros",
  "sheet_record.yesterday": "ontem",
  // E-05 Bloco 2 (TL-10 Lugares e trajetos, 4.6 §3.11)
  "common.walking": "A pé",
  "common.save": "Salvar",
  "common.cancel": "Cancelar",
  "common.back": "Voltar",
  "places.title": "Lugares e trajetos",
  "places.order_hint": "A ordem aqui é a dos atalhos na tela inicial",
  "places.routes_to": "{{count}} trajeto(s) até aqui",
  "places.reorder.aria": "Arrastar para reordenar",
  "places.new": "Novo lugar",
  "places.empty": "Nenhum lugar cadastrado",
  "places.reorder.up": "Mover para cima",
  "places.reorder.down": "Mover para baixo",
  "place.field.name": "Nome",
  "place.field.icon": "Ícone",
  "place.field.location": "Localização",
  "place.location.set": "marcada no mapa",
  "place.location.use_now": "Usar minha localização agora",
  "place.location.reason": "O NoteBus usa a sua localização apenas para guardar onde fica este lugar.",
  "place.location.none": "Sem localização definida", // provisório
  "place.location.imprecise": "A posição está imprecisa ({{m}} m). Tente de novo ao ar livre.", // provisório
  "place.location.far": "Fica longe de Leiria. Guardar mesmo assim?", // provisório
  "stop.location_offer.title": "Guardar a localização deste ponto", // provisório
  "stop.location_offer.body": "Você registrou aqui {{count}} vezes, sempre no mesmo lugar.", // provisório
  "stop.location_offer.save": "Guardar", // provisório
  "stop.location_offer.later": "Agora não", // provisório
  "stop.location_offer.saved": "Localização guardada", // provisório
  "stop.location_offer.far": "Fica longe de Leiria. Guardar mesmo assim?", // provisório
  "stop.location_offer.imprecise": "A posição está imprecisa ({{m}} m). Tente de novo ao ar livre.", // provisório
  "stop.location_offer.save.a11y": "Guardar a localização deste ponto", // provisório
  "stop.location_offer.later.a11y": "Agora não guardar a localização deste ponto", // provisório
  "place.shortcut": "Atalho na tela inicial",
  "place.routes_here": "Trajetos até aqui",
  "place.no_routes": "Nenhum trajeto até aqui",
  "place.route.name": "{{origin}} → {{destination}}",
  "place.route.summary": "{{count}} opção(ões) · linha {{line}}",
  "place.new_route": "Novo trajeto até aqui",
  "place.new_route.origin_label": "Origem do novo trajeto:",
  "place.icon.a11y": "Ícone {{name}}",
  "place.icon.default": "padrão",
  "place.goto_button": "Ir para {{destination}}",
  "route.subtitle": "Com o próximo ônibus · agora {{time}}, {{weekday}}",
  "route.option.alight": "Desce: {{stop_name}}",
  "route.option.walks": "{{to}} min até o ponto · {{from}} min a pé depois",
  "route.option.detail": "sair às {{leave}} · desce ~{{arrive}}",
  "route.option.walk_detail": "sair às {{leave}} · chega ~{{arrive}}",
  "route.add_option": "Adicionar opção (ônibus ou a pé)",
  "route.order_hint": "Mesma ordem do “Ir para”: quem chega antes vem primeiro. O mesmo ônibus pode aparecer duas vezes, com descidas diferentes.",
  "route.no_options": "Nenhuma opção cadastrada",
  "option.title": "Opção",
  "option.type.bus": "Ônibus",
  "option.type.a11y": "Tipo de opção",
  "option.field.line": "Linha",
  "option.line.aria": "Linha {{code}}", // provisório
  "option.field.boarding": "Embarque",
  "option.field.alight": "Descida",
  "option.pick_boarding.placeholder": "escolher ponto",
  "option.pick_alight.placeholder": "escolher descida",
  "option.stop.detail": "ID {{id}} · sentido {{destination}}",
  "option.walk_to": "A pé até o embarque",
  "option.walk_from": "A pé depois da descida",
  "option.walk.check": "Confira: mudou a descida",
  "option.walk.range_button": "Faixa",
  "option.walk.no_range_button": "Sem faixa",
  "option.walk.max_label": "Máx",
  "option.walk.minus.aria": "Menos 1 minuto {{target}}",
  "option.walk.plus.aria": "Mais 1 minuto {{target}}",
  "option.walk.max_minus.aria": "Menos 1 minuto máximo {{target}}",
  "option.walk.max_plus.aria": "Mais 1 minuto máximo {{target}}",
  "option.walk.shared_hint": "vale para todos os trajetos com este par",
  "option.walk_minutes": "Tempo a pé (minutos)",
  "option.preview.title": "Com o próximo ônibus",
  "option.preview.detail": "sair às {{leave}} · chega ~{{arrive}} · até {{until}}",
  "option.preview.no_trips_today": "Sem viagem hoje por esta opção", // provisório
  "option.delete": "Apagar opção",
  "toast.option_deleted.title": "Opção apagada", // provisório
  "toast.undo_option_deleted.body": "A opção voltou", // provisório
  "alight_picker.title": "Onde você desce?",
  "alight_picker.subtitle": "Linha {{line}}, depois de {{stop_name}}",
  "alight_picker.times": "Passa, no próximo ônibus",
  "alight_picker.more": "mais {{count}} paragens",
  // E-05 Bloco 3: TL-04 "Ir para X" (4.6 §3.5) e atalhos do Início
  "sheet_goto.title": "Ir para {{destination}}",
  "sheet_goto.context": "de {{origin}} · agora {{time}} · {{weekday}}, {{day_type}}",
  "sheet_goto.leave_at": "sair às",
  "sheet_goto.leave_now": "sair agora",
  "sheet_goto.arrive_label": "chega",
  "sheet_goto.arrive_worst_case": "até {{time}}",
  "sheet_goto.stop_at": "no ponto {{time}} · {{stop_name}}",
  "sheet_goto.walk_time": "{{minutes}} min a pé · desce na porta da {{place}}",
  "sheet_goto.walk_option": "A pé · {{minutes}} min",
  "sheet_goto.auto_update": "Atualiza sozinho a cada minuto",
  "sheet_goto.official_schedule": "horário oficial {{time}} · {{minutes}} min a pé",
  "sheet_goto.origin_label": "de {{origin}}",
  "sheet_goto.origin_change": "Trocar origem",
  "sheet_goto.origin_select_title": "Escolher origem",
  "sheet_goto.no_service_today": "Nenhum serviço hoje",
  "sheet_goto.no_trips_left": "Sem mais viagens hoje",
  "sheet_goto.next_service": "Próximo serviço: {{day}}",
  "sheet_goto.a11y.bus_card": "Sair às {{leave}}, esteja no ponto às {{be_at}}, chega por volta das {{arrive}}, até {{until}}, Linha {{line}}, ponto {{stop}}",
  "sheet_goto.a11y.walk_card": "A pé, sair às {{leave}}, chega por volta das {{arrive}}",
  "home.stop_card.leave_at_neutral": "sair às {{time}} · {{place}}", // provisório
  "home.shortcut.add": "Adicionar",
  "empty_home.dashed_casa": "Casa",
  // E-06 Bloco 3: Aviso de saída
  "sheet_goto.alarm.set_button": "Avisar para sair",
  "sheet_goto.alarm.active_button": "Aviso às {{time}}",
  "toast.alarm_set.title": "Aviso marcado",
  "toast.alarm_set.body": "Saia às {{time}} para a linha {{line}}",
  "toast.alarm_cancelled.title": "Aviso cancelado",
  "alarm.test_clock": "O relógio de teste está ligado: o aviso não é agendado", // provisório
  "toast.alarm_replaced": "Substituiu o aviso das {{time}} nas {{days}}", // provisório
  "alarm.repeat.title": "Repetir", // provisório
  "alarm.repeat.once": "Só hoje", // provisório
  "alarm.repeat.daily": "Todo dia", // provisório
  "alarm.repeat.weekdays": "Seg a sex", // provisório
  "alarm.repeat.weekly": "Toda semana às {{day}}", // provisório
  "alarm.repeat.custom": "Personalizado", // provisório
  "alarm.repeat.until": "Até", // provisório
  "alarm.repeat.until_none": "Sem fim", // provisório
  "alarm.repeat.until_date": "Uma data", // provisório
  "alarm.repeat.done": "Pronto", // provisório
  "common.weekday.plural.0": "domingos", // provisório
  "common.weekday.plural.1": "segundas", // provisório
  "common.weekday.plural.2": "terças", // provisório
  "common.weekday.plural.3": "quartas", // provisório
  "common.weekday.plural.4": "quintas", // provisório
  "common.weekday.plural.5": "sextas", // provisório
  "common.weekday.plural.6": "sábados", // provisório
  "common.weekday.full.0": "domingo", // provisório
  "common.weekday.full.1": "segunda-feira", // provisório
  "common.weekday.full.2": "terça-feira", // provisório
  "common.weekday.full.3": "quarta-feira", // provisório
  "common.weekday.full.4": "quinta-feira", // provisório
  "common.weekday.full.5": "sexta-feira", // provisório
  "common.weekday.full.6": "sábado", // provisório
  "alarm.repeat.back": "Atalhos de repetição", // provisório
  "alarm.summary.once": "só hoje", // provisório
  "alarm.summary.daily": "todo dia", // provisório
  "alarm.summary.weekdays": "seg a sex", // provisório
  "alarm.summary.until": "até {{date}}", // provisório
  "alarms.line.leave": "ônibus ~{{time}}", // provisório
  "alarms.title": "Avisos", // provisório
  "alarms.delete": "Apagar", // provisório
  "alarms.undo_failed": "Não foi possível desfazer", // provisório
  "alarms.on_count": "Avisos ligados: {{count}}", // provisório
  "alarms.empty": "Nenhum aviso ligado. Ligue um no cartão de uma opção.", // provisório
  "alarms.edit_hint": "Para mudar o horário de sair, ligue um aviso no cartão correspondente.", // provisório
  "alarms.test_button": "Enviar aviso de teste em 1 minuto", // provisório
  "alarms.test_hint": "Neste teste, Registrar embarque grava um embarque de verdade. Use Desfazer na confirmação.", // provisório
  "alarms.test_scheduled": "Aviso de teste agendado para {{time}}", // provisório
  "alarms.test_no_option": "Cadastre uma opção de ônibus primeiro", // provisório
  "alarms.next": "Próximos avisos", // provisório
  "alarms.history": "Histórico", // provisório
  "alarms.history_note": "Sem confirmação quer dizer que o aviso não foi tocado por você: pode ter sido apagado ou pode não ter tocado.", // provisório
  "alarms.focus_row": "Modo Foco", // provisório
  "alarm.history.boarded": "Registrou pelo aviso", // provisório
  "alarm.history.snoozed": "Adiado", // provisório
  "alarm.history.dismissed": "Dispensado", // provisório
  "alarm.history.delivered": "Entregue", // provisório
  "alarm.history.unconfirmed": "Sem confirmação", // provisório
  "alarm.history.scheduled": "Agendado", // provisório
  "alarm.history.skipped": "Pulado: {{reason}}", // provisório
  "alarm.history.reason.holiday": "feriado", // provisório
  "alarm.history.reason.override": "exceção de data", // provisório
  "alarm.history.reason.no_trip": "sem a viagem", // provisório
  "alarm.history.reason.season": "fora de temporada", // provisório
  "alarm.intro.title": "Avisar para sair", // provisório
  "alarm.intro.reason": "O NoteBus avisa a hora de sair para o seu ônibus, mesmo sem internet.", // provisório
  "alarm.intro.continue": "Continuar", // provisório
  "alarm.intro.later": "Agora não", // provisório
  "alarm.denied.title": "Avisos desativados", // provisório
  "alarm.denied.body": "Para receber o aviso de saída, ative as notificações do NoteBus nos Ajustes do iPhone.", // provisório
  "alarm.denied.open": "Abrir Ajustes do iPhone", // provisório
  "alarm.focus.title": "Modo Foco", // provisório
  "alarm.focus.body": "Com um modo Foco ativado no iPhone, os avisos podem ser silenciados e não aparecer na tela.", // provisório
  "alarm.focus.step1": "Abra os Ajustes do iPhone", // provisório
  "alarm.focus.step2": "Toque em Foco e escolha o seu Foco ativo", // provisório
  "alarm.focus.step3": "Toque em Apps", // provisório
  "alarm.focus.step4": "Adicione o NoteBus à lista de permitidos", // provisório
  "alarm.focus.done": "Entendi", // provisório
  "map.locate.a11y": "Onde estou", // provisório
  "map.permission_denied": "A localização está desligada para o NoteBus. Ligue em Ajustes do iPhone.", // provisório
  "map.no_fix": "Ainda sem sinal de localização. Tente de novo em instantes.", // provisório
  "offline_map.offer": "Baixar o mapa de Leiria para usar sem internet (cerca de {{mb}} MB). Use o Wi-Fi.", // provisório
  "offline_map.button.download": "Baixar", // provisório
  "offline_map.button.snooze": "Agora não", // provisório
  "offline_map.button.retry": "Tentar de novo", // provisório
  "offline_map.downloading": "Baixando o mapa de Leiria… {{percent}}%", // provisório
  "offline_map.error": "Não foi possível baixar o mapa. Confira a internet e tente de novo.", // provisório
  "offline_map.ready_toast": "Mapa de Leiria pronto para usar sem internet.", // provisório
  "offline_map.button.download.a11y": "Baixar o mapa de Leiria", // provisório
  "offline_map.button.snooze.a11y": "Agora não baixar o mapa", // provisório
  "offline_map.button.retry.a11y": "Tentar baixar o mapa de novo", // provisório
  "settings.offline_map.title": "Mapa sem internet", // provisório
  "settings.offline_map.not_downloaded": "Não baixado", // provisório
  "settings.offline_map.downloading": "Baixando… {{percent}}%", // provisório
  "settings.offline_map.ready": "Pronto, {{mb}} MB", // provisório
  "settings.offline_map.failed": "Falhou", // provisório
  "settings.offline_map.alert.title": "Mapa sem internet", // provisório
  "settings.offline_map.alert.download": "Baixar", // provisório
  "settings.offline_map.alert.download_again": "Baixar de novo", // provisório
  "settings.offline_map.alert.delete": "Apagar", // provisório
  "settings.offline_map.a11y": "Mapa sem internet. {{estado}}", // provisório
  // E-07 Bloco 7b: Marcar no mapa
  "map_pick.open": "Marcar no mapa", // provisório
  "map_pick.open.place.a11y": "Marcar no mapa onde fica este lugar", // provisório
  "map_pick.open.stop.a11y": "Marcar no mapa onde fica este ponto", // provisório
  "map_pick.hint": "Toque onde fica", // provisório
  "map_pick.confirm": "Confirmar", // provisório
  "map_pick.confirm.a11y": "Confirmar a posição marcada", // provisório
  "map_pick.confirm.needs_tap.a11y": "Toque no mapa para escolher a posição antes de confirmar", // provisório
  "map_pick.cancel.a11y": "Cancelar sem marcar", // provisório
  "map_pick.unavailable": "Não foi possível abrir o mapa. Confira a internet ou baixe o mapa em Ajustes.", // provisório
  // E-08 Bloco 1b: Ajustes (TL-12)
  "settings.section.general": "Geral", // provisório
  "settings.section.days": "Dias", // provisório
  "settings.section.holidays": "Feriados", // provisório
  "settings.section.alerts": "Avisos", // provisório
  "settings.section.map": "Mapa", // provisório
  "settings.section.data": "Dados", // provisório
  "settings.section.network": "Rede", // provisório
  "settings.section.about": "Sobre", // provisório
  "settings.margin.title": "Margem para chegar ao ponto", // provisório
  "settings.margin.value": "{{n}} min", // provisório
  "settings.margin.a11y": "Margem para chegar ao ponto, {{n}} minutos", // provisório
  "settings.margin.less": "Diminuir margem", // provisório
  "settings.margin.more": "Aumentar margem", // provisório
  "settings.margin.hint": "O app manda você estar no ponto este tempo antes do ônibus.", // provisório
  "settings.day.weekday": "Dia útil", // provisório
  "settings.day.saturday": "Sábado", // provisório
  "settings.day.sunday_holiday": "Domingo e feriado", // provisório
  "settings.day.trips": "{{n}} viagens", // provisório
  "settings.override.add": "+ Exceção", // provisório
  "settings.override.line": "{{date}} · {{type}}", // provisório
  "settings.override.past": "Passadas ({{n}})", // provisório
  "settings.holiday.national": "Feriados nacionais: automático", // provisório
  "settings.holiday.municipal": "Incluir feriados municipais", // provisório
  "settings.holiday.add": "+ Feriado", // provisório
  "settings.holiday.line_every_year": "{{name}} · {{date}} · todo ano", // provisório
  "settings.holiday.line_once": "{{name}} · {{date}}", // provisório
  "settings.holiday.official_note": "da MOBILIS", // provisório
  "settings.alarms.allow": "Permitir avisos de saída", // provisório
  "settings.alarms.off_hint": "Desligado: nenhum aviso toca. Os avisos continuam guardados.", // provisório
  "settings.alarms.test_off": "Avisos desligados em Ajustes", // provisório
  "settings.backup.never": "Você ainda não exportou um backup", // provisório
  "settings.backup.today": "Último backup hoje", // provisório
  "settings.backup.yesterday": "Último backup ontem", // provisório
  "settings.backup.days_ago": "Último backup há {{n}} dias", // provisório
  "settings.network.line": "MOBILIS Leiria · dados de {{version}} · vigência desde {{from}}", // provisório
  "override.title": "Exceção por data", // provisório
  "override.date": "Data", // provisório
  "override.works_as": "Funciona como", // provisório
  "override.note": "Nota (opcional)", // provisório
  "override.save": "Salvar", // provisório
  "override.saved": "Exceção salva", // provisório
  "override.replaced": "Substituiu a exceção de {{date}}", // provisório
  "override.deleted": "Exceção apagada", // provisório
  "override.error.date": "Escolha uma data válida", // provisório
  "override.error.generic": "Não foi possível salvar. Tente de novo.", // provisório
  "override.past.title": "Exceções passadas", // provisório
  "override.past.empty": "Nenhuma exceção passada", // provisório
  "holiday.title": "Feriado", // provisório
  "holiday.name": "Nome", // provisório
  "holiday.date": "Data", // provisório
  "holiday.every_year": "Repete todo ano", // provisório
  "holiday.save": "Salvar", // provisório
  "holiday.saved": "Feriado salvo", // provisório
  "holiday.deleted": "Feriado apagado", // provisório
  "holiday.error.name": "Escreva o nome do feriado", // provisório
  "holiday.error.date": "Escolha uma data válida", // provisório
  "holiday.error.official": "Este feriado vem da MOBILIS. Desligue \"Incluir feriados municipais\" para não usá-lo.", // provisório
  "network.title": "Rede", // provisório
  "network.file": "Arquivo", // provisório
  "network.version": "Versão", // provisório
  "network.imported_at": "Importado em", // provisório
  "network.checksum": "Checksum", // provisório
  "network.valid_from": "Vigência desde", // provisório
  "network.unknown": "Indisponível", // provisório
  "settings.network.row": "Linhas e pontos", // provisório
  "net.title": "Linhas e pontos", // provisório
  "net.section.lines": "Linhas", // provisório
  "net.section.stops": "Pontos", // provisório
  "net.line.patterns_one": "1 percurso", // provisório
  "net.line.patterns_other": "{{n}} percursos", // provisório
  "net.line.a11y": "Linha {{code}}, {{name}}, {{patterns}}", // provisório
  "net.stop.a11y": "Ponto {{name}}", // provisório
  "net.stop.id": "ID {{id}}", // provisório
  "net.stop.aliases": "Também: {{list}}", // provisório
  "net.official": "MOBILIS", // provisório
  "net.empty.lines": "Nenhuma linha na rede", // provisório
  "net.empty.stops": "Nenhum ponto na rede", // provisório
  "net.empty.line": "Esta linha não existe mais", // provisório
  "net.error": "Não foi possível carregar a rede", // provisório
  "net.pattern.circular": "Circular", // provisório
  "net.pattern.stops_one": "1 paragem", // provisório
  "net.pattern.stops_other": "{{n}} paragens", // provisório
  "net.pattern.control": "ponto de controle", // provisório
  "net.times.title": "Horários-base", // provisório
  "net.times.valid_from": "Vigência desde {{date}}", // provisório
  "net.times.at": "Horários em {{stop}}", // provisório
  "net.times.empty": "Sem viagens neste tipo de dia", // provisório
  "net.times.partial_note": "{{n}} viagens parciais não passam neste ponto e não aparecem aqui", // provisório
} as const;

export type MessageKey = keyof typeof ptBR;
