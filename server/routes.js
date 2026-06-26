// ─────────────────────────────────────────────────────────────────────────────
// routes.js — REST API. The one rule that matters most: the public match view
// NEVER includes exactAddress. It is returned only by /confirm, to the parties.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { findMatches } = require('./matching');
const { confirmMatch, confirmCollection, completeAndSettle } = require('./matchFlow');

// — listings —
router.post('/legs',  async (req, res) => res.json(await prisma.leg.create({  data: req.body })));
router.post('/loads', async (req, res) => res.json(await prisma.load.create({ data: req.body })));

// — suggested matches (PUBLIC VIEW: suburb + city + km + economics only) —
router.get('/matches', async (req, res) => {
  const matches = await findMatches(prisma);
  const view = await Promise.all(matches.map(async (m) => {
    const leg  = await prisma.leg.findUnique({  where: { id: m.legId } });
    const load = await prisma.load.findUnique({ where: { id: m.loadId } });
    return {
      legId: m.legId, loadId: m.loadId,
      lane: `${leg.collectSuburb} → ${load.deliverSuburb}`,
      cities: `${leg.originCity} → ${leg.destCity}`,
      vehicle: leg.vehicleType,
      distanceKm: m.distanceKm,
      freightValue: m.freightValue, commission: m.commission, carrierRecovery: m.carrierRecovery,
      // 🔒 exactAddress deliberately omitted
    };
  }));
  res.json(view);
});

// — confirm: runs identity + payment hold + optional cover, releases addresses —
router.post('/matches/confirm', async (req, res, next) => {
  try {
    const { legId, loadId, driverId, withCover } = req.body;
    const result = await confirmMatch(prisma, { legId, loadId, driverId, withCover });
    res.json(result);                              // includes released addresses + collection PIN
  } catch (e) { next(e); }
});

// — collection: shipper verifies the driver's PIN at pickup —
router.post('/matches/:id/collect', async (req, res, next) => {
  try { res.json(await confirmCollection(prisma, { matchId: req.params.id, pin: req.body.pin })); }
  catch (e) { next(e); }
});

// — completion: split funds, commission deducted before carrier payout —
router.post('/matches/:id/complete', async (req, res, next) => {
  try { res.json(await completeAndSettle(prisma, { matchId: req.params.id })); }
  catch (e) { next(e); }
});

module.exports = router;
