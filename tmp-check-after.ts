import { getVpsDockerDiskUsage } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

async function main() {
  const vps = await prisma.vpsServer.findFirst({ where: { name: "Coolify Dewari" } })
  if (!vps) return
  const t0 = Date.now()
  const result = await getVpsDockerDiskUsage(vps)
  console.log("Selesai dalam", Date.now() - t0, "ms")
  console.log("dockerDisk:", result.dockerDisk)
  console.log("volumes (top 5):", (result.volumes ?? []).sort((a,b) => 0).slice(0,10))
  await prisma.$disconnect()
}
main().catch((e) => { console.error("ERR", e); process.exit(1) })
