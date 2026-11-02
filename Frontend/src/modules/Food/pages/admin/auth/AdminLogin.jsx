import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Eye, EyeOff, Lock, Mail, CarFront, UtensilsCrossed } from "lucide-react"

const AZANTO_LOGO = "/brand/azanto-logo.png"

// The swoosh at the foot of the Azanto app icon, reused as the brand panel's floor.
function BrandWave({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
      <path fill="rgba(255,255,255,0.10)" d="M0,192 C240,288 480,320 720,272 C960,224 1200,128 1440,96 L1440,320 L0,320 Z" />
      <path fill="rgba(255,255,255,0.16)" d="M0,256 C320,320 640,304 900,256 C1120,216 1300,176 1440,170 L1440,320 L0,320 Z" />
    </svg>
  )
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const submittingRef = useRef(false)

  useEffect(() => {
    const message = location.state?.message
    if (message) {
      setSuccessMessage(message)
      window.history.replaceState({}, document.title, location.pathname)
    }
  }, [location.state?.message, location.pathname])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")
    if (submittingRef.current) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Email is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address")
      return
    }
    if (!password) {
      setError("Password is required")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    submittingRef.current = true
    setIsLoading(true)

    try {
      const response = await adminAPI.login(trimmedEmail, password)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }
      setAuthData("admin", accessToken, adminUser, refreshToken)
      navigate("/admin/food", { replace: true })
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed. Please check your credentials."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-linear-to-br from-azanto-500 via-azanto-600 to-azanto-800 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-azanto-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">Admin console</span>
        </div>

        <div className="relative max-w-md">
          <div className="mb-10 inline-flex rounded-[2rem] bg-white p-6 shadow-2xl shadow-azanto-900/30">
            <img src={AZANTO_LOGO} alt="Azanto" className="h-36 w-auto" loading="eager" />
          </div>
          <h1 className="font-[Outfit] text-4xl font-bold leading-tight">
            Rides and food,<br />run from one place.
          </h1>
          <p className="mt-4 text-lg text-white/80">
            Manage drivers, trips, restaurants and orders across every Azanto zone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur">
              <CarFront className="h-4 w-4" /> Taxi
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur">
              <UtensilsCrossed className="h-4 w-4" /> Food
            </span>
          </div>
        </div>

        <p className="relative text-sm text-white/70">© {new Date().getFullYear()} Azanto</p>
        <BrandWave className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full" />
      </aside>

      {/* Form */}
      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <img src={AZANTO_LOGO} alt="Azanto" className="mx-auto mb-8 h-24 w-auto lg:hidden" loading="eager" />

          <h2 className="font-[Outfit] text-3xl font-bold text-azanto-ink">Welcome back</h2>
          <p className="mt-2 text-base text-gray-500">Sign in to the Azanto admin dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {successMessage && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {successMessage}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-azanto-200 bg-azanto-50 px-4 py-3 text-sm text-azanto-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-azanto-ink">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@azanto.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="off"
                  required
                  className="h-12 rounded-xl border-gray-200 pl-12 text-base focus-visible:border-azanto-500 focus-visible:ring-azanto-500/25"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-azanto-ink">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                  className="h-12 rounded-xl border-gray-200 pl-12 pr-12 text-base focus-visible:border-azanto-500 focus-visible:ring-azanto-500/25 [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-azanto-600"
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end text-sm">
              <button
                type="button"
                onClick={() => navigate("/admin/forgot-password")}
                className="font-semibold text-azanto-600 hover:text-azanto-700 hover:underline focus:outline-none focus:underline"
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="h-12 w-full rounded-xl bg-linear-to-r from-azanto-500 to-azanto-600 text-base font-semibold text-white shadow-lg shadow-azanto-500/30 transition hover:from-azanto-600 hover:to-azanto-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azanto-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">Secure sign-in protects Azanto admin tools.</p>
        </div>
      </main>
    </div>
  )
}
