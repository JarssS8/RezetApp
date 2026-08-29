'use client'

import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip, type ChartConfiguration } from 'chart.js'
import { useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

// Registro manual (en vez de 'chart.js/auto'): solo lo que hace falta para
// una barra con leyenda y tooltip, sin arrastrar el resto de controladores y
// escalas de chart.js al bundle de este componente.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export interface StatsChartDay {
  date: string
  plannedKcal: number
  cookedKcal: number
}

export interface StatsChartProps {
  days: StatsChartDay[]
}

// Un token ya resuelto (color-mix incluido) del elemento raíz: chart.js pinta
// en un <canvas>, no entiende `var(--x)`, necesita el valor final calculado.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Barras de kcal planificadas frente a cocinadas, un par por día de la semana
// del rango (§stats de plan.json). Se carga con next/dynamic y `ssr: false`
// desde plan-stats-panel.tsx: chart.js no debe entrar en el bundle compartido
// de una app que la mayoría de las veces no enseña ningún gráfico.
export function StatsChart({ days }: StatsChartProps) {
  const t = useTranslations('plan')
  const locale = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  // El interruptor global de reduced-motion (app/globals.css) es CSS puro;
  // chart.js anima el canvas por su cuenta (rAF), fuera de su alcance. Se
  // reutiliza el hook de `motion` en vez de escribir otra media query de
  // reduced-motion propia (tests/contracts/motion.test.ts lo exige para toda
  // la interfaz: un único interruptor, leído, nunca redeclarado).
  const shouldReduceMotion = useReducedMotion()

  // El gráfico lee sus colores con getComputedStyle una vez por render del
  // efecto: si el tema cambia con la pantalla abierta (ajuste del sistema o
  // data-theme), este contador fuerza un repintado con los tokens nuevos
  // (revisión W9, hallazgo 3).
  const [themeVersion, setThemeVersion] = useState(0)
  useEffect(() => {
    const bump = () => setThemeVersion((v) => v + 1)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', bump)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      media.removeEventListener('change', bump)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: days.map((d) => dayLabel.format(new Date(`${d.date}T00:00:00Z`))),
        datasets: [
          { label: t('stats.planned'), data: days.map((d) => d.plannedKcal), backgroundColor: cssVar('--line-2') },
          { label: t('stats.cooked'), data: days.map((d) => d.cookedKcal), backgroundColor: cssVar('--acc') },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: shouldReduceMotion ? false : { duration: 400 },
        color: cssVar('--text-2'),
        plugins: {
          legend: { display: true, labels: { color: cssVar('--text-2') } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { ticks: { color: cssVar('--text-2') }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: cssVar('--text-2') }, grid: { color: cssVar('--line-2') } },
        },
      },
    }
    chartRef.current = new Chart(canvas, config)
    return () => chartRef.current?.destroy()
  }, [days, locale, shouldReduceMotion, t, themeVersion])

  return (
    <div className="h-56 w-full">
      {/* Los lienzos no tienen texto propio: `role="img"` + `aria-label` los
          describen. El resto de números de esta pantalla (las tarjetas y las
          frases de arriba, en plan-stats-panel.tsx) ya son la alternativa en
          texto — no hace falta duplicarlos en una tabla oculta. */}
      <canvas ref={canvasRef} role="img" aria-label={t('stats.chart.title')} />
    </div>
  )
}
