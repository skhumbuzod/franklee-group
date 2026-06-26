// ─────────────────────────────────────────────────────────────────────────────
// matching.js — deterministic matching engine + economics (no ML needed)
// Suggested matches expose suburb + city + km + economics ONLY. Never exactAddress.
// ─────────────────────────────────────────────────────────────────────────────

const COMMISSION_RATE  = 0.10;   // Franklee fee (configurable)
const COST_PER_KM      = 20;     // deadhead cost assumption (R/km)
const DATE_WINDOW_DAYS = 2;

// Corridor distances (km). Swap for a maps Distance Matrix API in production.
const DIST = {
  'Gqeberha|Johannesburg': 1050,
  'Cape Town|Johannesburg': 1400,
  'Durban|Johannesburg':    580,
  'Cape Town|Gqeberha':     770,
};
function distance(a, b) {
  if (a === b) return 0;
  return DIST[`${a}|${b}`] ?? DIST[`${b}|${a}`] ?? 600;
}

function economics(leg) {
  const distanceKm      = distance(leg.originCity, leg.destCity);
  const freightValue    = leg.ratePerKm * distanceKm;
  const commission      = freightValue * COMMISSION_RATE;
  const carrierRecovery = freightValue - commission;
  const deadhead        = COST_PER_KM * distanceKm;
  return { distanceKm, freightValue, commission, carrierRecovery, deadhead };
}

function isCompatible(leg, load) {
  const days = Math.abs(+new Date(leg.date) - +new Date(load.date)) / 86_400_000;
  return (
    leg.originCity   === load.originCity  &&
    leg.destCity     === load.destCity    &&
    leg.vehicleType  === load.vehicleType &&     // vehicle is a hard criterion
    leg.capacityTons >= load.weightTons   &&
    days <= DATE_WINDOW_DAYS
  );
}

// Returns SUGGESTED matches, best recovery first. Public-safe fields only.
async function findMatches(prisma) {
  const [legs, loads] = await Promise.all([
    prisma.leg.findMany({  where: { status: 'OPEN' } }),
    prisma.load.findMany({ where: { status: 'OPEN' } }),
  ]);

  const out = [];
  for (const load of loads)
    for (const leg of legs)
      if (isCompatible(leg, load))
        out.push({ legId: leg.id, loadId: load.id, ...economics(leg) });

  return out.sort((a, b) => b.carrierRecovery - a.carrierRecovery);
}

module.exports = { findMatches, economics, isCompatible, distance, COMMISSION_RATE, COST_PER_KM };
