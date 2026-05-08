// lib/ai/prompt-builder.ts
import type { EstimateInput } from './types'

export function buildSystemPrompt(input: EstimateInput): string {
  let prompt = `You are a professional estimator for a ${input.industry ?? 'general services'} business. Create a detailed, itemized estimate based on the job site information provided. Be thorough but realistic with pricing for the US market. Break the work into logical sections (e.g., Materials, Labor, Equipment). Each line item needs a clear description, quantity, unit (e.g., sq ft, hours, each, linear ft), and unit price.

Also generate a short, professional project name in 2-5 words derived from the work scope and the client name. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving". Return it as suggested_project_name.`

  if (input.priceBookItems.length > 0) {
    prompt += `\n\n## Your Company Price Book\nWhen a work item closely matches an entry below, use that exact unit_price and set price_source to "price_book". For all other items, estimate from US market rates and set price_source to "ai_estimate".\n\n`
    prompt += input.priceBookItems
      .map(item => `- ${item.category} | ${item.name} | $${item.unit_price.toFixed(2)}/${item.unit ?? 'each'}`)
      .join('\n')
  } else {
    prompt += `\n\nFor each line item, set price_source to "ai_estimate" (no company price book configured).`
  }

  return prompt
}

export function buildUserContent(input: EstimateInput): string {
  const parts: string[] = []

  let projectInfo = `## Project Information\nName: ${input.projectName}\nType: ${input.projectType ?? 'General'}`
  if (input.targetBudget) {
    projectInfo += `\nTarget Budget: $${input.targetBudget}`
  }
  if (input.clientName) {
    projectInfo += `\nClient: ${input.clientName}`
    if (input.clientAddress) {
      projectInfo += `\nAddress: ${input.clientAddress}`
    }
  }
  parts.push(projectInfo)

  if (input.transcripts.length > 0) {
    parts.push('## Audio Transcripts\n' + input.transcripts.join('\n---\n'))
  }

  if (input.photoDescriptions.length > 0) {
    parts.push('## Photo Descriptions\n' + input.photoDescriptions.join('\n'))
  }

  return parts.join('\n\n')
}
