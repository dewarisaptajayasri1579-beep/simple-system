import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const inv = await prisma.invoice.findUnique({
  where: { invoiceNumber: 'INV/2026/00223' },
  include: { payments: { include: { payment: true, transaction: true } } }
})
console.log('INVOICE', JSON.stringify({ status: inv.status, postStatus: inv.postStatus, postedAt: inv.postedAt }, null, 2))
console.log('PAYMENTS', JSON.stringify(inv.payments.map(p => ({
  paymentId: p.paymentId,
  paymentNumber: p.payment?.paymentNumber,
  paymentPostStatus: p.payment?.postStatus,
  transactionPostStatus: p.transaction?.postStatus,
})), null, 2))

const domain = await prisma.domain.findUnique({ where: { id: 'd29cc1fd-2d28-49dc-a6de-65b30feb867c' } })
console.log('DOMAIN', JSON.stringify({ lastPaidAt: domain.lastPaidAt, expiryDate: domain.expiryDate }, null, 2))

const bfus = await prisma.billingFollowUp.findMany({ where: { refType: 'domain', refId: 'd29cc1fd-2d28-49dc-a6de-65b30feb867c' }, orderBy: { createdAt: 'desc' } })
console.log('BFUS', JSON.stringify(bfus, null, 2))
await prisma.$disconnect()
