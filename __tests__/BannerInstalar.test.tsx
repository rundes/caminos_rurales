import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BannerInstalar } from '@/components/BannerInstalar'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function stubUserAgent(ua: string) {
  vi.stubGlobal('navigator', { ...navigator, userAgent: ua, platform: '', maxTouchPoints: 0 })
}

beforeEach(() => {
  localStorage.clear()
  // jsdom no implementa `matchMedia`: sin definirla, `estaInstalada()` ya da
  // `false` por su propio guard de `typeof ... === 'function'`.
  stubUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/125.0.0.0 Mobile Safari/537.36')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (window as { matchMedia?: unknown }).matchMedia
})

/** Simula el evento de Chromium: no existe en jsdom, así que se despacha un `Event` a mano con los métodos que usa el banner. */
function dispararBeforeInstallPrompt(prompt = vi.fn(async () => {})) {
  const evento = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
  evento.prompt = prompt
  evento.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
  act(() => {
    window.dispatchEvent(evento)
  })
  return { evento, prompt }
}

describe('BannerInstalar', () => {
  test('sin ninguna señal no muestra nada', () => {
    render(<BannerInstalar />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('ya instalada (display-mode standalone) no muestra nada aunque llegue el prompt', () => {
    window.matchMedia = (() => ({ matches: true }) as MediaQueryList) as typeof window.matchMedia
    render(<BannerInstalar />)

    dispararBeforeInstallPrompt()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('con beforeinstallprompt ofrece instalar y dispara el prompt nativo al tocar Instalar', async () => {
    render(<BannerInstalar />)
    const { prompt } = dispararBeforeInstallPrompt()

    expect(await screen.findByText(/instalá visiovial/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^instalar$/i }))
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  test('cerrar el banner instalable lo oculta y lo recuerda en localStorage', async () => {
    render(<BannerInstalar />)
    dispararBeforeInstallPrompt()
    await screen.findByText(/instalá visiovial/i)

    await userEvent.click(screen.getByRole('button', { name: /cerrar aviso de instalación/i }))

    expect(screen.queryByText(/instalá visiovial/i)).not.toBeInTheDocument()
    expect(localStorage.getItem('visiovial:banner-instalar-descartado')).toBe('1')
  })

  test('ya descartado antes no vuelve a mostrarse aunque llegue el prompt', () => {
    localStorage.setItem('visiovial:banner-instalar-descartado', '1')
    render(<BannerInstalar />)

    dispararBeforeInstallPrompt()

    expect(screen.queryByText(/instalá visiovial/i)).not.toBeInTheDocument()
  })

  test('en iOS Safari muestra las instrucciones manuales, sin evento nativo', async () => {
    stubUserAgent(IPHONE_SAFARI)
    render(<BannerInstalar />)

    expect(await screen.findByText(/compartir/i)).toBeInTheDocument()
    expect(screen.getByText(/agregar a inicio/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^instalar$/i })).not.toBeInTheDocument()
  })

  test('cerrar las instrucciones de iOS también las recuerda', async () => {
    stubUserAgent(IPHONE_SAFARI)
    render(<BannerInstalar />)
    await screen.findByText(/compartir/i)

    await userEvent.click(screen.getByRole('button', { name: /cerrar aviso de instalación/i }))

    expect(screen.queryByText(/compartir/i)).not.toBeInTheDocument()
  })
})
