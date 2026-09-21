import { PenggajianDetailClient } from "@/components/administratif/PenggajianDetailClient"

export default async function PenggajianDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PenggajianDetailClient periodId={id} />
}
