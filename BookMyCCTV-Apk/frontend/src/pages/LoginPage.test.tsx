import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';

vi.mock('../app/providers/AuthProvider', () => ({
  useAuth: () => ({
    session: { authenticated: true, username: 'local-test-user' },
    loading: false,
    error: '',
    login: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('redirects an authenticated session to the requested protected route', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/devices' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/devices" element={<h1>Protected devices</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Protected devices' })).toBeInTheDocument();
  });
});
