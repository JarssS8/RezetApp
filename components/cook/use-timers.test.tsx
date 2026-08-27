import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimers } from './use-timers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useTimers', () => {
  it('cuenta atrás dos temporizadores a la vez sin desincronizarlos', () => {
    const { result } = renderHook(() => useTimers())
    act(() => {
      result.current.start('a', 10, 'Arroz')
      result.current.start('b', 30, 'Horno')
    })
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.timers.map((t) => t.remaining)).toEqual([7, 27])
    expect(result.current.timers.every((t) => t.running)).toBe(true)
  })

  it('pausa y reanuda sin perder lo que queda', () => {
    const { result } = renderHook(() => useTimers())
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
    const { result } = renderHook(() => useTimers(onFinish))
    act(() => result.current.start('a', 2, 'Arroz'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0]?.[0]).toMatchObject({ id: 'a', label: 'Arroz', remaining: 0 })
    expect(result.current.timers[0]).toMatchObject({ remaining: 0, running: false })
  })

  it('reset vuelve al total parado; dismiss lo quita; start sobre uno vivo lo reinicia', () => {
    const { result } = renderHook(() => useTimers())
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

  it('sin ninguno corriendo no deja un intervalo vivo', () => {
    const { result, unmount } = renderHook(() => useTimers())
    act(() => result.current.start('a', 1, 'Arroz'))
    act(() => vi.advanceTimersByTime(2000))
    expect(vi.getTimerCount()).toBe(0)
    unmount()
  })
})
