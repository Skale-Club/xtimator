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
    'The client has already answered this estimate, so it can no longer be edited.': 'O cliente já respondeu este orçamento, então ele não pode mais ser editado.',
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
    'See status': 'Ver situação',
    'Changes you make show up on their link.': 'O que você mudar aparece no link do cliente.',
    'This is the contract and it can’t be edited.': 'É o contrato e não pode mais ser editado.',
    'Revise it and reopen it so the client can answer again.': 'Revise e reabra para o cliente responder de novo.',
    'Revise and reopen': 'Revisar e reabrir',
    'Estimate locked.': 'Orçamento travado.',
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
    'The client has already answered this estimate, so it can no longer be edited.': 'El cliente ya respondió este presupuesto, así que ya no se puede editar.',
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
    'See status': 'Ver estado',
    'Changes you make show up on their link.': 'Lo que cambies aparece en el enlace del cliente.',
    'This is the contract and it can’t be edited.': 'Es el contrato y ya no se puede editar.',
    'Revise it and reopen it so the client can answer again.': 'Revísalo y reábrelo para que el cliente responda de nuevo.',
    'Revise and reopen': 'Revisar y reabrir',
    'Estimate locked.': 'Presupuesto bloqueado.',
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
