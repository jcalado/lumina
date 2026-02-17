"use client"

import { useState } from "react"
import { signIn, getSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Loader2, Zap } from "lucide-react"

const isDev = process.env.NODE_ENV === "development"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setIsLoading(true)
    setError("")

    try {
      const result = await signIn("credentials", {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      })

      if (result?.error) {
        setError(t("error_invalid_credentials"))
      } else {
        const session = await getSession()
        if (session) {
          router.push("/admin")
          router.refresh()
        } else {
          setError(t("error_login_failed"))
        }
      }
    } catch {
      setError(t("error_generic"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await doLogin(email, password)
  }

  const handleDevLogin = async () => {
    const devEmail = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? ""
    const devPassword = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? ""
    setEmail(devEmail)
    setPassword(devPassword)
    await doLogin(devEmail, devPassword)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleSubmit} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{t("welcome_back")}</h1>
                <p className="text-muted-foreground text-balance">
                  {t("description")}
                </p>
              </div>
              {error && (
                <FieldError>{error}</FieldError>
              )}
              <Field>
                <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("signing_in")}
                    </>
                  ) : (
                    t("sign_in")
                  )}
                </Button>
              </Field>
              {isDev && (
                <Field>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed"
                    disabled={isLoading}
                    onClick={handleDevLogin}
                  >
                    <Zap className="h-4 w-4" />
                    Dev Auto-Login
                  </Button>
                </Field>
              )}
            </FieldGroup>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/login-bg.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
