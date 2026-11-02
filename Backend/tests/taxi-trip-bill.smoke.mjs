/**
 * Taxi admin > Trip Requests: the complete bill of a ride and its split.
 *
 * Run: node tests/taxi-trip-bill.smoke.mjs
 */
import assert from 'node:assert/strict';

const { buildTripBill, paymentLabel } = await import('../src/modules/taxi/admin/tripBill.js');
const { computeRideFare } = await import('../src/modules/taxi/common/rideFare.js');

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};

// Palampur bike, 29 Oct: 30 trip + 1.50 tax + 4.50 fee + 0.81 GST = 37.
const q = computeRideFare({
    pricingRule: { base_price: 30, base_distance: 2, price_per_distance: 10, service_tax: 5, admin_commision: 15, admin_commision_type: 1, platform_fee_gst: 18 },
    distanceMeters: 1900,
});
const charges = Math.round((q.fareBeforeSurge - q.subtotal) * 100) / 100;
const ride = {
    fare: 37, status: 'completed', paymentMethod: 'cash', driverEarnings: 30, commissionAmount: 0,
    driverEarningsCreditedAt: new Date(),
    pricingSnapshot: {
        fare_before_surge: 37, platform_charges_amount: charges,
        service_tax_amount: q.serviceTax, platform_fee_amount: q.platformFee, platform_fee_gst_amount: q.platformFeeGst,
    },
};

await check('the bill lists trip fare, fee, GST on it, tax and rounding, adding up to what the customer paid', async () => {
    const b = buildTripBill(ride);
    const l = b.lines;
    assert.deepEqual([l.tripFare, l.platformFee, l.platformFeeGst, l.serviceTax, l.rounding, b.customerPays], [30, 4.5, 0.81, 1.5, 0.19, 37]);
    assert.equal(Math.round((l.tripFare + l.platformFee + l.platformFeeGst + l.serviceTax + l.rounding) * 100) / 100, 37);
});
await check('the split: driver 30, Quickdrops 7, of which 2.31 tax and GST', async () => {
    const s = buildTripBill(ride).split;
    assert.deepEqual([s.driverTripShare, s.driverTotal, s.quickdropsKeeps, s.taxesToGovernment, s.commission], [30, 30, 7, 2.31, 0]);
});
await check('a tip shows on the driver side, not as Quickdrops money', async () => {
    const s = buildTripBill({ ...ride, driverEarnings: 40, feedback: { tipAmount: 10 } }).split;
    assert.deepEqual([s.driverTripShare, s.tip, s.driverTotal, s.quickdropsKeeps], [30, 10, 40, 7]);
});
await check('a ride booked before the split was recorded says so instead of guessing', async () => {
    const b = buildTripBill({ fare: 51, status: 'completed', paymentMethod: 'cash', driverEarnings: 51, pricingSnapshot: {} });
    assert.equal(b.chargesRecorded, false);
    assert.deepEqual([b.lines.tripFare, b.lines.platformFee, b.customerPays, b.split.driverTotal, b.split.quickdropsKeeps], [null, null, 51, 51, 0]);
});
await check('payment shows the ride\'s own method, not always cash', async () => {
    assert.deepEqual(
        [paymentLabel({ paymentMethod: 'cash' }), paymentLabel({ paymentMethod: 'online' }), paymentLabel({ paymentMethod: 'cash', driverPaymentCollection: { status: 'paid' } })],
        ['Cash', 'Online', 'UPI QR'],
    );
});

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
