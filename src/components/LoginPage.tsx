import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
        credentials: 'include',
      })

      if (response.ok) {
        navigate({ to: '/', replace: true })
      } else {
        const data = await response.json()
        setError(data.error || 'Login fehlgeschlagen')
      }
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Radial/linear gradient glow behind header */}
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage: `radial-gradient(1200px 500px at 50% 10%, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%), radial-gradient(900px 300px at 50% 8%, rgba(239,68,68,0.18), rgba(239,68,68,0) 65%)`
      }} />

      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-0">
          <span className="text-white">GF </span>
          <span className="text-red-500">Board</span>
        </h1>       
      </div>

      {/* Shared width container so layout matches LocationSelectionView */}
      <div className="w-full max-w-3xl mx-auto px-6 relative z-10">

        {/* Label */}
        <div className="text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-3 text-center">
          PIN-CODE EINGEBEN
        </div>

        {/* Input Card */}
        <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 p-5 rounded-lg w-full mb-6 shadow-[0_12px_40px_rgba(0,0,0,.4)]">
          <input
            id="pin"
            name="pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            disabled={isLoading}
            className="w-full px-6 py-5 bg-neutral-800 text-white text-center text-2xl tracking-widest border border-white/15 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-600 shadow-inner"
            required
            autoFocus
            maxLength={8}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          disabled={isLoading || !pin}
          className="w-full bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-neutral-800 disabled:to-neutral-900 cursor-pointer active:cursor-pointer disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all duration-300 shadow-xl disabled:shadow-none text-xl disabled:text-gray-500"
        >
          {isLoading ? 'Wird überprüft...' : 'Anmelden'}
        </button>
       
      </div>
    </div>
  )
}

