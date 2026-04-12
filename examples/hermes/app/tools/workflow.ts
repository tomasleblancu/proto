/**
 * Workflow tools for Hermes.
 *
 * All state-machine tools (get_item_state, advance_step, block_item,
 * unblock_item, hold_item, resume_item, cancel_item, list_items_by_phase,
 * request_human_approval) are generated from `../workflows/import.ts` by
 * `buildWorkflowTools` in @proto/core-mcp. See tools/index.ts for the
 * registration call.
 *
 * This file only holds workflow-adjacent tools that don't fit the generic
 * state-machine shape — currently just `detect_tlc_requirement`.
 */
import { z } from 'zod'
import { defineTool, agent } from '@tleblancureta/proto/mcp'
import { detectTlcRequirement } from '../shared/index.js'

export default [
  defineTool({
    name: 'detect_tlc_requirement',
    description: 'Dado un pais origen (ISO alpha-2), devuelve si requiere form_f, certificate_of_origin, o ninguno.',
    schema: { country_code: z.string() },
    handler: async ({ country_code }) => {
      const result = detectTlcRequirement(country_code)
      return agent({
        summary: `${country_code}: ${result === 'none' ? 'sin TLC, arancel general' : `requiere ${result}`}`,
        data: { country_code, requires: result },
        hint: result !== 'none'
          ? `En documentation, adjunta ${result} con attach_document(kind="${result}").`
          : 'Sin TLC. Arancel general 6% aplica. Anotar en metadata del item.',
      })
    },
  }),
]
