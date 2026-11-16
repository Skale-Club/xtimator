/**
 * Static pt/es copy for the estimate editor's v2 frame
 * (components/workspace/editor-frame/): top bar, docked action bar and the
 * status sheet. Keys are the exact English strings passed to t(). Spread into
 * staticDict in translations.ts, so these never wait on the async translation
 * batch.
 */
type Dict = Record<string, string>

export const editorTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    // Top bar
    'Back to projects': 'Voltar para projetos',
    'Not saved': 'Não salvo',
    'Try again': 'Tentar de novo',
    'Unsaved changes': 'Alterações não salvas',
    'viewed': 'visto',
    'Viewed': 'Visto',
    'Accepted': 'Aceito',
    'Declined': 'Recusado',
    'Estimate accepted.': 'Orçamento aceito.',
    'Estimate declined.': 'Orçamento recusado.',
    'Shared with the client.': 'Compartilhado com o cliente.',
    'The content is locked.': 'O conteúdo está travado.',
    'See status': 'Ver situação',
    // Dock
    'Options': 'Ajustes',
    'AI edit': 'Editar IA',
    'Edit with AI': 'Editar com IA',
    'Width': 'Largura',
    'Page': 'Página',
    // Status sheet
    'Estimate status': 'Situação do orçamento',
    'Created': 'Criado',
    'Shared': 'Compartilhado',
    'Not shared yet. The client’s answer shows up here after you share the estimate.':
      'Ainda não foi compartilhado. A resposta do cliente aparece aqui depois que você compartilhar o orçamento.',
  },
  es: {
    // Top bar
    'Back to projects': 'Volver a proyectos',
    'Not saved': 'No guardado',
    'Try again': 'Reintentar',
    'Unsaved changes': 'Cambios sin guardar',
    'viewed': 'visto',
    'Viewed': 'Visto',
    'Accepted': 'Aceptado',
    'Declined': 'Rechazado',
    'Estimate accepted.': 'Presupuesto aceptado.',
    'Estimate declined.': 'Presupuesto rechazado.',
    'Shared with the client.': 'Compartido con el cliente.',
    'The content is locked.': 'El contenido está bloqueado.',
    'See status': 'Ver estado',
    // Dock
    'Options': 'Ajustes',
    'AI edit': 'Editar IA',
    'Edit with AI': 'Editar con IA',
    'Width': 'Ancho',
    'Page': 'Página',
    // Status sheet
    'Estimate status': 'Estado del presupuesto',
    'Created': 'Creado',
    'Shared': 'Compartido',
    'Not shared yet. The client’s answer shows up here after you share the estimate.':
      'Aún no se ha compartido. La respuesta del cliente aparece aquí después de compartir el presupuesto.',
  },
}
