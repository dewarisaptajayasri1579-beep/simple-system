import { getDashboardSnapshot, renderDashboardImage2 } from "@/lib/dashboard-report-images"

export const runtime = "nodejs"

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  return renderDashboardImage2(snapshot, new Date())
}
