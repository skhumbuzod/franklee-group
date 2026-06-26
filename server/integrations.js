// ─────────────────────────────────────────────────────────────────────────────
// integrations.js — thin adapters around third-party providers.
// Replace each body with the real SDK; the rest of the codebase never changes.
//
//  payments  → a gateway with split/escrow payouts
//              (e.g. Paystack, Peach Payments, Ozow, Stripe Connect)
//  identity  → KYC / ID + liveness verification provider
//  insurance → on-demand goods-in-transit cover (insurer API)
//
// NOTE: holding funds + paying out makes Franklee a payment facilitator —
// confirm the financial-services / FSP position before going live.
// ─────────────────────────────────────────────────────────────────────────────

const round = (n) => Math.round(n * 100) / 100;

const payments = {
  // Hold the full freight value from the shipper (escrow / authorise).
  async holdFreight({ shipperId, amount, reference }) {
    // const res = await gateway.charge({ customer: shipperId, amount, reference, capture: false });
    return { gatewayRef: `pay_${reference}`, status: 'HELD' };
  },

  // Release on completion: commission to Franklee, remainder to the carrier.
  // The fee is deducted BEFORE the carrier is paid — automatic, never invoiced.
  async settle({ gatewayRef, carrierBankingRef, commissionAmount, carrierPayout }) {
    // await gateway.capture(gatewayRef);
    // await gateway.transfer({ to: carrierBankingRef, amount: carrierPayout });
    // Franklee retains commissionAmount.
    return { status: 'RELEASED', commissionAmount, carrierPayout };
  },

  async refund({ gatewayRef }) {
    // await gateway.refund(gatewayRef);
    return { status: 'REFUNDED' };
  },
};

const identity = {
  // Verify the driver assigned to the trip (ID match + liveness).
  async verifyDriver(driver) {
    // const res = await kyc.verify({ idNumber: driver.idNumber, selfie: ... });
    return { verified: true };
  },

  // One-time code the shipper checks against the driver who shows up at collection.
  issueCollectionPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  },
};

const insurance = {
  // Quote per-load cover for the matched trip.
  async quote({ load, distanceKm }) {
    // const res = await insurer.quote({ value, weightTons: load.weightTons, distanceKm });
    return { premium: round(load.weightTons * distanceKm * 0.02) };
  },

  // Bind cover for the duration of the trip (sits over the carrier's own policy).
  async bind({ matchId, premium }) {
    // const res = await insurer.bind({ reference: matchId, premium });
    return { policyRef: `cov_${matchId}`, status: 'BOUND' };
  },
};

module.exports = { payments, identity, insurance };
