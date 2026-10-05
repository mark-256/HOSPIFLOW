import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { createOrderWithItems, readOrder, toMinor, mpesaCallback, submitBankPayment, verifyBankPayment, rejectBankPayment } from './helpers/b40Financial'
import { MpesaProvider } from '../../src/services/payments/mpesa'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'

describe('B40 Bank Payment — security & integrity', () => {
  let app: Express
  let fixture: SecurityFixture
  let prisma: any
  let cashierA: AuthTokens
  let adminA: AuthTokens
  let accountantA: AuthTokens
  let auditorA: AuthTokens
  let restrictedA: AuthTokens

  beforeAll(async () => {
    app = await getApp()
    fixture = await setupSecurityFixtures()
    prisma = await getPrisma()
    cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
    adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
    accountantA = await login(app, fixture.emails.accountantA, fixture.passwords.accountantA)
    auditorA = await login(app, fixture.emails.auditorA, fixture.passwords.auditorA)
    restrictedA = await login(app, fixture.emails.restrictedA, fixture.passwords.restrictedA)
  }, 120000)

  afterAll(async () => {
    await disconnect()
  })

  async function paymentFor(orderId: string) {
    return prisma.orderPayment.findFirst({ where: { orderId } })
  }

  describe('BANK payment submission', () => {
    it('a cashier can submit a bank payment with valid fields', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Example Bank',
        bankAccountReference: 'TXN-001',
        description: 'Customer bank deposit',
      }).expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.provider).toBe('BANK')
      expect(res.body.data.method).toBe('BANK_TRANSFER')

      const payment = await paymentFor(order.id)
      expect(payment.status).toBe('PENDING')
      expect(payment.provider).toBe('BANK')
      expect(payment.paymentMethod).toBe('BANK_TRANSFER')

      const after = await readOrder(prisma, order.id)
      expect(after.paidAmount).toBe(0)
      expect(after.balance).toBeCloseTo(order.total, 2)
    }, 30000)

    it('the submitted bank payment stores bankName and bankAccountReference in metadata', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Secure Bank Ltd',
        bankAccountReference: 'REF-9991',
      }).expect(201)

      const payment = await paymentFor(order.id)
      const metadata = payment.metadata as Record<string, unknown>
      expect(metadata.bankName).toBe('Secure Bank Ltd')
      expect(metadata.bankAccountReference).toBe('REF-9991')
    }, 30000)

    it('a bank payment is created PENDING and does not settle the order', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank A',
        bankAccountReference: 'DEPOSIT-001',
      }).expect(201)

      const payment = await paymentFor(order.id)
      expect(payment.status).toBe('PENDING')
      const after = await readOrder(prisma, order.id)
      expect(after.balance).toBeCloseTo(order.total, 2)
      expect(after.paidAmount).toBe(0)
    }, 30000)

    it('missing bankName is rejected with 400', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
      })
      expect(res.status).toBe(400)
      const after = await readOrder(prisma, order.id)
      expect(after.paidAmount).toBe(0)
    }, 30000)

    it('missing amount is rejected with 400', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        bankName: 'Bank A',
        bankAccountReference: 'DEP-001',
      })
      expect(res.status).toBe(400)
    }, 30000)

    const hostileAmounts: Array<[string, unknown]> = [
      ['zero', 0],
      ['negative', -100],
      ['very large', 1e30],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['string', 'not-a-number'],
      ['array', [10]],
      ['object', { amount: 10 }],
      ['null', null],
    ]

    for (const [label, amount] of hostileAmounts) {
      it(`a hostile bank payment amount (${label}) is a 4xx, never an unhandled 500`, async () => {
        const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
        const res = await submitBankPayment(app, cashierA, {
          orderId: order.id,
          amount,
          bankName: 'Bank A',
        })
        expect(res.status).toBeLessThan(500)
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect((await readOrder(prisma, order.id)).paidAmount).toBe(0)
      }, 30000)
    }

    it('idempotency: same key + same payload returns the same payment', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const idempotencyKey = 'b40-bank-idempotent-1'

      const res1 = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'REF-1',
        idempotencyKey,
      }).expect(201)

      const res2 = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'REF-1',
        idempotencyKey,
      })

      expect(res2.body.success).toBe(true)
      expect(res2.body.idempotent).toBe(true)

      const count = await prisma.orderPayment.count({ where: { orderId: order.id } })
      expect(count).toBe(1)
    }, 30000)

    it('idempotency: same key + different amount is rejected', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const idempotencyKey = 'b40-bank-idempotent-2'

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        idempotencyKey,
      }).expect(201)

      const res = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total + 100,
        bankName: 'Bank',
        idempotencyKey,
      })
      expect(res.status).toBe(409)
    }, 30000)
  })

  describe('BANK payment — no client-controlled completion', () => {
    it('a client cannot submit bank payment metadata with verified=true or status=completed', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'REF-X',
        metadata: {
          verified: true,
          verifiedBy: 'admin',
          status: 'COMPLETED',
        },
      }).expect(201)

      const payment = await paymentFor(order.id)
      expect(payment.status).toBe('PENDING')
      expect(payment.paidAt).toBeNull()

      const metadata = payment.metadata as Record<string, unknown>
      expect(metadata.verified).toBeUndefined()
      expect(metadata.verifiedBy).toBeUndefined()
      expect(metadata.status).toBeUndefined()

      const after = await readOrder(prisma, order.id)
      expect(after.paidAmount).toBe(0)
    }, 30000)

    it('reserved metadata keys are stripped from client input and cannot be used as settlement anchors', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        metadata: {
          checkoutRequestId: 'attacker-anchor',
          stripePaymentIntentId: 'attacker-pi',
        },
      }).expect(201)

      const payment = await paymentFor(order.id)
      const metadata = payment.metadata as Record<string, unknown>
      // B40 §58 — provider-reserved keys are never accepted from client metadata
      expect(metadata.checkoutRequestId).toBeUndefined()
      expect(metadata.stripePaymentIntentId).toBeUndefined()

      // An attacker cannot forge a callback anchor because no reserved key was stored
      const mpesa = new MpesaProvider()

      // Simulate storing a real anchor via the provider response (what production does)
      const stored = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      const storedMeta = (stored.metadata || {}) as Record<string, unknown>
      storedMeta.checkoutRequestId = 'legit-anchor'
      await prisma.orderPayment.update({
        where: { id: payment.id },
        data: { metadata: { ...storedMeta, checkoutRequestId: 'legit-anchor' } },
      })

      const forgedResponse = await mpesa.handleWebhook(
        mpesaCallback('legit-anchor', toMinor(order.total))
      )
      ;(forgedResponse as any).provider = 'MOCK'

      // The forged callback targets the bank payment's anchor but its provider
      // (M-Pesa/MOCK) does not match the payment's provider (BANK), so it is refused
      await applyProviderWebhook('M-Pesa', forgedResponse)

      const paymentAfter = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(paymentAfter.status).toBe('PENDING')
    }, 30000)
  })

  describe('BANK payment — RBAC', () => {
    it('a cashier (payments_process) can submit bank payments', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-1',
      })
      expect(res.status).toBe(201)
    }, 30000)

    it('a cashier cannot verify a bank payment (requires finance_edit)', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-2',
      }).expect(201)

      const payment = await paymentFor(order.id)
      const res = await verifyBankPayment(app, cashierA, { paymentId: payment.id })
      expect(res.status).toBe(403)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('PENDING')
    }, 30000)

    it('a cashier cannot reject a bank payment (requires finance_edit)', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-3',
      }).expect(201)

      const payment = await paymentFor(order.id)
      const res = await rejectBankPayment(app, cashierA, { paymentId: payment.id })
      expect(res.status).toBe(403)
    }, 30000)

    it('an accountant (finance_view only) cannot verify bank payments', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-4',
      }).expect(201)

      const payment = await paymentFor(order.id)
      const res = await verifyBankPayment(app, accountantA, { paymentId: payment.id })
      expect(res.status).toBe(403)
    }, 30000)

    it('an auditor cannot verify bank payments', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-5',
      }).expect(201)

      const payment = await paymentFor(order.id)
      const res = await verifyBankPayment(app, auditorA, { paymentId: payment.id })
      expect(res.status).toBe(403)
    }, 30000)

    it('a restricted user cannot submit bank payments', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await submitBankPayment(app, restrictedA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
      })
      expect(res.status).toBe(403)
    }, 30000)

    it('an admin (finance_edit) can verify a bank payment', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-6',
      }).expect(201)

      const payment = await paymentFor(order.id)

      const res = await verifyBankPayment(app, adminA, {
        paymentId: payment.id,
        verificationNotes: 'Verified deposit confirmed',
      }).expect(200)

      expect(res.body.success).toBe(true)
      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('COMPLETED')
      expect(after.paidAt).not.toBeNull()

      const metadata = after.metadata as Record<string, unknown>
      expect(metadata.verifiedBy).toBe(adminA.user.id)
      expect(metadata.verifiedAt).toBeTruthy()
      expect(metadata.verificationNotes).toBe('Verified deposit confirmed')

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBeCloseTo(order.total, 2)
      expect(orderAfter.balance).toBeCloseTo(0, 2)
    }, 30000)
  })

  describe('BANK payment — tenant isolation', () => {
    it('submitting against another tenant order is refused', async () => {
      const res = await submitBankPayment(app, cashierA, {
        orderId: fixture.orgB.orderId,
        amount: 100,
        bankName: 'Bank',
      })
      expect([403, 404]).toContain(res.status)
    }, 30000)

    it('verifying another tenant bank payment is refused', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-isolate',
      }).expect(201)

      const payment = await paymentFor(order.id)

      const adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
      const res = await verifyBankPayment(app, adminB, {
        paymentId: payment.id,
      })
      expect([403, 404]).toContain(res.status)
    }, 30000)
  })

  describe('BANK payment — verification integrity', () => {
    it('verification of a PENDING payment settles the order exactly once', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-once',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('COMPLETED')

      // Second verify is idempotent (already COMPLETED)
      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBeCloseTo(order.total, 2)
      expect(orderAfter.balance).toBeCloseTo(0, 2)
    }, 30000)

    it('verifying an already-COMPLETED bank payment is idempotent', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)
      const res2 = await verifyBankPayment(app, adminA, { paymentId: payment.id })
      expect(res2.status).toBe(200)
    }, 30000)

    it('verifying a FAILED/REJECTED payment is refused', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-reject-verify',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await rejectBankPayment(app, adminA, {
        paymentId: payment.id,
        rejectionNotes: 'Insufficient funds',
      }).expect(200)

      const res = await verifyBankPayment(app, adminA, { paymentId: payment.id })
      expect(res.status).toBe(409)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('FAILED')
    }, 30000)

    it('bank verification overpayment is prevented (bank payment amount > order total)', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total * 10,
        bankName: 'Bank',
        bankAccountReference: 'TXN-overpay',
      }).expect(201)

      const payment = await paymentFor(order.id)

      const res = await verifyBankPayment(app, adminA, { paymentId: payment.id })
      expect(res.status).toBe(200)
      expect(res.body.data.settled).toBe(false)
      expect(res.body.data.reason).toBe('ORDER_COLLECTION_EXCEEDED')

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('PENDING')
      expect(after.paidAt).toBeNull()

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBe(0)
      expect(orderAfter.balance).toBeCloseTo(order.total, 2)
    }, 30000)
  })

  describe('BANK payment — rejection', () => {
    it('rejection sets status to FAILED and does not settle the order', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-reject',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await rejectBankPayment(app, adminA, {
        paymentId: payment.id,
        rejectionNotes: 'Payment bounced',
      }).expect(200)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('FAILED')
      expect(after.paidAt).toBeNull()

      const metadata = after.metadata as Record<string, unknown>
      expect(metadata.verifiedBy).toBe(adminA.user.id)
      expect(metadata.verifiedAt).toBeTruthy()
      expect(metadata.rejectionNotes).toBe('Payment bounced')

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBe(0)
      expect(orderAfter.balance).toBeCloseTo(order.total, 2)
    }, 30000)

    it('rejection of a COMPLETED payment is refused', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      const res = await rejectBankPayment(app, adminA, { paymentId: payment.id })
      expect(res.status).toBe(409)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('COMPLETED')
    }, 30000)
  })

  describe('BANK payment — duplicate reference prevention', () => {
    it('the same bankAccountReference can be used across different payments', async () => {
      const order1 = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const order2 = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order1.id,
        amount: order1.total,
        bankName: 'Bank',
        bankAccountReference: 'SHARED-REF',
      }).expect(201)

      await submitBankPayment(app, cashierA, {
        orderId: order2.id,
        amount: order2.total,
        bankName: 'Bank',
        bankAccountReference: 'SHARED-REF',
      }).expect(201)

      const count1 = await prisma.orderPayment.count({ where: { orderId: order1.id } })
      const count2 = await prisma.orderPayment.count({ where: { orderId: order2.id } })
      expect(count1).toBe(1)
      expect(count2).toBe(1)
    }, 30000)

    it('a payment cannot be verified twice to settle the order a second time', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-twice',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      let settledOrder = await readOrder(prisma, order.id)
      expect(settledOrder.balance).toBeCloseTo(0, 2)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      const after = await readOrder(prisma, order.id)
      expect(after.paidAmount).toBeCloseTo(order.total, 2)
      expect(after.balance).toBeCloseTo(0, 2)
    }, 30000)
  })

  describe('BANK payment — concurrency', () => {
    it('two concurrent verifications settle the order exactly once', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Bank',
        bankAccountReference: 'TXN-concurrent',
      }).expect(201)

      const payment = await paymentFor(order.id)

      const results = await Promise.allSettled([
        verifyBankPayment(app, adminA, { paymentId: payment.id }),
        verifyBankPayment(app, adminA, { paymentId: payment.id }),
      ])

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe('COMPLETED')

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBeCloseTo(order.total, 2)
      expect(orderAfter.balance).toBeCloseTo(0, 2)
    }, 30000)
  })

  describe('BANK payment — audit logging', () => {
    it('bank payment submission is audited', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Audit Bank',
        bankAccountReference: 'TXN-AUDIT-1',
      }).expect(201)

      const payment = await paymentFor(order.id)

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: payment.id, action: 'PAYMENT_INITIATED' },
        orderBy: { createdAt: 'desc' },
      })
      expect(audit).not.toBeNull()
      expect(audit.userId).toBe(cashierA.user.id)
      const auditMeta = audit.metadata as Record<string, unknown>
      expect(auditMeta.bankAction).toBe('SUBMITTED')
    }, 30000)

    it('bank payment verification is audited', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Audit Bank',
        bankAccountReference: 'TXN-AUDIT-2',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await verifyBankPayment(app, adminA, { paymentId: payment.id }).expect(200)

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: payment.id, action: 'PAYMENT_COMPLETED' },
        orderBy: { createdAt: 'desc' },
      })
      expect(audit).not.toBeNull()
      expect(audit.userId).toBe(adminA.user.id)
      const metadata = audit.metadata as Record<string, unknown>
      expect(metadata.ledgerApplied).toBe(true)
      expect(metadata.bankAction).toBe('VERIFIED')
    }, 30000)

    it('bank payment rejection is audited', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Audit Bank',
        bankAccountReference: 'TXN-AUDIT-3',
      }).expect(201)

      const payment = await paymentFor(order.id)

      await rejectBankPayment(app, adminA, {
        paymentId: payment.id,
        rejectionNotes: 'Audit test rejection',
      }).expect(200)

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: payment.id, action: 'PAYMENT_FAILED' },
        orderBy: { createdAt: 'desc' },
      })
      expect(audit).not.toBeNull()
      expect(audit.userId).toBe(adminA.user.id)
      const auditMeta = audit.metadata as Record<string, unknown>
      expect(auditMeta.bankAction).toBe('REJECTED')
    }, 30000)
  })

  describe('BANK payment — authentication', () => {
    it('unauthenticated callers cannot submit bank payments', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      const res = await request(app)
        .post('/api/payments/bank/submit')
        .send({
          orderId: order.id,
          amount: order.total,
          bankName: 'Bank',
        })
      expect(res.status).toBe(401)
    }, 30000)

    it('unauthenticated callers cannot verify bank payments', async () => {
      const res = await request(app)
        .post('/api/payments/bank/verify')
        .send({ paymentId: 'nonexistent' })
      expect(res.status).toBe(401)
    }, 30000)

    it('unauthenticated callers cannot reject bank payments', async () => {
      const res = await request(app)
        .post('/api/payments/bank/reject')
        .send({ paymentId: 'nonexistent' })
      expect(res.status).toBe(401)
    }, 30000)
  })

  describe('BANK payment — reports do not count pending/unverified', () => {
    it('a pending bank payment does not appear as completed revenue in reports', async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

      await submitBankPayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        bankName: 'Pending Bank',
        bankAccountReference: 'TXN-REPORT',
      }).expect(201)

      const payment = await paymentFor(order.id)
      expect(payment.status).toBe('PENDING')

      const agg = await prisma.orderPayment.aggregate({
        _sum: { amount: true },
        where: {
          orderId: order.id,
          status: 'COMPLETED',
        },
      })
      expect(Number(agg._sum.amount ?? 0)).toBe(0)

      const orderAfter = await readOrder(prisma, order.id)
      expect(orderAfter.paidAmount).toBe(0)
    }, 30000)
  })
})

describe('B40 Bank Payment — order state interaction', () => {
  let app: Express
  let fixture: SecurityFixture
  let prisma: any
  let cashierA: AuthTokens
  let adminA: AuthTokens

  beforeAll(async () => {
    app = await getApp()
    fixture = await setupSecurityFixtures()
    prisma = await getPrisma()
    cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
    adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  }, 120000)

  afterAll(async () => {
    await disconnect()
  })

  it('submitting against a cancelled order is refused', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(cashierA))
      .send({ status: 'CANCELLED' })
      .expect(200)

    const orderAfter = await prisma.order.findUnique({ where: { id: order.id } })
    expect(orderAfter.status).toBe('CANCELLED')

    const res = await submitBankPayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      bankName: 'Bank',
    })
    expect(res.status).toBe(400)
  }, 30000)
})
