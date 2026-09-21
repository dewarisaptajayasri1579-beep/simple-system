import { getCurrentUser } from "@/lib/current-user"
import { SpreadsheetShell } from "@/components/spreadsheet/SpreadsheetShell"

export default async function SpreadsheetShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser("spreadsheet")

  return <SpreadsheetShell userName={user.name}>{children}</SpreadsheetShell>
}
