'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { PlusIcon, TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { ActionResult } from '@/lib/actions/result'
import type { PlanRuleInput } from '@/lib/validation/plan-rules'

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
const CONSTRAINTS = ['no-meat', 'max-minutes', 'tag', 'not-tag'] as const

export interface PlanRulesFormProps {
  initial: PlanRuleInput[]
  isOwner: boolean
  updateAction: (rules: PlanRuleInput[]) => Promise<ActionResult<PlanRuleInput[]>>
}

// Editor de households.plan_rules. Una fila por regla; el valor solo se pide
// cuando la condición lo usa (no-meat no lleva valor: el esquema lo vacía).
export function PlanRulesForm({ initial, isOwner, updateAction }: PlanRulesFormProps) {
  const t = useTranslations('settings')
  const [rules, setRules] = useState<PlanRuleInput[]>(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  function patch(index: number, change: Partial<PlanRuleInput>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...change } : r)))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setError(false)
    startTransition(async () => {
      const res = await updateAction(rules)
      if (res.ok) {
        setRules(res.data)
        setSaved(true)
      } else {
        setError(true)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <h3 className="text-base font-medium">{t('planRules.title')}</h3>
      <p className="text-sm text-text-2">{t('planRules.hint')}</p>
      {rules.length === 0 ? <p className="text-sm text-text-2">{t('planRules.empty')}</p> : null}
      <ul className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <li key={index} className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`plan-rule-${index}-day`}>{t('planRules.day')}</Label>
              <NativeSelect
                id={`plan-rule-${index}-day`}
                disabled={!isOwner}
                value={rule.day === null ? '' : String(rule.day)}
                onChange={(e) => patch(index, { day: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">{t('planRules.anyDay')}</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`planRules.days.${d}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`plan-rule-${index}-slot`}>{t('planRules.slot')}</Label>
              <NativeSelect
                id={`plan-rule-${index}-slot`}
                disabled={!isOwner}
                value={rule.slot ?? ''}
                onChange={(e) => patch(index, { slot: e.target.value === '' ? null : (e.target.value as PlanRuleInput['slot']) })}
              >
                <option value="">{t('planRules.anySlot')}</option>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`planRules.slots.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`plan-rule-${index}-constraint`}>{t('planRules.constraint')}</Label>
              <NativeSelect
                id={`plan-rule-${index}-constraint`}
                disabled={!isOwner}
                value={rule.constraint}
                onChange={(e) => patch(index, { constraint: e.target.value as PlanRuleInput['constraint'], value: '' })}
              >
                {CONSTRAINTS.map((c) => (
                  <option key={c} value={c}>
                    {t(`planRules.constraints.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {rule.constraint === 'no-meat' ? null : (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`plan-rule-${index}-value`}>{t('planRules.value')}</Label>
                <Input
                  id={`plan-rule-${index}-value`}
                  disabled={!isOwner}
                  inputMode={rule.constraint === 'max-minutes' ? 'numeric' : 'text'}
                  value={rule.value}
                  onChange={(e) => patch(index, { value: e.target.value })}
                  className="w-32"
                />
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isOwner}
              aria-label={t('planRules.remove')}
              onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}
            >
              <TrashIcon size={16} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isOwner || rules.length >= 40}
          onClick={() => setRules((prev) => [...prev, { day: null, slot: null, constraint: 'no-meat', value: '' }])}
        >
          <PlusIcon size={16} />
          {t('planRules.add')}
        </Button>
        <Button type="submit" size="sm" disabled={!isOwner || pending}>
          {t('planRules.save')}
        </Button>
        {saved ? <span className="text-sm text-acc-ink">{t('planRules.saved')}</span> : null}
        {error ? (
          <span role="alert" className="text-sm text-warn">
            {t('planRules.error')}
          </span>
        ) : null}
      </div>
    </form>
  )
}
