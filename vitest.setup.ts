import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest, a diferencia de Jest, no limpia el DOM entre tests automáticamente.
afterEach(() => {
  cleanup()
})
