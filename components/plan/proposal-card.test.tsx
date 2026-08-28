import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import { IdSchema } from '@/lib/validation/common'
import { ProposalDecisionSchema } from '@/lib/validation/plan'
import { ProposalCard } from './proposal-card'
import type { ProposalClient } from './types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const decideProposalAction = vi.fn()
vi.mock('@/lib/actions/plan', () => ({ decideProposalAction: (...args: unknown[]) => decideProposalAction(...args) }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222'
const REMOVED_ENTRY_ID = '33333333-3333-4333-8333-333333333333'

function baseProposal(overrides: Partial<ProposalClient> = {}): ProposalClient {
  return {
    id: PROPOSAL_ID,
    source: 'ai',
    status: 'pending',
    createdAt: '2026-08-20T10:00:00.000Z',
    diff: {
      add: [
        { date: '2026-08-24', slot: 'lunch', recipeId: 'r1', servings: 2, title: 'Lentejas', allergenConflicts: [] },
        { date: '2026-08-25', slot: 'dinner', recipeId: 'r2', servings: 1, title: 'Tortilla', allergenConflicts: [] },
      ],
      remove: [
        {
          id: REMOVED_ENTRY_ID,
          date: '2026-08-24',
          slot: 'dinner',
          recipeId: 'r3',
          title: 'Pasta',
          servings: 2,
          leftoverOfEntryId: null,
          timeBudgetMinutes: null,
          status: 'planned',
          sortOrder: 0,
          kcalPerServing: 400,
          totalMinutes: 30,
          imageUrl: null,
        },
      ],
    },
    ...overrides,
  }
}

function renderCard(proposal: ProposalClient) {
  render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <ProposalCard proposal={proposal} />
    </NextIntlClientProvider>,
  )
}

describe('ProposalCard', () => {
  it('agrupa el diff por fecha con la cabecera formateada según el locale, no en ISO crudo', () => {
    renderCard(baseProposal())
    expect(screen.getByText('lun, 24 ago')).toBeInTheDocument()
    expect(screen.getByText('mar, 25 ago')).toBeInTheDocument()
    expect(screen.queryByText('2026-08-24')).not.toBeInTheDocument()
  })

  it('pinta los altas en text-acc-ink y las bajas en text-warn-ink, con el <li> como portador', () => {
    renderCard(baseProposal())

    // El texto vive en un <span> junto al icono de marcador; el color sigue
    // en el <li> (mismo elemento que agrupa icono + texto).
    const added = screen.getByText('+ Lentejas · Comida · ×2').closest('li')
    expect(added).toHaveClass('text-acc-ink')
    const added2 = screen.getByText('+ Tortilla · Cena · ×1').closest('li')
    expect(added2).toHaveClass('text-acc-ink')

    const removed = screen.getByText('− Pasta · Cena').closest('li')
    expect(removed).toHaveClass('text-warn-ink')
  })

  it('pendiente muestra los botones Aprobar/Descartar', () => {
    renderCard(baseProposal({ status: 'pending' }))
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
  })

  it('al aprobar llama a decideProposalAction con (id, "approve") y el payload es válido según los esquemas reales', async () => {
    decideProposalAction.mockResolvedValue({ ok: true, data: baseProposal({ status: 'approved' }) })
    renderCard(baseProposal())
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(decideProposalAction).toHaveBeenCalledWith(PROPOSAL_ID, 'approve'))
    const [id, decision] = decideProposalAction.mock.calls[0] as [string, string]
    expect(IdSchema.safeParse(id).success).toBe(true)
    expect(ProposalDecisionSchema.safeParse({ decision }).success).toBe(true)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('al descartar llama a decideProposalAction con (id, "reject") y el payload es válido según los esquemas reales', async () => {
    decideProposalAction.mockResolvedValue({ ok: true, data: baseProposal({ status: 'rejected' }) })
    renderCard(baseProposal())
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(decideProposalAction).toHaveBeenCalledWith(PROPOSAL_ID, 'reject'))
    const [id, decision] = decideProposalAction.mock.calls[0] as [string, string]
    expect(IdSchema.safeParse(id).success).toBe(true)
    expect(ProposalDecisionSchema.safeParse({ decision }).success).toBe(true)
  })

  it('deshabilita ambos botones mientras la decisión está en curso', async () => {
    let resolveDecide!: (v: { ok: boolean }) => void
    decideProposalAction.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveDecide = res
        }),
    )
    renderCard(baseProposal())
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled()
    resolveDecide({ ok: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled())
  })

  it('muestra un error y no refresca si la decisión falla', async () => {
    decideProposalAction.mockResolvedValue({ ok: false, code: 'conflict' })
    renderCard(baseProposal())
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(decideProposalAction).toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sin estado pendiente no muestra botones y sí una etiqueta de estado', () => {
    renderCard(baseProposal({ status: 'approved' }))
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
    expect(screen.getByText('Aprobada')).toBeInTheDocument()
  })

  it('rechazada muestra la etiqueta correspondiente sin botones', () => {
    renderCard(baseProposal({ status: 'rejected' }))
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.getByText('Descartada')).toBeInTheDocument()
  })

  it('muestra el origen de la propuesta', () => {
    renderCard(baseProposal({ source: 'mcp' }))
    expect(screen.getByText(/del asistente/)).toBeInTheDocument()
  })

  it('pinta el aviso de alérgeno junto a la entrada afectada', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ plan }}>
        <ProposalCard
          proposal={{
            id: 'p1',
            source: 'mcp',
            status: 'pending',
            createdAt: '2026-08-31T10:00:00.000Z',
            diff: {
              add: [{ date: '2026-08-31', slot: 'lunch', recipeId: 'r1', servings: 2, title: 'Bizcocho', allergenConflicts: ['gluten'] }],
              remove: [],
            },
          }}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('note')).toHaveTextContent(/gluten/i)
  })
})
