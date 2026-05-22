# Fix client sheet Select empty value

Task: Fix runtime crash caused by a shadcn/Radix SelectItem with an empty string value in the client sheet.

Scope:
- Replace empty Select item values with a non-empty sentinel.
- Convert sentinel values back to the intended empty/null form value.
- Verify with lint and browser smoke test if feasible.
