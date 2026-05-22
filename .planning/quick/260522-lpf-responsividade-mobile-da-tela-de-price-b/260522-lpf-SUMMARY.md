---
quick_id: 260522-lpf
description: responsividade mobile da tela de Price Book
date: 2026-05-22
tasks_completed: 2/2
tests: 15/15 passing
---

# Quick Task 260522-lpf: Responsividade Mobile do Price Book — Summary

## Goal

A tela `/price-book` estava com formatação quebrada no mobile: tabela com colunas espremidas com scroll horizontal, header com 3 botões "New Folder / Import CSV / Add Item" transbordando, e o folder header (chevron + nome + Pencil + Trash + Adjust %) sem espaço pra respirar. Aplicar o mesmo padrão já consolidado em [`components/clients/client-list.tsx`](../../../components/clients/client-list.tsx): **desktop com `<Table>` em `hidden md:block`, mobile com lista de Cards em `md:hidden`**.

## Outcome

2/2 tarefas executadas conforme plano, 15/15 testes unitários passando. Mobile agora renderiza Cards verticais empilhados (image thumb + nome + unidade/preço + dropdown de ações) ao invés de tabela com scroll horizontal. Header da página empilha em coluna no mobile e volta horizontal em md+. Folder header usa `flex-wrap` pra acomodar os botões em telas estreitas.

## Commits

- `36a15c1` — `fix(quick-260522-lpf): tighten price-book page padding on mobile`
- `b0fced6` — `feat(quick-260522-lpf): make price-book screen responsive on mobile`
- `46e196e` — `chore: merge quick task worktree (260522-lpf mobile responsive price book)`

## Files Modified

- [`app/(app)/price-book/page.tsx`](../../../app/(app)/price-book/page.tsx) — wrapper paddings: `px-6 py-8` → `px-4 py-4 md:px-6 md:py-8`, spacing `space-y-8` → `space-y-6 md:space-y-8`, Card `p-6 md:p-8` → `p-4 md:p-8`
- [`components/price-book/price-book-list.tsx`](../../../components/price-book/price-book-list.tsx) — page header empilha em coluna no mobile (`flex flex-col gap-3 md:flex-row md:items-center md:justify-between`), button group com `flex-wrap`; folder header com `flex-wrap` pra acomodar Pencil/Trash/Adjust % em telas estreitas; per-folder Table duplicado em `hidden md:block` (desktop) e `md:hidden space-y-2` Card list (mobile) seguindo padrão de `client-list.tsx`
- [`tests/unit/price-book/price-book-list.test.tsx`](../../../tests/unit/price-book/price-book-list.test.tsx) — 6 asserções migradas de `getByText` para `getAllByText().length > 0` pra tolerar duplicação desktop+mobile no DOM (mesmo pattern já usado em `client-list.test.tsx`)

## Design Decisions

- **Per-folder split, não page-wide:** items vivem dentro de seções de folder, então o split desktop/mobile acontece no corpo do folder, não no nível da página. Folder headers renderizam uma única vez por seção.
- **Botões com label preservados:** mantidos os labels ("New Folder", "Import CSV", "Add Item") em vez de virar icon-only, pra preservar compatibilidade com queries de teste por role+name.
- **Desktop Table byte-for-byte preservado** dentro do novo wrapper `hidden md:block` — zero risco para UX desktop existente.

## Verification

- Testes: `tests/unit/price-book/price-book-list.test.tsx` — 15/15 passing
- Manual: pendente verificação visual no navegador (próximo passo do usuário)
