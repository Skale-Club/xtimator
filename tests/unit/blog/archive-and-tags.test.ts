/**
 * Etiquetas e arquivos do blog.
 *
 * `tags` é uma coluna de TEXTO separada por vírgulas, e os arquivos são
 * intervalos de datas. As duas coisas são fáceis de fazer quase certas — e é o
 * quase que serve uma listagem errada sob um URL que promete outra.
 */
import { describe, expect, it } from 'vitest'

import { parseTags, tagSlug } from '@/lib/queries/blog'

describe('parseTags', () => {
  it('divide, apara e descarta vazios', () => {
    expect(parseTags('a, b ,  , c')).toEqual(['a', 'b', 'c'])
  })

  it('devolve lista vazia para null, undefined e string vazia', () => {
    expect(parseTags(null)).toEqual([])
    expect(parseTags(undefined)).toEqual([])
    expect(parseTags('   ')).toEqual([])
  })
})

describe('tagSlug', () => {
  it('normaliza acentos e espaços', () => {
    expect(tagSlug('Cuidados com Metal')).toBe('cuidados-com-metal')
    expect(tagSlug('Preço & Margem')).toBe('preco-margem')
  })

  it('não deixa hífens nas pontas', () => {
    expect(tagSlug('  — HVAC —  ')).toBe('hvac')
  })

  it('distingue etiquetas que um LIKE confundiria', () => {
    // É o caso que justifica comparar o slug inteiro em vez de um `ilike
    // '%art%'`: este devolveria os posts de "artisan" para a etiqueta "art".
    expect(tagSlug('art')).not.toBe(tagSlug('artisan'))
    expect(tagSlug('art')).toBe('art')
    expect(tagSlug('artisan')).toBe('artisan')
  })

  it('duas grafias da mesma etiqueta colapsam num só URL', () => {
    // "HVAC" e "hvac" são a mesma etiqueta para quem escreve; dois URLs para a
    // mesma listagem seriam duas páginas indexáveis com o mesmo conteúdo.
    expect(tagSlug('HVAC')).toBe(tagSlug('hvac'))
  })
})

/** A mesma aritmética de `getBlogPostsByMonth`. */
function monthWindow(year: number, month: number | undefined, now: Date) {
  const from = new Date(Date.UTC(year, month ? month - 1 : 0, 1))
  const periodEnd = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1))
  const to = periodEnd.getTime() < now.getTime() ? periodEnd : now
  return { from, to }
}

describe('janela de um arquivo', () => {
  const now = new Date('2026-09-17T12:00:00Z')

  it('um mês passado usa o mês inteiro, meio-aberto', () => {
    const { from, to } = monthWindow(2026, 8, now)
    expect(from.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    // Fechado dos dois lados, um post de 1 de setembro às 00:00 apareceria em
    // agosto E em setembro.
    expect(to.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('o mês CORRENTE pára em agora, não no fim do mês', () => {
    // É esta linha que impede um post agendado de aparecer no arquivo deste mês
    // enquanto a contagem, que tem a guarda, diz outro número.
    expect(monthWindow(2026, 9, now).to.getTime()).toBe(now.getTime())
  })

  it('o ano corrente também pára em agora', () => {
    expect(monthWindow(2026, undefined, now).to.getTime()).toBe(now.getTime())
  })

  it('dezembro rola para janeiro do ano seguinte', () => {
    const { to } = monthWindow(2026, 12, new Date('2027-06-01T00:00:00Z'))
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
