import { createFileRoute, redirect } from '@tanstack/react-router'
import LoginPage from '../components/LoginPage'

export const Route = createFileRoute('/login')({
  component: LoginPage,
  beforeLoad: async () => {
    // Check if already authenticated
    try {
      const response = await fetch('/api/auth/check')
      if (response.ok) {
        throw redirect({ to: '/' })
      }
    } catch (error) {
      // If redirect was thrown, rethrow it
      if (error && typeof error === 'object' && 'href' in error) {
        throw error
      }
      // Otherwise, user is not authenticated, continue to login page
    }
  },
})

