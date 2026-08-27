import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSpeech } from './use-speech'

interface FakeUtterance { text: string; lang: string; onend: (() => void) | null }

function installFakeSpeech() {
  const spoken: FakeUtterance[] = []
  const cancel = vi.fn()
  class Utterance implements FakeUtterance {
    lang = ''
    onend: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (u: FakeUtterance) => spoken.push(u), cancel, getVoices: () => [] },
  })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance })
  return { spoken, cancel }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'speechSynthesis')
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
})

describe('useSpeech', () => {
  it('sin la API del navegador dice que no está soportado y no revienta al hablar', () => {
    const { result } = renderHook(() => useSpeech('es'))
    expect(result.current.supported).toBe(false)
    act(() => result.current.speak('Pocha la cebolla'))
    expect(result.current.speaking).toBe(false)
  })

  it('habla en el idioma de la interfaz y marca speaking hasta que termina', () => {
    const { spoken } = installFakeSpeech()
    const { result } = renderHook(() => useSpeech('en'))
    expect(result.current.supported).toBe(true)
    act(() => result.current.speak('Sweat the onion'))
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toMatchObject({ text: 'Sweat the onion', lang: 'en' })
    expect(result.current.speaking).toBe(true)
    act(() => spoken[0]?.onend?.())
    expect(result.current.speaking).toBe(false)
  })

  it('hablar otra vez cancela lo anterior, y stop también', () => {
    const { cancel } = installFakeSpeech()
    const { result } = renderHook(() => useSpeech('es'))
    act(() => result.current.speak('uno'))
    act(() => result.current.speak('dos'))
    expect(cancel).toHaveBeenCalledTimes(2)
    act(() => result.current.stop())
    expect(cancel).toHaveBeenCalledTimes(3)
    expect(result.current.speaking).toBe(false)
  })
})
