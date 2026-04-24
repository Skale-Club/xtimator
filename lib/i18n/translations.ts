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
    'Date': 'Data',
    'Amount': 'Valor',
    'Total': 'Total',
    'Subtotal': 'Subtotal',
    'Tax': 'Imposto',
    'Discount': 'Desconto',

    // Section headings
    'Overview': 'Visão geral',
    'Audio': 'Áudio',

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
    'Date': 'Fecha',
    'Amount': 'Monto',
    'Total': 'Total',
    'Subtotal': 'Subtotal',
    'Tax': 'Impuesto',
    'Discount': 'Descuento',

    // Section headings
    'Overview': 'Resumen',
    'Audio': 'Audio',

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
  },
}
