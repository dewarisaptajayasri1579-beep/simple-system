import { getCurrentUser } from "@/lib/current-user"
import { AdministratifShell } from "@/components/administratif/AdministratifShell"

export default async function AdministratifShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser("administratif")

  return <AdministratifShell userName={user.name}>{children}</AdministratifShell>
}
