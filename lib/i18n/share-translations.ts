/**
 * Static pt/es copy for the editor's Share estimate sheet
 * (components/workspace/send/send-hub-dialog.tsx). Keys are the exact English
 * strings passed to t(). Spread into staticDict in translations.ts, so these
 * never wait on the async translation batch.
 */
type Dict = Record<string, string>

export const shareTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    'Awaiting answer': 'Aguardando resposta',
    // Public estimate page (components/share, app/estimate/[token])
    'This estimate link has expired': 'Este link do orçamento expirou',
    'For your security, estimate links expire after a period of inactivity. Please ask the sender to re-send the estimate — that will give you a fresh, working link.': 'Por segurança, os links de orçamento expiram após um período sem uso. Peça a quem enviou para reenviar o orçamento: você receberá um link novo e funcionando.',
    'This estimate is password-protected': 'Este orçamento é protegido por senha',
    'Enter the password provided by': 'Digite a senha fornecida por',
    'Password': 'Senha',
    'Unlock estimate': 'Desbloquear orçamento',
    'Incorrect password. Please try again.': 'Senha incorreta. Tente novamente.',
    'Something went wrong. Please try again.': 'Algo deu errado. Tente novamente.',
    'This link is no longer available. Please reload the page.': 'Este link não está mais disponível. Recarregue a página.',
    'Remaining, not yet invoiced': 'Restante, ainda não faturado',
    'Share estimate': 'Compartilhar orçamento',
    'Copy the link or the message and send it from your own apps.': 'Copie o link ou a mensagem e envie pelos seus próprios apps.',
    // Online estimate block
    'Online estimate': 'Orçamento online',
    'Not opened yet': 'Ainda não aberto',
    'Opened': 'Aberto',
    'time': 'vez',
    'times': 'vezes',
    'Accepted on': 'Aceito em',
    'Declined on': 'Recusado em',
    'Copy link': 'Copiar link',
    'Link copied': 'Link copiado',
    'Open': 'Abrir',
    'Paste it where you already talk to the client.': 'Cole onde você já conversa com o cliente.',
    'View engagement': 'Ver engajamento',
    'Failed to copy link': 'Não foi possível copiar o link',
    // Password
    'No password': 'Sem senha',
    'Add password': 'Proteger com senha',
    'Password protected': 'Protegido por senha',
    'Remove': 'Remover',
    'Set a password': 'Defina uma senha',
    'Remember to send the password to the client through another channel.': 'Lembre de mandar a senha para o cliente por outro canal.',
    'Password set': 'Senha definida',
    'Password removed': 'Senha removida',
    'Failed to update the estimate password.': 'Não foi possível atualizar a senha do orçamento.',
    // Ready message
    'Ready message': 'Mensagem pronta',
    'Edited': 'Editada',
    'Copy': 'Copiar',
    'Copied!': 'Copiado!',
    'Message copied': 'Mensagem copiada',
    'Failed to copy message': 'Não foi possível copiar a mensagem',
    'The estimate link goes at the end of the copied message.': 'O link do orçamento vai no fim da mensagem copiada.',
    'Restore the original text': 'Restaurar o texto original',
    // Ready to send? checklist
    'Ready to send?': 'Pronto para enviar?',
    'Ready to send': 'Tudo pronto para enviar',
    '{ok} of {total} ok': '{ok} de {total} ok',
    'Client details filled in': 'Cliente preenchido',
    'No client yet': 'Nenhum cliente ainda',
    'Add': 'Adicionar',
    'item without a price': 'item sem preço',
    'items without a price': 'itens sem preço',
    'Set': 'Definir',
    'AI price to check': 'preço da IA para conferir',
    'AI prices to check': 'preços da IA para conferir',
    'Check': 'Conferir',
    'All items priced': 'Todos os itens com preço',
    'AI question unanswered': 'pergunta da IA sem resposta',
    'AI questions unanswered': 'perguntas da IA sem resposta',
    'Answer': 'Responder',
    'AI questions answered': 'Perguntas da IA respondidas',
    // PDF
    'Download PDF': 'Baixar PDF',
  },
  es: {
    'Awaiting answer': 'Esperando respuesta',
    // Public estimate page (components/share, app/estimate/[token])
    'This estimate link has expired': 'Este enlace del presupuesto ha caducado',
    'For your security, estimate links expire after a period of inactivity. Please ask the sender to re-send the estimate — that will give you a fresh, working link.': 'Por seguridad, los enlaces de presupuesto caducan tras un período sin uso. Pide a quien lo envió que reenvíe el presupuesto: recibirás un enlace nuevo y funcional.',
    'This estimate is password-protected': 'Este presupuesto está protegido con contraseña',
    'Enter the password provided by': 'Introduce la contraseña proporcionada por',
    'Password': 'Contraseña',
    'Unlock estimate': 'Desbloquear presupuesto',
    'Incorrect password. Please try again.': 'Contraseña incorrecta. Inténtalo de nuevo.',
    'Something went wrong. Please try again.': 'Algo salió mal. Inténtalo de nuevo.',
    'This link is no longer available. Please reload the page.': 'Este enlace ya no está disponible. Recarga la página.',
    'Remaining, not yet invoiced': 'Restante, aún sin facturar',
    'Share estimate': 'Compartir presupuesto',
    'Copy the link or the message and send it from your own apps.': 'Copia el enlace o el mensaje y envíalo desde tus propias apps.',
    // Online estimate block
    'Online estimate': 'Presupuesto en línea',
    'Not opened yet': 'Aún no abierto',
    'Opened': 'Abierto',
    'time': 'vez',
    'times': 'veces',
    'Accepted on': 'Aceptado el',
    'Declined on': 'Rechazado el',
    'Copy link': 'Copiar enlace',
    'Link copied': 'Enlace copiado',
    'Open': 'Abrir',
    'Paste it where you already talk to the client.': 'Pégalo donde ya hablas con el cliente.',
    'View engagement': 'Ver interacción',
    'Failed to copy link': 'No se pudo copiar el enlace',
    // Password
    'No password': 'Sin contraseña',
    'Add password': 'Añadir contraseña',
    'Password protected': 'Protegido con contraseña',
    'Remove': 'Quitar',
    'Set a password': 'Define una contraseña',
    'Remember to send the password to the client through another channel.': 'Recuerda enviar la contraseña al cliente por otro canal.',
    'Password set': 'Contraseña definida',
    'Password removed': 'Contraseña eliminada',
    'Failed to update the estimate password.': 'No se pudo actualizar la contraseña del presupuesto.',
    // Ready message
    'Ready message': 'Mensaje listo',
    'Edited': 'Editado',
    'Copy': 'Copiar',
    'Copied!': '¡Copiado!',
    'Message copied': 'Mensaje copiado',
    'Failed to copy message': 'No se pudo copiar el mensaje',
    'The estimate link goes at the end of the copied message.': 'El enlace del presupuesto va al final del mensaje copiado.',
    'Restore the original text': 'Restaurar el texto original',
    // Ready to send? checklist
    'Ready to send?': '¿Listo para enviar?',
    'Ready to send': 'Todo listo para enviar',
    '{ok} of {total} ok': '{ok} de {total} ok',
    'Client details filled in': 'Cliente completado',
    'No client yet': 'Aún no hay cliente',
    'Add': 'Agregar',
    'item without a price': 'ítem sin precio',
    'items without a price': 'ítems sin precio',
    'Set': 'Definir',
    'AI price to check': 'precio de la IA por revisar',
    'AI prices to check': 'precios de la IA por revisar',
    'Check': 'Revisar',
    'All items priced': 'Todos los ítems con precio',
    'AI question unanswered': 'pregunta de la IA sin respuesta',
    'AI questions unanswered': 'preguntas de la IA sin respuesta',
    'Answer': 'Responder',
    'AI questions answered': 'Preguntas de la IA respondidas',
    // PDF
    'Download PDF': 'Descargar PDF',
  },
}

/**
 * Static lookup for server components (no hook): the pt/es copy of an English
 * share string, or the English string itself for 'en' / an unknown key.
 */
export function shareText(language: 'en' | 'pt' | 'es' | null | undefined, english: string): string {
  if (language !== 'pt' && language !== 'es') return english
  return shareTranslations[language][english] ?? english
}
