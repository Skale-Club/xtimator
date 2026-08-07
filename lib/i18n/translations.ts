type TranslationDict = Record<string, string>

export const staticDict: Record<'pt' | 'es', TranslationDict> = {
  pt: {
    // Navigation
    'Dashboard': 'Painel',
    'Clients': 'Clientes',
    'Projects': 'Projetos',
    'Estimates': 'Orçamentos',
    'Settings': 'Configurações',
    'New Project': 'Novo Projeto',
    'New Client': 'Novo Cliente',
    'Recordings': 'Gravações',
    'Photos': 'Fotos',
    'Activity': 'Atividade',

    // Buttons
    'Save': 'Salvar',
    'Cancel': 'Cancelar',
    'Delete': 'Excluir',
    'Create': 'Criar',
    'Edit': 'Editar',
    'Submit': 'Enviar',
    'Back': 'Voltar',
    'Next': 'Próximo',
    'Sign Out': 'Sair',
    'Upload': 'Enviar arquivo',
    'Download': 'Baixar',
    'Send': 'Enviar',
    'Share': 'Compartilhar',
    'Copy': 'Copiar',
    'View': 'Visualizar',
    'Add': 'Adicionar',
    'Remove': 'Remover',
    'Confirm': 'Confirmar',
    'Close': 'Fechar',
    'Search': 'Buscar',
    'Filter': 'Filtrar',
    'Sort': 'Ordenar',
    'Refresh': 'Atualizar',
    'Retry': 'Tentar novamente',
    'Retry transcription': 'Tentar transcrição novamente',
    'Continue': 'Continuar',

    // Status labels
    'Active': 'Ativo',
    'Draft': 'Rascunho',
    'Sent': 'Enviado',
    'Pending': 'Pendente',
    'Cancelled': 'Cancelado',
    'Complete': 'Concluído',
    'In Progress': 'Em andamento',
    'Archived': 'Arquivado',
    'Loading': 'Carregando',
    'Error': 'Erro',

    // Form labels
    'Name': 'Nome',
    'Email': 'E-mail',
    'Phone': 'Telefone',
    'Address': 'Endereço',
    'Company': 'Empresa',
    'Industry': 'Setor',
    'Description': 'Descrição',
    'Notes': 'Observações',
    'Search price book…': 'Buscar no catálogo…',
    'No matches': 'Sem resultados',
    'Date': 'Data',
    'Amount': 'Valor',
    'Total': 'Total',
    'Subtotal': 'Subtotal',
    'Tax': 'Imposto',
    'Discount': 'Desconto',

    // Section headings
    'Overview': 'Visão geral',
    'Audio': 'Áudio',

    // Voice recorder — REC/pause controls (260707-ru5)
    'Paused': 'Pausado',
    'Pause recording': 'Pausar gravação',
    'Resume recording': 'Retomar gravação',
    'Start recording': 'Iniciar gravação',
    'Stop recording': 'Parar gravação',

    // Table headers
    'Client': 'Cliente',
    'Type': 'Tipo',
    'Actions': 'Ações',
    'Status': 'Status',

    // Empty states
    'No clients yet': 'Nenhum cliente ainda',
    'No projects yet': 'Nenhum projeto ainda',
    'No estimates yet': 'Nenhum orçamento ainda',
    'No recordings yet': 'Nenhuma gravação ainda',
    'No photos yet': 'Nenhuma foto ainda',
    'No clients match your search': 'Nenhum cliente corresponde à sua busca',
    'No projects match your search': 'Nenhum projeto corresponde à sua busca',
    'Add your first client to get started': 'Adicione seu primeiro cliente para começar',
    'Create your first project to get started': 'Crie seu primeiro projeto para começar',
    'Try a different search term': 'Tente um termo de busca diferente',
    'Try a different search term or clear filters': 'Tente outro termo ou limpe os filtros',

    // Action labels
    'Add Client': 'Adicionar Cliente',
    'Delete Client': 'Excluir Cliente',
    'Delete Project': 'Excluir Projeto',
    'Duplicate': 'Duplicar',
    'Duplicating...': 'Duplicando...',

    // Sort options
    'Newest': 'Mais recente',
    'Oldest': 'Mais antigo',
    'Highest Value': 'Maior valor',
    'Alphabetical': 'Alfabética',

    // Common messages
    'Saving...': 'Salvando...',
    'Deleting...': 'Excluindo...',
    'Loading...': 'Carregando...',
    'Something went wrong': 'Algo deu errado',
    'Please try again': 'Por favor, tente novamente',
    'Changes saved': 'Alterações salvas',
    'Deleted successfully': 'Excluído com sucesso',
    'Created successfully': 'Criado com sucesso',

    // Modal / confirm
    'Are you sure?': 'Tem certeza?',
    'This action cannot be undone': 'Esta ação não pode ser desfeita',
    'Yes, delete it': 'Sim, excluir',

    // Notifications (Phase 77)
    'Notifications': 'Notificações',
    'Mark all as read': 'Marcar todas como lidas',
    'See all': 'Ver tudo',
    'All caught up': 'Tudo em dia',
    'Unread only': 'Apenas não lidas',
    'Notification preferences': 'Preferências de notificação',
    'Choose how you want to be notified for each event category.':
      'Escolha como deseja ser notificado para cada categoria de evento.',
    'Email digest enabled': 'Resumo por e-mail ativado',
    'Master switch — turn off to silence every email notification.':
      'Interruptor mestre — desative para silenciar todas as notificações por e-mail.',
    'Category': 'Categoria',
    // Price Book — folders/categories (quick-k60)
    'New Category': 'Nova Categoria',
    'Delete Category': 'Excluir Categoria',
    'Category name...': 'Nome da categoria...',
    'Category deleted': 'Categoria excluída',
    'This will delete the category. Items in this category must be moved or deleted first.':
      'Isso excluirá a categoria. Os itens desta categoria precisam ser movidos ou excluídos antes.',
    'In-app': 'No app',
    'Save preferences': 'Salvar preferências',
    'Notification preferences saved.': 'Preferências de notificação salvas.',
    'Could not save notification preferences.':
      'Não foi possível salvar as preferências de notificação.',
    'Browser notifications': 'Notificações do navegador',
    'Show desktop notifications even when Xtimator is in a background tab.':
      'Mostrar notificações no desktop mesmo quando o Xtimator estiver em uma aba em segundo plano.',
    'Browser notifications not supported in this browser':
      'Notificações do navegador não são suportadas neste navegador',
    'Browser notifications not supported in this browser.':
      'Notificações do navegador não são suportadas neste navegador.',
    'Enabled — browser may show desktop alerts for new notifications.':
      'Ativado — o navegador pode mostrar alertas no desktop para novas notificações.',
    'Not enabled. Click the button to grant permission.':
      'Não ativado. Clique no botão para conceder permissão.',
    'Enable browser notifications': 'Ativar notificações do navegador',
    'Disable browser notifications': 'Desativar notificações do navegador',
    'Browser notifications enabled.': 'Notificações do navegador ativadas.',
    'Browser notifications disabled.': 'Notificações do navegador desativadas.',
    'Permission denied — enable in browser settings.':
      'Permissão negada — ative nas configurações do navegador.',
    'Could not enable browser notifications.':
      'Não foi possível ativar as notificações do navegador.',
    'Payments': 'Pagamentos',
    'Trial': 'Período de teste',
    'Quota': 'Cota',
    'WhatsApp': 'WhatsApp',
    'AI Jobs': 'Tarefas de IA',
    'Admin': 'Administração',
    'System': 'Sistema',
    'Views, accepts, declines, expirations.':
      'Visualizações, aceitos, recusas, expirações.',
    'Payments received and refunded.': 'Pagamentos recebidos e reembolsados.',
    'Trial expiring, expired, converted.':
      'Período de teste expirando, expirado, convertido.',
    'Plan usage warnings.': 'Avisos de uso do plano.',
    'Inbound voice and photo messages.':
      'Mensagens de voz e foto recebidas.',
    'Background job completion and failures.':
      'Conclusões e falhas de tarefas em segundo plano.',
    'Tier changes and bonus credits.':
      'Mudanças de plano e créditos bônus.',
    'Maintenance and platform announcements.':
      'Manutenção e avisos da plataforma.',

    // Public share page (client-facing estimate view) — pre-launch audit fix:
    // these ship in the static dict (not live-translated) so an anonymous
    // client's first view of the page never flashes English before the
    // translate API resolves.
    'Estimate Terms': 'Termos do Orçamento',
    'Invoices': 'Faturas',
    'deposit': 'entrada',
    'balance': 'saldo',
    'invoice': 'fatura',
    'Paid': 'Pago',
    'Pay': 'Pagar',
    'Estimate Accepted': 'Orçamento Aceito',
    'Estimate Declined': 'Orçamento Recusado',
    'Thank you for accepting this estimate': 'Obrigado por aceitar este orçamento',
    'This estimate has been declined': 'Este orçamento foi recusado',
    'Please review the estimate above and accept or decline.':
      'Revise o orçamento acima e aceite ou recuse.',
    'Accept Estimate': 'Aceitar Orçamento',
    'Decline Estimate': 'Recusar Orçamento',
    'Sign to accept this estimate': 'Assine para aceitar este orçamento',
    'Sign & Accept Estimate': 'Assinar e Aceitar Orçamento',
    'Your full name': 'Seu nome completo',
    'Email (optional)': 'E-mail (opcional)',
    'Signature': 'Assinatura',
    'Clear': 'Limpar',
    'Draw your signature above using your finger or mouse.':
      'Desenhe sua assinatura acima usando o dedo ou o mouse.',
    'By signing, you agree to the pricing and terms in this estimate.':
      'Ao assinar, você concorda com os preços e termos deste orçamento.',
    'Generated by': 'Gerado por',

    // Capture processing narration (components/capture/processing-narration.ts).
    // Pre-seeded rather than left to the runtime /api/translate fallback: the
    // quips rotate every 4.5s, and a per-quip round-trip would show English for
    // a beat and then swap mid-rotation, a visible flicker on the one screen
    // whose whole job is to feel calm.
    'Reading the job details': 'Lendo os detalhes do serviço',
    'Writing the scope of work': 'Escrevendo o escopo do serviço',
    'Pricing the line items': 'Precificando os itens',
    'Checking the numbers': 'Conferindo as contas',
    'Adding more detail': 'Detalhando melhor',
    'Putting the estimate together': 'Montando o orçamento',
    'Unrolling the blueprints': 'Desenrolando a planta',
    'Putting the tool belt on': 'Colocando o cinto de ferramentas',
    'Looking for the tape measure': 'Procurando a trena',
    'Walking the job in my head': 'Percorrendo a obra na cabeça',
    'Talking it over with the crew': 'Conversando com a equipe',
    'Writing it up line by line': 'Escrevendo linha por linha',
    'Thinking like a foreman': 'Pensando como mestre de obras',
    'Calling around for prices': 'Ligando para pedir preços',
    'Haggling with the supply house': 'Pechinchando no depósito',
    'Checking what this costs around here': 'Vendo quanto isso custa por aqui',
    'Measuring twice': 'Medindo duas vezes',
    'Squinting at the math': 'Olhando as contas de perto',
    'Looking for anything forgotten': 'Procurando o que ficou de fora',
    'Going back for a second look': 'Voltando para uma segunda olhada',
    'Filling in what the first pass missed': 'Completando o que faltou',
    'Being more specific this time': 'Sendo mais específico desta vez',
    'Stapling the pages together': 'Grampeando as páginas',
    'Sweeping up the job site': 'Varrendo a obra',
    'Making it presentable': 'Deixando apresentável',
    'Filing the paperwork': 'Arquivando os papéis',
    'Putting the notes somewhere safe': 'Guardando as anotações',
    'Listening to the walkthrough': 'Ouvindo a visita',
    'Turning the mumbling into words': 'Transformando o resmungo em texto',
    'Rewinding the tricky part': 'Voltando a parte difícil',
    'Squinting at the photos': 'Olhando as fotos de perto',
    'Zooming in on the details': 'Dando zoom nos detalhes',
    'Counting what is in frame': 'Contando o que aparece na foto',
    'items priced': 'itens precificados',
    'items to price': 'itens para precificar',
    'items in': 'itens em',
    'sections': 'seções',
    'Pass': 'Passada',
    'Bigger job than usual, still working on it':
      'Serviço maior que o normal, ainda trabalhando nele',
  },
  es: {
    // Navigation
    'Dashboard': 'Panel',
    'Clients': 'Clientes',
    'Projects': 'Proyectos',
    'Estimates': 'Presupuestos',
    'Settings': 'Configuración',
    'New Project': 'Nuevo Proyecto',
    'New Client': 'Nuevo Cliente',
    'Recordings': 'Grabaciones',
    'Photos': 'Fotos',
    'Activity': 'Actividad',

    // Buttons
    'Save': 'Guardar',
    'Cancel': 'Cancelar',
    'Delete': 'Eliminar',
    'Create': 'Crear',
    'Edit': 'Editar',
    'Submit': 'Enviar',
    'Back': 'Atrás',
    'Next': 'Siguiente',
    'Sign Out': 'Cerrar sesión',
    'Upload': 'Subir archivo',
    'Download': 'Descargar',
    'Send': 'Enviar',
    'Share': 'Compartir',
    'Copy': 'Copiar',
    'View': 'Ver',
    'Add': 'Agregar',
    'Remove': 'Quitar',
    'Confirm': 'Confirmar',
    'Close': 'Cerrar',
    'Search': 'Buscar',
    'Filter': 'Filtrar',
    'Sort': 'Ordenar',
    'Refresh': 'Actualizar',
    'Retry': 'Reintentar',
    'Retry transcription': 'Reintentar transcripción',
    'Continue': 'Continuar',

    // Status labels
    'Active': 'Activo',
    'Draft': 'Borrador',
    'Sent': 'Enviado',
    'Pending': 'Pendiente',
    'Cancelled': 'Cancelado',
    'Complete': 'Completo',
    'In Progress': 'En progreso',
    'Archived': 'Archivado',
    'Loading': 'Cargando',
    'Error': 'Error',

    // Form labels
    'Name': 'Nombre',
    'Email': 'Correo electrónico',
    'Phone': 'Teléfono',
    'Address': 'Dirección',
    'Company': 'Empresa',
    'Industry': 'Industria',
    'Description': 'Descripción',
    'Notes': 'Notas',
    'Search price book…': 'Buscar en catálogo…',
    'No matches': 'Sin resultados',
    'Date': 'Fecha',
    'Amount': 'Monto',
    'Total': 'Total',
    'Subtotal': 'Subtotal',
    'Tax': 'Impuesto',
    'Discount': 'Descuento',

    // Section headings
    'Overview': 'Resumen',
    'Audio': 'Audio',

    // Voice recorder — REC/pause controls (260707-ru5)
    'Paused': 'Pausado',
    'Pause recording': 'Pausar grabación',
    'Resume recording': 'Reanudar grabación',
    'Start recording': 'Iniciar grabación',
    'Stop recording': 'Detener grabación',

    // Table headers
    'Client': 'Cliente',
    'Type': 'Tipo',
    'Actions': 'Acciones',
    'Status': 'Estado',

    // Empty states
    'No clients yet': 'Sin clientes aún',
    'No projects yet': 'Sin proyectos aún',
    'No estimates yet': 'Sin presupuestos aún',
    'No recordings yet': 'Sin grabaciones aún',
    'No photos yet': 'Sin fotos aún',
    'No clients match your search': 'Ningún cliente coincide con tu búsqueda',
    'No projects match your search': 'Ningún proyecto coincide con tu búsqueda',
    'Add your first client to get started': 'Agrega tu primer cliente para comenzar',
    'Create your first project to get started': 'Crea tu primer proyecto para comenzar',
    'Try a different search term': 'Prueba con otro término de búsqueda',
    'Try a different search term or clear filters': 'Prueba otro término o limpia los filtros',

    // Action labels
    'Add Client': 'Agregar Cliente',
    'Delete Client': 'Eliminar Cliente',
    'Delete Project': 'Eliminar Proyecto',
    'Duplicate': 'Duplicar',
    'Duplicating...': 'Duplicando...',

    // Sort options
    'Newest': 'Más reciente',
    'Oldest': 'Más antiguo',
    'Highest Value': 'Mayor valor',
    'Alphabetical': 'Alfabético',

    // Common messages
    'Saving...': 'Guardando...',
    'Deleting...': 'Eliminando...',
    'Loading...': 'Cargando...',
    'Something went wrong': 'Algo salió mal',
    'Please try again': 'Por favor, inténtalo de nuevo',
    'Changes saved': 'Cambios guardados',
    'Deleted successfully': 'Eliminado con éxito',
    'Created successfully': 'Creado con éxito',

    // Modal / confirm
    'Are you sure?': '¿Estás seguro?',
    'This action cannot be undone': 'Esta acción no se puede deshacer',
    'Yes, delete it': 'Sí, eliminar',

    // Notifications (Phase 77)
    'Notifications': 'Notificaciones',
    'Mark all as read': 'Marcar todas como leídas',
    'See all': 'Ver todo',
    'All caught up': 'Todo al día',
    'Unread only': 'Solo no leídas',
    'Notification preferences': 'Preferencias de notificación',
    'Choose how you want to be notified for each event category.':
      'Elige cómo quieres recibir notificaciones para cada categoría de evento.',
    'Email digest enabled': 'Resumen por correo activado',
    'Master switch — turn off to silence every email notification.':
      'Interruptor maestro — desactívalo para silenciar todas las notificaciones por correo.',
    'Category': 'Categoría',
    // Price Book — folders/categories (quick-k60)
    'New Category': 'Nueva Categoría',
    'Delete Category': 'Eliminar Categoría',
    'Category name...': 'Nombre de la categoría...',
    'Category deleted': 'Categoría eliminada',
    'This will delete the category. Items in this category must be moved or deleted first.':
      'Esto eliminará la categoría. Los elementos de esta categoría deben moverse o eliminarse antes.',
    'In-app': 'En la app',
    'Save preferences': 'Guardar preferencias',
    'Notification preferences saved.': 'Preferencias de notificación guardadas.',
    'Could not save notification preferences.':
      'No se pudieron guardar las preferencias de notificación.',
    'Browser notifications': 'Notificaciones del navegador',
    'Show desktop notifications even when Xtimator is in a background tab.':
      'Mostrar notificaciones de escritorio incluso cuando Xtimator esté en una pestaña en segundo plano.',
    'Browser notifications not supported in this browser':
      'Las notificaciones del navegador no son compatibles con este navegador',
    'Browser notifications not supported in this browser.':
      'Las notificaciones del navegador no son compatibles con este navegador.',
    'Enabled — browser may show desktop alerts for new notifications.':
      'Activado — el navegador puede mostrar alertas de escritorio para nuevas notificaciones.',
    'Not enabled. Click the button to grant permission.':
      'No activado. Haz clic en el botón para conceder permiso.',
    'Enable browser notifications': 'Activar notificaciones del navegador',
    'Disable browser notifications': 'Desactivar notificaciones del navegador',
    'Browser notifications enabled.': 'Notificaciones del navegador activadas.',
    'Browser notifications disabled.': 'Notificaciones del navegador desactivadas.',
    'Permission denied — enable in browser settings.':
      'Permiso denegado — actívalo en la configuración del navegador.',
    'Could not enable browser notifications.':
      'No se pudieron activar las notificaciones del navegador.',
    'Payments': 'Pagos',
    'Trial': 'Período de prueba',
    'Quota': 'Cuota',
    'WhatsApp': 'WhatsApp',
    'AI Jobs': 'Tareas de IA',
    'Admin': 'Administración',
    'System': 'Sistema',
    'Views, accepts, declines, expirations.':
      'Vistas, aceptaciones, rechazos, expiraciones.',
    'Payments received and refunded.': 'Pagos recibidos y reembolsados.',
    'Trial expiring, expired, converted.':
      'Período de prueba expirando, expirado, convertido.',
    'Plan usage warnings.': 'Avisos de uso del plan.',
    'Inbound voice and photo messages.':
      'Mensajes de voz y fotos entrantes.',
    'Background job completion and failures.':
      'Finalización y fallos de tareas en segundo plano.',
    'Tier changes and bonus credits.':
      'Cambios de plan y créditos de bonificación.',
    'Maintenance and platform announcements.':
      'Mantenimiento y anuncios de la plataforma.',

    // Public share page (client-facing estimate view) — pre-launch audit fix:
    // these ship in the static dict (not live-translated) so an anonymous
    // client's first view of the page never flashes English before the
    // translate API resolves.
    'Estimate Terms': 'Términos del Presupuesto',
    'Invoices': 'Facturas',
    'deposit': 'depósito',
    'balance': 'saldo',
    'invoice': 'factura',
    'Paid': 'Pagado',
    'Pay': 'Pagar',
    'Estimate Accepted': 'Presupuesto Aceptado',
    'Estimate Declined': 'Presupuesto Rechazado',
    'Thank you for accepting this estimate': 'Gracias por aceptar este presupuesto',
    'This estimate has been declined': 'Este presupuesto ha sido rechazado',
    'Please review the estimate above and accept or decline.':
      'Revise el presupuesto anterior y acéptelo o recházelo.',
    'Accept Estimate': 'Aceptar Presupuesto',
    'Decline Estimate': 'Rechazar Presupuesto',
    'Sign to accept this estimate': 'Firme para aceptar este presupuesto',
    'Sign & Accept Estimate': 'Firmar y Aceptar Presupuesto',
    'Your full name': 'Su nombre completo',
    'Email (optional)': 'Correo electrónico (opcional)',
    'Signature': 'Firma',
    'Clear': 'Borrar',
    'Draw your signature above using your finger or mouse.':
      'Dibuje su firma arriba usando el dedo o el mouse.',
    'By signing, you agree to the pricing and terms in this estimate.':
      'Al firmar, aceptas los precios y términos de este presupuesto.',
    'Generated by': 'Generado por',

    // Capture processing narration: see the pt block for why these are
    // pre-seeded instead of left to the runtime translation fallback.
    'Reading the job details': 'Leyendo los detalles del trabajo',
    'Writing the scope of work': 'Redactando el alcance del trabajo',
    'Pricing the line items': 'Poniendo precio a las partidas',
    'Checking the numbers': 'Revisando los números',
    'Adding more detail': 'Agregando más detalle',
    'Putting the estimate together': 'Armando el presupuesto',
    'Unrolling the blueprints': 'Desenrollando los planos',
    'Putting the tool belt on': 'Poniéndose el cinturón de herramientas',
    'Looking for the tape measure': 'Buscando la cinta métrica',
    'Walking the job in my head': 'Recorriendo la obra mentalmente',
    'Talking it over with the crew': 'Consultándolo con la cuadrilla',
    'Writing it up line by line': 'Escribiéndolo línea por línea',
    'Thinking like a foreman': 'Pensando como capataz',
    'Calling around for prices': 'Llamando para pedir precios',
    'Haggling with the supply house': 'Regateando en el depósito',
    'Checking what this costs around here': 'Viendo cuánto cuesta esto por aquí',
    'Measuring twice': 'Midiendo dos veces',
    'Squinting at the math': 'Mirando las cuentas de cerca',
    'Looking for anything forgotten': 'Buscando lo que quedó afuera',
    'Going back for a second look': 'Volviendo para una segunda mirada',
    'Filling in what the first pass missed': 'Completando lo que faltó',
    'Being more specific this time': 'Siendo más específico esta vez',
    'Stapling the pages together': 'Engrapando las páginas',
    'Sweeping up the job site': 'Barriendo la obra',
    'Making it presentable': 'Dejándolo presentable',
    'Filing the paperwork': 'Archivando los papeles',
    'Putting the notes somewhere safe': 'Guardando las notas',
    'Listening to the walkthrough': 'Escuchando el recorrido',
    'Turning the mumbling into words': 'Convirtiendo el murmullo en palabras',
    'Rewinding the tricky part': 'Rebobinando la parte difícil',
    'Squinting at the photos': 'Mirando las fotos de cerca',
    'Zooming in on the details': 'Ampliando los detalles',
    'Counting what is in frame': 'Contando lo que aparece en la foto',
    'items priced': 'partidas con precio',
    'items to price': 'partidas por cotizar',
    'items in': 'partidas en',
    'sections': 'secciones',
    'Pass': 'Pasada',
    'Bigger job than usual, still working on it':
      'Trabajo más grande de lo normal, seguimos en ello',
  },
}
