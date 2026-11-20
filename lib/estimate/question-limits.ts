// lib/estimate/question-limits.ts
//
// Owner rule (2026-11-20): the AI must not pester the owner with questions.
// At most this many clarifying questions reach the owner for one estimate, on
// every surface together (Edit with AI cards and badge, the send check, the
// needs-details empty state, the New Xtimate inline card). Every question is
// skippable and no flow waits on an answer.
export const MAX_OWNER_QUESTIONS = 3
