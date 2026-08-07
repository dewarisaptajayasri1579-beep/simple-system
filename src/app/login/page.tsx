import { AuthLayout } from "@/components/layout/AuthLayout"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ quick?: string }> }) {
  const params = await searchParams
  return <AuthLayout quickLogin={params.quick === "1"} />
}
