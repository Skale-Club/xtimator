/**
 * Static pt/es copy for client visibility outside the estimate: the Projects
 * list Status column and filters, and the dashboard "Client activity" card.
 * Keys are the exact English strings passed to t(). Spread into staticDict in
 * translations.ts, so these never wait on the async translation batch.
 */
type Dict = Record<string, string>

export const clientActivityTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    // Projects list
    'Hot': 'Quente',
    'Last client activity': 'Última atividade do cliente',
    'Opened, no answer yet': 'Aberto, sem resposta',
    // Relative time
    'just now': 'agora mesmo',
    '{n} min ago': 'há {n} min',
    '{n}h ago': 'há {n} h',
    '{n}d ago': 'há {n} d',
    // Interest reasons (tooltip on the Hot marker)
    'Opened many times': 'Abriu várias vezes',
    'More than one person opened it': 'Mais de uma pessoa abriu',
    'Read it to the end': 'Leu até o fim',
    'Spent time on the totals': 'Ficou um tempo nos totais',
    'Came back on another day': 'Voltou em outro dia',
    'Started signing': 'Começou a assinar',
    'Downloaded or printed it': 'Baixou ou imprimiu',
    'Opened in the last 2 days': 'Abriu nos últimos 2 dias',
    'No visits in the last 7 days': 'Sem visitas nos últimos 7 dias',
    // Dashboard card
    'Client activity': 'Atividade dos clientes',
    'See all': 'Ver tudo',
    'What clients did with your estimates lately.': 'O que os clientes fizeram com seus orçamentos recentemente.',
    "When a client opens an estimate, you'll see it here.": 'Quando um cliente abrir um orçamento, você verá aqui.',
    'A client': 'Um cliente',
    'phone': 'celular',
    'computer': 'computador',
    '{who} opened {project}': '{who} abriu {project}',
    '{who} opened {project} {n} times': '{who} abriu {project} {n} vezes',
    '{who} downloaded the PDF of {project}': '{who} baixou o PDF de {project}',
    '{who} started signing {project}': '{who} começou a assinar {project}',
    '{who} printed {project}': '{who} imprimiu {project}',
    '{who} accepted {project}': '{who} aceitou {project}',
    '{who} declined {project}': '{who} recusou {project}',
  },
  es: {
    // Projects list
    'Hot': 'Caliente',
    'Last client activity': 'Última actividad del cliente',
    'Opened, no answer yet': 'Abierto, sin respuesta',
    // Relative time
    'just now': 'ahora mismo',
    '{n} min ago': 'hace {n} min',
    '{n}h ago': 'hace {n} h',
    '{n}d ago': 'hace {n} d',
    // Interest reasons (tooltip on the Hot marker)
    'Opened many times': 'Lo abrió varias veces',
    'More than one person opened it': 'Lo abrió más de una persona',
    'Read it to the end': 'Lo leyó hasta el final',
    'Spent time on the totals': 'Pasó tiempo en los totales',
    'Came back on another day': 'Volvió otro día',
    'Started signing': 'Empezó a firmar',
    'Downloaded or printed it': 'Lo descargó o imprimió',
    'Opened in the last 2 days': 'Lo abrió en los últimos 2 días',
    'No visits in the last 7 days': 'Sin visitas en los últimos 7 días',
    // Dashboard card
    'Client activity': 'Actividad de los clientes',
    'See all': 'Ver todo',
    'What clients did with your estimates lately.': 'Lo que los clientes hicieron con sus presupuestos recientemente.',
    "When a client opens an estimate, you'll see it here.": 'Cuando un cliente abra un presupuesto, lo verá aquí.',
    'A client': 'Un cliente',
    'phone': 'celular',
    'computer': 'computadora',
    '{who} opened {project}': '{who} abrió {project}',
    '{who} opened {project} {n} times': '{who} abrió {project} {n} veces',
    '{who} downloaded the PDF of {project}': '{who} descargó el PDF de {project}',
    '{who} started signing {project}': '{who} empezó a firmar {project}',
    '{who} printed {project}': '{who} imprimió {project}',
    '{who} accepted {project}': '{who} aceptó {project}',
    '{who} declined {project}': '{who} rechazó {project}',
  },
}
