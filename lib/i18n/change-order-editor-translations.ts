/**
 * Static pt/es copy for change orders (change-order-editor-translations). Keys are the exact English
 * strings passed to t(). Spread into staticDict in translations.ts.
 *
 * Placeholders in braces ({numbers}, {amount}, ...) are filled by the component after t().
 */
type Dict = Record<string, string>

export const changeOrderEditorTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    'Approved without an online signature (recorded by you).': 'Aprovado sem assinatura online (registrado por você).',
    // Contract card
    'Contract': 'Contrato',
    'Contract total': 'Total do contrato',
    'Accepted estimate': 'Orçamento aceito',
    'New change order': 'Novo aditivo',
    '{n} change order': '{n} aditivo',
    '{n} change orders': '{n} aditivos',
    'Change order': 'Aditivo',
    'Untitled': 'Sem título',
    'accepted': 'aceito em',
    'signed': 'assinado em',
    'If {numbers} is approved, the contract becomes {amount}.': 'Se o {numbers} for aprovado, o contrato passa a ser {amount}.',
    'If {numbers} are approved, the contract becomes {amount}.': 'Se os {numbers} forem aprovados, o contrato passa a ser {amount}.',
    'No change orders yet. Change something in the work? Create a change order and the client approves it separately.':
      'Nenhum aditivo ainda. Mudou algo na obra? Crie um aditivo e o cliente aprova separadamente.',
    'Could not load the contract.': 'Não foi possível carregar o contrato.',
    'Could not create the change order. Try again.': 'Não foi possível criar o aditivo. Tente de novo.',
    // Top bar and banner
    'Back to contract': 'Voltar ao contrato',
    'Change order status': 'Status do aditivo',
    'Approved.': 'Aprovado.',
    'Declined.': 'Recusado.',
    'It’s part of the contract and can’t be edited.': 'Faz parte do contrato e não pode ser editado.',
    'Signed by': 'Assinado por',
    // Status sheet
    'Mark as approved': 'Marcar como aprovado',
    'Mark as approved?': 'Marcar como aprovado?',
    'The change order becomes editable again.': 'O aditivo volta a ser editável.',
    'This records the answer you got from the client and locks the change order. You can clear it later.':
      'Isto registra a resposta que você recebeu do cliente e trava o aditivo. Você pode limpar depois.',
    'Not shared yet. The client’s answer shows up here after you share the change order.':
      'Ainda não foi compartilhado. A resposta do cliente aparece aqui depois que você compartilhar o aditivo.',
    // Paper
    'To estimate': 'Ao orçamento',
    'To the accepted estimate': 'Ao orçamento aceito',
    'accepted on': 'aceito em',
    'by': 'por',
    'Title': 'Título',
    'Reason': 'Motivo',
    'What is this change?': 'O que está mudando?',
    'Why the work changed (optional)': 'Por que o serviço mudou (opcional)',
    'What changes': 'O que muda',
    'Add item': 'Adicionar item',
    'Add credit': 'Adicionar crédito',
    'Extra days': 'Dias extras',
    'Taxable': 'Tributável',
    'taxable': 'tributável',
    'Describe the work': 'Descreva o serviço',
    'No items yet. Add work or a credit.': 'Nenhum item ainda. Adicione serviço ou um crédito.',
    'description': 'descrição',
    'quantity': 'quantidade',
    'unit': 'unidade',
    'ea': 'un',
    'unit price': 'preço unitário',
    'credit amount': 'valor do crédito',
    'is a credit': 'é um crédito',
    'Client signature': 'Assinatura do cliente',
    'The client signs when you share this change order.': 'O cliente assina quando você compartilhar este aditivo.',
    'Approval is recorded manually after you share this change order.':
      'A aprovação é registrada manualmente depois que você compartilhar este aditivo.',
    // Dock, delete, save
    'PDF': 'PDF',
    'Delete this change order?': 'Excluir este aditivo?',
    'It was never shared, so nothing changes for the client. This can’t be undone.':
      'Ele nunca foi compartilhado, então nada muda para o cliente. Isto não pode ser desfeito.',
    'Reload': 'Recarregar',
    'This change order was changed somewhere else.': 'Este aditivo foi alterado em outro lugar.',
    'The client has already answered this change order, so it can no longer be edited.':
      'O cliente já respondeu a este aditivo, então ele não pode mais ser editado.',
    'Could not save your changes. Try again.': 'Não foi possível salvar suas alterações. Tente de novo.',
    'Could not delete the change order. Try again.': 'Não foi possível excluir o aditivo. Tente de novo.',
    'Could not record the response. Try again.': 'Não foi possível registrar a resposta. Tente de novo.',
    // Share sheet
    'Share change order': 'Compartilhar aditivo',
    'Online change order': 'Aditivo online',
    'Reset message': 'Restaurar mensagem',
    'Copying the message adds the link at the end.': 'Ao copiar a mensagem, o link é adicionado no final.',
    'Could not copy. Select the text and copy it by hand.': 'Não foi possível copiar. Selecione o texto e copie manualmente.',
    'Hi{name}, here is change order #{number} for {project}{title}. It adds {amount} to the contract. Please review and approve it here:':
      'Olá{name}, segue o aditivo #{number} de {project}{title}. Ele acrescenta {amount} ao contrato. Por favor, revise e aprove aqui:',
    'Hi{name}, here is change order #{number} for {project}{title}. It removes {amount} from the contract. Please review and approve it here:':
      'Olá{name}, segue o aditivo #{number} de {project}{title}. Ele reduz {amount} do contrato. Por favor, revise e aprove aqui:',
    'Hi{name}, here is change order #{number} for {project}{title}. It does not change the contract total. Please review and approve it here:':
      'Olá{name}, segue o aditivo #{number} de {project}{title}. Ele não altera o total do contrato. Por favor, revise e aprove aqui:',
    'Invoice': 'Fatura',
    'Send invoice': 'Enviar fatura',
    'Invoice sent': 'Fatura enviada',
    'Invoiced': 'Faturado',
    'View invoice': 'Ver fatura',
    'Invoice for change order #{number}': 'Fatura do aditivo nº {number}',
    'The client gets a Stripe invoice by email, due in 7 days.': 'O cliente recebe uma fatura do Stripe por e-mail, com vencimento em 7 dias.',
    'Credits are applied to the balance invoice.': 'Os créditos são aplicados na fatura do saldo.',
    'Could not send the invoice. Try again.': 'Não foi possível enviar a fatura. Tente de novo.',
    'Deposit': 'Entrada',
    'Estimate + change orders': 'Orçamento + aditivos',
  },
  es: {
    'Approved without an online signature (recorded by you).': 'Aprobado sin firma en línea (registrado por ti).',
    // Contract card
    'Contract': 'Contrato',
    'Contract total': 'Total del contrato',
    'Accepted estimate': 'Presupuesto aceptado',
    'New change order': 'Nueva orden de cambio',
    '{n} change order': '{n} orden de cambio',
    '{n} change orders': '{n} órdenes de cambio',
    'Change order': 'Orden de cambio',
    'Untitled': 'Sin título',
    'accepted': 'aceptado el',
    'signed': 'firmado el',
    'If {numbers} is approved, the contract becomes {amount}.': 'Si se aprueba la {numbers}, el contrato pasa a ser {amount}.',
    'If {numbers} are approved, the contract becomes {amount}.': 'Si se aprueban las {numbers}, el contrato pasa a ser {amount}.',
    'No change orders yet. Change something in the work? Create a change order and the client approves it separately.':
      'Aún no hay órdenes de cambio. ¿Cambió algo en la obra? Cree una orden de cambio y el cliente la aprueba por separado.',
    'Could not load the contract.': 'No se pudo cargar el contrato.',
    'Could not create the change order. Try again.': 'No se pudo crear la orden de cambio. Inténtelo de nuevo.',
    // Top bar and banner
    'Back to contract': 'Volver al contrato',
    'Change order status': 'Estado de la orden de cambio',
    'Approved.': 'Aprobada.',
    'Declined.': 'Rechazada.',
    'It’s part of the contract and can’t be edited.': 'Forma parte del contrato y no se puede editar.',
    'Signed by': 'Firmado por',
    // Status sheet
    'Mark as approved': 'Marcar como aprobada',
    'Mark as approved?': '¿Marcar como aprobada?',
    'The change order becomes editable again.': 'La orden de cambio vuelve a ser editable.',
    'This records the answer you got from the client and locks the change order. You can clear it later.':
      'Esto registra la respuesta que recibió del cliente y bloquea la orden de cambio. Puede borrarla después.',
    'Not shared yet. The client’s answer shows up here after you share the change order.':
      'Aún no se ha compartido. La respuesta del cliente aparece aquí después de compartir la orden de cambio.',
    // Paper
    'To estimate': 'Al presupuesto',
    'To the accepted estimate': 'Al presupuesto aceptado',
    'accepted on': 'aceptado el',
    'by': 'por',
    'Title': 'Título',
    'Reason': 'Motivo',
    'What is this change?': '¿Qué cambia?',
    'Why the work changed (optional)': 'Por qué cambió el trabajo (opcional)',
    'What changes': 'Qué cambia',
    'Add item': 'Agregar partida',
    'Add credit': 'Agregar crédito',
    'Extra days': 'Días extra',
    'Taxable': 'Gravable',
    'taxable': 'gravable',
    'Describe the work': 'Describa el trabajo',
    'No items yet. Add work or a credit.': 'Aún no hay partidas. Agregue trabajo o un crédito.',
    'description': 'descripción',
    'quantity': 'cantidad',
    'unit': 'unidad',
    'ea': 'ud',
    'unit price': 'precio unitario',
    'credit amount': 'monto del crédito',
    'is a credit': 'es un crédito',
    'Client signature': 'Firma del cliente',
    'The client signs when you share this change order.': 'El cliente firma cuando usted comparte esta orden de cambio.',
    'Approval is recorded manually after you share this change order.':
      'La aprobación se registra manualmente después de compartir esta orden de cambio.',
    // Dock, delete, save
    'PDF': 'PDF',
    'Delete this change order?': '¿Eliminar esta orden de cambio?',
    'It was never shared, so nothing changes for the client. This can’t be undone.':
      'Nunca se compartió, así que nada cambia para el cliente. Esto no se puede deshacer.',
    'Reload': 'Recargar',
    'This change order was changed somewhere else.': 'Esta orden de cambio se modificó en otro lugar.',
    'The client has already answered this change order, so it can no longer be edited.':
      'El cliente ya respondió a esta orden de cambio, así que ya no se puede editar.',
    'Could not save your changes. Try again.': 'No se pudieron guardar los cambios. Inténtelo de nuevo.',
    'Could not delete the change order. Try again.': 'No se pudo eliminar la orden de cambio. Inténtelo de nuevo.',
    'Could not record the response. Try again.': 'No se pudo registrar la respuesta. Inténtelo de nuevo.',
    // Share sheet
    'Share change order': 'Compartir orden de cambio',
    'Online change order': 'Orden de cambio en línea',
    'Reset message': 'Restablecer mensaje',
    'Copying the message adds the link at the end.': 'Al copiar el mensaje se agrega el enlace al final.',
    'Could not copy. Select the text and copy it by hand.': 'No se pudo copiar. Seleccione el texto y cópielo a mano.',
    'Hi{name}, here is change order #{number} for {project}{title}. It adds {amount} to the contract. Please review and approve it here:':
      'Hola{name}, le comparto la orden de cambio #{number} de {project}{title}. Agrega {amount} al contrato. Por favor, revísela y apruébela aquí:',
    'Hi{name}, here is change order #{number} for {project}{title}. It removes {amount} from the contract. Please review and approve it here:':
      'Hola{name}, le comparto la orden de cambio #{number} de {project}{title}. Reduce {amount} del contrato. Por favor, revísela y apruébela aquí:',
    'Hi{name}, here is change order #{number} for {project}{title}. It does not change the contract total. Please review and approve it here:':
      'Hola{name}, le comparto la orden de cambio #{number} de {project}{title}. No cambia el total del contrato. Por favor, revísela y apruébela aquí:',
    'Invoice': 'Factura',
    'Send invoice': 'Enviar factura',
    'Invoice sent': 'Factura enviada',
    'Invoiced': 'Facturado',
    'View invoice': 'Ver factura',
    'Invoice for change order #{number}': 'Factura de la orden de cambio #{number}',
    'The client gets a Stripe invoice by email, due in 7 days.': 'El cliente recibe una factura de Stripe por correo, con vencimiento en 7 días.',
    'Credits are applied to the balance invoice.': 'Los créditos se aplican a la factura del saldo.',
    'Could not send the invoice. Try again.': 'No se pudo enviar la factura. Inténtelo de nuevo.',
    'Deposit': 'Anticipo',
    'Estimate + change orders': 'Presupuesto + órdenes de cambio',
  },
}
