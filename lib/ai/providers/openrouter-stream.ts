/**
 * lib/ai/providers/openrouter-stream.ts
 *
 * Server-only. Reads an OpenRouter chat-completions STREAM (server-sent events)
 * back into the same shape a non-streamed response has, while reporting the
 * tool-call arguments as they grow.
 *
 * Why stream at all: the estimator call is the longest single stretch of a
 * capture (the bulk of the 4m40s generate step measured on 2026-08-06), and
 * without streaming it is completely blind: the checklist could only say
 * "Writing the scope of work" for a minute or more. Streamed, the arguments of
 * the `create_estimate` tool call arrive as the model writes them, so the
 * pipeline can report "4 sections so far: Demo, Framing, Electrical…" honestly,
 * straight off the model's own output.
 *
 * The reassembled result goes through EXACTLY the same checks as a buffered
 * response (finish_reason, missing tool call, JSON parse, cost capture), so
 * streaming changes when the operator hears about progress and nothing about
 * what the estimate is.
 */

export interface AssembledChatResponse {
  choices: Array<{
    message: {
      content: string | null
      tool_calls: Array<{ function: { name?: string; arguments: string } }>
    }
    finish_reason?: string
  }>
  error?: { message?: string }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
    cost_details?: { upstream_inference_cost?: number | null }
  }
}

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  error?: { message?: string }
  usage?: AssembledChatResponse['usage']
}

/**
 * Consumes the SSE body and returns the assembled response. `onToolArguments`
 * receives the FULL argument text accumulated so far for the first tool call,
 * every time it grows. It must not throw; a throw is swallowed so progress
 * reporting can never break a generation.
 */
export async function readChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  onToolArguments?: (argumentsSoFar: string) => void
): Promise<AssembledChatResponse> {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  let content = ''
  let finishReason: string | undefined
  let usage: AssembledChatResponse['usage']
  let error: AssembledChatResponse['error']
  const calls: Array<{ name?: string; arguments: string }> = []

  const handleData = (data: string) => {
    if (data === '[DONE]') return
    let chunk: StreamChunk
    try {
      chunk = JSON.parse(data) as StreamChunk
    } catch {
      return // A malformed keep-alive or partial frame carries nothing usable.
    }
    if (chunk.error) error = chunk.error
    if (chunk.usage) usage = chunk.usage
    const choice = chunk.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) finishReason = choice.finish_reason
    if (typeof choice.delta?.content === 'string') content += choice.delta.content
    let grew = false
    for (const tc of choice.delta?.tool_calls ?? []) {
      const i = tc.index ?? 0
      calls[i] ??= { arguments: '' }
      if (tc.function?.name) calls[i].name = tc.function.name
      if (tc.function?.arguments) {
        calls[i].arguments += tc.function.arguments
        if (i === 0) grew = true
      }
    }
    if (grew && onToolArguments) {
      try {
        onToolArguments(calls[0].arguments)
      } catch {
        // Progress is a nicety; the generation must go on.
      }
    }
  }

  const handleLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '')
    // Comments (": OPENROUTER PROCESSING") and blank separators carry no data.
    if (!line.startsWith('data:')) return
    handleData(line.slice(5).trimStart())
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer) handleLine(buffer)

  return {
    choices: [
      {
        message: {
          content: content || null,
          tool_calls: calls.filter(Boolean).map((c) => ({
            function: { name: c.name, arguments: c.arguments },
          })),
        },
        finish_reason: finishReason,
      },
    ],
    ...(error ? { error } : {}),
    ...(usage ? { usage } : {}),
  }
}

/** What the model has written so far, read off the partial tool-call JSON. */
export interface DraftProgress {
  /** Sections started (a `title` key has appeared). */
  sections: number
  /** Line items started (a `description` key has appeared). */
  items: number
  /** Titles of the sections whose title string is complete, in order. */
  titles: string[]
}

const MAX_TITLE_LENGTH = 40

/**
 * Counts sections and items in the PARTIAL `create_estimate` arguments.
 *
 * In the tool schema (estimateToolSchema) `title` exists only on sections and
 * `description` only on line items, and no top-level field uses either key, so
 * counting the keys counts the things. The lookbehind skips an escaped quote,
 * so a summary that happens to contain the text `"title":` is not counted.
 */
export function draftProgressFromArguments(partial: string): DraftProgress {
  const sections = partial.match(/(?<!\\)"title"\s*:/g)?.length ?? 0
  const items = partial.match(/(?<!\\)"description"\s*:/g)?.length ?? 0
  const titles: string[] = []
  for (const m of partial.matchAll(/(?<!\\)"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    let title: string
    try {
      title = JSON.parse(`"${m[1]}"`) as string
    } catch {
      continue
    }
    title = title.trim()
    if (!title) continue
    titles.push(title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title)
  }
  return { sections, items, titles }
}
