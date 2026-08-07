import { getDashboardSnapshot, renderDashboardImage1 } from "@/lib/dashboard-report-images"

export const runtime = "nodejs"

export async function GET() {
  const snapshot = await getDashboardSnapshot()
  return renderDashboardImage1(snapshot, new Date())
}
