import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTimersStore } from '@/lib/timers-store'
import { useTimers } from './use-timers'

// El store (lib/timers-store) vive fuera de React: a diferencia del useState
// de antes, no se limpia solo entre tests con solo desmontar el componente.
beforeEach(() => {
  vi.useFakeTimers()
  resetTimersStore()
})
afterEach(() => vi.useRealTimers())

describe('useTimers', () => {
  it('cuenta atrás dos temporizadores a la vez sin desincronizarlos', () => {
    const { result } = renderHook(() => useTimers('sesion'))
    act(() => {
      result.current.start('a', 10, 'Arroz')
      result.current.start('b', 30, 'Horno')
    })
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.timers.map((t) => t.remaining)).toEqual([7, 27])
    expect(result.current.timers.every((t) => t.running)).toBe(true)
  })

  it('pausa y reanuda sin perder lo que queda', () => {
    const { result } = renderHook(() => useTimers('sesion'))
    act(() => result.current.start('a', 10, 'Arroz'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.toggle('a'))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.timers[0]).toMatchObject({ remaining: 8, running: false })
    act(() => result.current.toggle('a'))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.timers[0]?.remaining).toBe(7)
  })

  it('avisa una sola vez al llegar a cero y se queda parado en cero', async () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useTimers('sesion', onFinish))
    act(() => result.current.start('a', 2, 'Arroz'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0]?.[0]).toMatchObject({ id: 'a', label: 'Arroz', remaining: 0 })
    expect(result.current.timers[0]).toMatchObject({ remaining: 0, running: false })
  })

  it('reset vuelve al total parado; dismiss lo quita; start sobre uno vivo lo reinicia', () => {
    const { result } = renderHook(() => useTimers('sesion'))
    act(() => result.current.start('a', 10, 'Arroz'))
    act(() => vi.advanceTimersByTime(4000))
    act(() => result.current.reset('a'))
    expect(result.current.timers[0]).toMatchObject({ remaining: 10, running: false })
    act(() => result.current.start('a', 10, 'Arroz'))
    expect(result.current.timers).toHaveLength(1)
    expect(result.current.timers[0]?.running).toBe(true)
    act(() => result.current.dismiss('a'))
    expect(result.current.timers).toEqual([])
  })

  // Fix 5 de la revisión final: el temporizador ancla su fin en reloj de
  // pared, no en ticks contados. Un salto de reloj sin ticks intermedios
  // (dispositivo suspendido, pantalla bloqueada) simula eso: `vi.setSystemTime`
  // mueve el reloj sin disparar ningún `setInterval`, y solo al llegar el
  // siguiente tick real se recalcula `remaining` desde el reloj ya saltado.
  it('un salto de reloj de 5 minutos colapsa el remaining al valor real y avisa una sola vez', async () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useTimers('sesion', onFinish))
    act(() => result.current.start('a', 120, 'Arroz')) // 2 minutos
    act(() => {
      vi.setSystemTime(Date.now() + 5 * 60 * 1000) // el dispositivo se suspende 5 minutos
    })
    await act(async () => {
      vi.advanceTimersByTime(1000) // el primer tick tras despertar
    })
    expect(result.current.timers[0]).toMatchObject({ remaining: 0, running: false })
    expect(onFinish).toHaveBeenCalledTimes(1)
    // Ticks posteriores no vuelven a avisar: ya está parado.
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('sin ninguno corriendo no deja un intervalo vivo', () => {
    const { result, unmount } = renderHook(() => useTimers('sesion'))
    act(() => result.current.start('a', 1, 'Arroz'))
    act(() => vi.advanceTimersByTime(2000))
    expect(vi.getTimerCount()).toBe(0)
    unmount()
  })
})
