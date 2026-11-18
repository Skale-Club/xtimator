/**
 * Static pt/es copy for change orders (change-order-public-translations). Keys are the exact English
 * strings passed to t(). Spread into staticDict in translations.ts.
 *
 * Used by the client page (components/share/change-order-view.tsx), the contract
 * block of the accepted estimate's page (components/share/contract-section.tsx)
 * and the estimate language of the change order PDF.
 */
type Dict = Record<string, string>

const pt: Dict = {
  'Change order': 'Aditivo',
  'Change order #{n}': 'Aditivo nº {n}',
  'Change order {number}': 'Aditivo {number}',
  'Change order #{n} · estimate {estimate}': 'Aditivo nº {n} · orçamento {estimate}',
  '{company} asks for your approval of a change to the work accepted on {date}.':
    '{company} pede a sua aprovação para uma alteração no serviço aceito em {date}.',
  '{company} asks for your approval of a change to the accepted work.':
    '{company} pede a sua aprovação para uma alteração no serviço aceito.',
  'Reason': 'Motivo',
  'What changes': 'O que muda',
  'Credit': 'Crédito',
  'Current contract': 'Contrato atual',
  'This change order': 'Este aditivo',
  'New total': 'Novo total',
  'Includes tax of {amount}': 'Inclui imposto de {amount}',
  'Extra time': 'Prazo extra',
  '+{n} day': '+{n} dia',
  '+{n} days': '+{n} dias',
  'See the accepted estimate': 'Ver o orçamento aceito',
  'Approve and sign': 'Aprovar e assinar',
  'Decline': 'Recusar',
  'Decline this change order?': 'Recusar este aditivo?',
  'To approve this change, contact {company}.': 'Para aprovar esta alteração, fale com {company}.',
  'Sign to approve this change order': 'Assine para aprovar este aditivo',
  'By signing, you approve this change and the new contract total.':
    'Ao assinar, você aprova esta alteração e o novo total do contrato.',
  'Sign & Approve': 'Assinar e aprovar',
  'Please enter your full name.': 'Digite seu nome completo.',
  'Please draw your signature.': 'Desenhe sua assinatura.',
  'Change order approved': 'Aditivo aprovado',
  'Change order declined': 'Aditivo recusado',
  'Approved': 'Aprovado',
  'Approved on {date}': 'Aprovado em {date}',
  'Declined on {date}': 'Recusado em {date}',
  'Signed by {name}': 'Assinado por {name}',
  "You're viewing your own change order. This visit isn't counted.":
    'Você está vendo o seu próprio aditivo. Esta visita não é contada.',
  'This change order was just updated. Review the latest version before signing.':
    'Este aditivo acabou de ser atualizado. Revise a versão mais recente antes de assinar.',
  'This change order was already answered.': 'Este aditivo já foi respondido.',
  "This change order can't be approved right now. Contact {company}.":
    'Este aditivo não pode ser aprovado agora. Fale com {company}.',
  'This change order is still being prepared.': 'Este aditivo ainda está sendo preparado.',
  'Change orders': 'Aditivos',
  'Contract total': 'Total do contrato',
  'Awaiting your approval: {n}': 'Aguardando sua aprovação: {n}',
  'Invoice for this change order': 'Fatura deste aditivo',
  'Pay invoice': 'Pagar fatura',
}

const es: Dict = {
  'Change order': 'Orden de cambio',
  'Change order #{n}': 'Orden de cambio n.º {n}',
  'Change order {number}': 'Orden de cambio {number}',
  'Change order #{n} · estimate {estimate}': 'Orden de cambio n.º {n} · presupuesto {estimate}',
  '{company} asks for your approval of a change to the work accepted on {date}.':
    '{company} solicita su aprobación para un cambio en el trabajo aceptado el {date}.',
  '{company} asks for your approval of a change to the accepted work.':
    '{company} solicita su aprobación para un cambio en el trabajo aceptado.',
  'Reason': 'Motivo',
  'What changes': 'Qué cambia',
  'Credit': 'Crédito',
  'Current contract': 'Contrato actual',
  'This change order': 'Esta orden de cambio',
  'New total': 'Nuevo total',
  'Includes tax of {amount}': 'Incluye impuesto de {amount}',
  'Extra time': 'Plazo adicional',
  '+{n} day': '+{n} día',
  '+{n} days': '+{n} días',
  'See the accepted estimate': 'Ver el presupuesto aceptado',
  'Approve and sign': 'Aprobar y firmar',
  'Decline': 'Rechazar',
  'Decline this change order?': '¿Rechazar esta orden de cambio?',
  'To approve this change, contact {company}.': 'Para aprobar este cambio, comuníquese con {company}.',
  'Sign to approve this change order': 'Firme para aprobar esta orden de cambio',
  'By signing, you approve this change and the new contract total.':
    'Al firmar, usted aprueba este cambio y el nuevo total del contrato.',
  'Sign & Approve': 'Firmar y aprobar',
  'Please enter your full name.': 'Escriba su nombre completo.',
  'Please draw your signature.': 'Dibuje su firma.',
  'Change order approved': 'Orden de cambio aprobada',
  'Change order declined': 'Orden de cambio rechazada',
  'Approved': 'Aprobada',
  'Approved on {date}': 'Aprobada el {date}',
  'Declined on {date}': 'Rechazada el {date}',
  'Signed by {name}': 'Firmado por {name}',
  "You're viewing your own change order. This visit isn't counted.":
    'Está viendo su propia orden de cambio. Esta visita no se cuenta.',
  'This change order was just updated. Review the latest version before signing.':
    'Esta orden de cambio acaba de actualizarse. Revise la versión más reciente antes de firmar.',
  'This change order was already answered.': 'Esta orden de cambio ya fue respondida.',
  "This change order can't be approved right now. Contact {company}.":
    'Esta orden de cambio no se puede aprobar ahora. Comuníquese con {company}.',
  'This change order is still being prepared.': 'Esta orden de cambio aún se está preparando.',
  'Change orders': 'Órdenes de cambio',
  'Contract total': 'Total del contrato',
  'Awaiting your approval: {n}': 'Pendientes de su aprobación: {n}',
  'Invoice for this change order': 'Factura de esta orden de cambio',
  'Pay invoice': 'Pagar factura',
}

export const changeOrderPublicTranslations: Record<'pt' | 'es', Dict> = { pt, es }
