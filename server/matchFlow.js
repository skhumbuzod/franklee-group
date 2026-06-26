// ─────────────────────────────────────────────────────────────────────────────
// matchFlow.js — the heart of the system. Confirming a match is where the
// add-ons fire, all inside one DB transaction:
//   1. re-validate listings are still open AND insurance still valid on the day
//   2. [+identity] verify the driver, issue a collection PIN
//   3. [+payment]  HOLD the freight from the shipper (commission pre-computed)
//   4. [+cover]    optionally bind per-load goods-in-transit cover
//   5. lock leg + load, persist payment / commission / cover records
//   6. release exact addresses to the two parties only
// Money is split (commission deducted) at completion — see completeAndSettle().
// ─────────────────────────────────────────────────────────────────────────────

const { economics } = require('./matching');
const { payments, identity, insurance } = require('./integrations');

async function assertStillValid(tx, leg, load) {
  if (leg.status !== 'OPEN' || load.status !== 'OPEN') throw new Error('Listing no longer open');
  const now = new Date();
  // [+identity/compliance] insurance must be valid ON THE DAY, not just at sign-up
  const docs = await tx.complianceDoc.findMany({
    where: { userId: { in: [leg.carrierId, load.shipperId] }, type: 'GOODS_IN_TRANSIT' },
  });
  if (docs.some((d) => !d.verified || d.expiry < now)) throw new Error('Goods-in-transit cover invalid/expired');
}

async function confirmMatch(prisma, { legId, loadId, driverId, withCover }) {
  return prisma.$transaction(async (tx) => {
    const leg  = await tx.leg.findUnique({  where: { id: legId } });
    const load = await tx.load.findUnique({ where: { id: loadId } });
    if (!leg || !load) throw new Error('Leg/Load not found');

    await assertStillValid(tx, leg, load);                                  // (1)

    // (2) identity at the point of match
    const driver = await tx.driver.findFirst({ where: { id: driverId, carrierId: leg.carrierId } });
    if (!driver) throw new Error('Driver not linked to this carrier');
    const { verified } = await identity.verifyDriver(driver);
    if (!verified) throw new Error('Driver identity not verified');
    const collectionPin = identity.issueCollectionPin();

    const econ = economics(leg);

    // (3) payment — hold the freight value from the shipper
    const hold = await payments.holdFreight({
      shipperId: load.shipperId,
      amount: econ.freightValue,
      reference: `${legId}-${loadId}`,
    });

    // (4) optional per-load cover
    let cover = { status: 'NONE', premium: null, policyRef: null };
    if (withCover) {
      const { premium } = await insurance.quote({ load, distanceKm: econ.distanceKm });
      const bound = await insurance.bind({ matchId: `${legId}-${loadId}`, premium });
      cover = { status: 'BOUND', premium, policyRef: bound.policyRef };
    }

    // (5) lock listings + persist match with payment / commission / cover
    await tx.leg.update({  where: { id: legId },  data: { status: 'MATCHED' } });
    await tx.load.update({ where: { id: loadId }, data: { status: 'MATCHED' } });

    const match = await tx.match.create({
      data: {
        legId, loadId, driverId, collectionPin,
        ...econ,
        status: 'CONFIRMED', confirmedAt: new Date(),
        payment:       { create: { gatewayRef: hold.gatewayRef, freightAmount: econ.freightValue,
                                    commissionAmount: econ.commission, carrierPayout: econ.carrierRecovery,
                                    status: 'HELD' } },
        commissionRec: { create: { amount: econ.commission } },
        cover:         { create: { status: cover.status, premium: cover.premium, policyRef: cover.policyRef } },
      },
      include: { payment: true, cover: true },
    });

    // (6) exact addresses are now releasable — to the two parties ONLY
    return {
      match,
      collectionPin,                                  // shipper checks this at pickup
      released: { collectAddress: leg.exactAddress, deliverAddress: load.exactAddress },
    };
  });
}

// [+identity] verify the right truck collected the right load
async function confirmCollection(prisma, { matchId, pin }) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m || m.status !== 'CONFIRMED') throw new Error('Match not ready for collection');
  if (m.collectionPin !== pin) throw new Error('Collection PIN mismatch — wrong driver/truck');
  return prisma.match.update({ where: { id: matchId }, data: { status: 'COLLECTED' } });
}

// [+payment] on delivery: split funds — commission to Franklee, balance to carrier
async function completeAndSettle(prisma, { matchId }) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { payment: true, leg: true } });
  if (!m || m.status !== 'COLLECTED') throw new Error('Match not ready to settle');
  const carrier = await prisma.user.findUnique({ where: { id: m.leg.carrierId } });

  await payments.settle({
    gatewayRef:        m.payment.gatewayRef,
    carrierBankingRef: carrier.bankingRef,
    commissionAmount:  m.payment.commissionAmount,
    carrierPayout:     m.payment.carrierPayout,
  });

  await prisma.payment.update({    where: { matchId }, data: { status: 'RELEASED' } });
  await prisma.commission.update({ where: { matchId }, data: { collected: true } });
  return prisma.match.update({      where: { id: matchId }, data: { status: 'COMPLETED' } });
}

module.exports = { confirmMatch, confirmCollection, completeAndSettle };
