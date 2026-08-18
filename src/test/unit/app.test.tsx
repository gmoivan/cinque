import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../../app/App'

describe('App', () => {
  it('renders the initial placeholder screen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Cinque' })).toBeInTheDocument()
    expect(screen.getByText('Fundación inicial del proyecto lista.')).toBeInTheDocument()
  })
})
