/**
 * A taxi/parcel driver is settled on the trip fare, not on the platform fee,
 * the GST on it, or the service tax the rider also paid.
 *
 * 29 Oct, Palampur bike: fare 37 = trip 30 + tax 1.50 + platform fee 4.50
 * + 18% GST on the fee 0.81, rounded. Commission from the driver is 0%, and
 * the driver was credited all 37.
 *
 * Run: node tests/taxi-driver-share-excludes-platform-charges.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
await mongoose.connect(replSet.getUri(), { dbName: 'driver_share' });

const { Ride } = await import('../src/modules/taxi/user/models/Ride.js');
const wallet = await import('../src/modules/taxi/driver/services/walletService.js');
const { computeRideFare } = await import('../src/modules/taxi/common/rideFare.js');
const { WalletTransaction } = await import('../src/modules/taxi/driver/models/WalletTransaction.js');
const { LedgerEntry } = await import('../src/core/finance/ledgerEntry.model.js');
const { PartnerBalance } = await import('../src/core/finance/partnerBalance.model.js');
const { FailedFinancialOperation } = await import('../src/core/finance/failedFinancialOperation.model.js');
await import('../src/modules/taxi/driver/models/Driver.js');
await LedgerEntry.syncIndexes();
await PartnerBalance.syncIndexes();
await mongoose.model('TaxiDriver').init();
await WalletTransaction.init();
await FailedFinancialOperation.init();
for (const M of [WalletTransaction, LedgerEntry, PartnerBalance, Ride]) await M.createCollection().catch(() => {});

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();

// Palampur's Bike row on 29 Oct.
const row = { base_price: 30, base_distance: 2, price_per_distance: 10, time_price: 0, service_tax: 5, admin_commision: 15, admin_commision_type: 1, platform_fee_gst: 18 };
const quote = computeRideFare({ pricingRule: row, distanceMeters: 1900, durationMinutes: 6 });
const charges = Math.round((quote.fareBeforeSurge - quote.subtotal) * 100) / 100;

const settle = async ({ snapshotCharges, paymentMethod = 'cash', driverCommission = 0 }) => {
    const driver = oid();
    await mongoose.model('TaxiDriver').collection.insertOne({ _id: driver, name: 'Rider', phone: String(Math.random()).slice(2, 12), wallet: { balance: 0 } });
    const ride = await Ride.create({
        userId: oid(), driverId: driver, status: 'completed', liveStatus: 'completed',
        fare: quote.fareBeforeSurge, baseFare: quote.fareBeforeSurge, paymentMethod,
        pickupLocation: { type: 'Point', coordinates: [76.5, 32.1] },
        dropLocation: { type: 'Point', coordinates: [76.51, 32.11] },
        pricingSnapshot: { admin_commission_type_from_driver: 1, admin_commission_from_driver: driverCommission, platform_charges_amount: snapshotCharges },
    });
    await wallet.settleCompletedRideWallet({ rideId: ride._id });
    const after = await Ride.findById(ride._id).lean();
    const d = await mongoose.model('TaxiDriver').collection.findOne({ _id: driver });
    return { after, balance: d.wallet.balance };
};

await check('the fare is 37: trip 30 + tax 1.50 + fee 4.50 + GST on fee 0.81, rounded', async () => {
    assert.deepEqual([quote.subtotal, quote.serviceTax, quote.platformFee, quote.platformFeeGst, quote.fareBeforeSurge], [30, 1.5, 4.5, 0.81, 37]);
    assert.equal(charges, 7);
});
await check('the driver earns the 30 trip fare, not 37', async () => {
    const { after } = await settle({ snapshotCharges: charges });
    assert.deepEqual([after.driverEarnings, after.commissionAmount, after.platformChargesAmount], [30, 0, 7]);
});
await check('on cash the driver holds 37 and owes the platform its 7', async () => {
    const { balance } = await settle({ snapshotCharges: charges });
    assert.equal(balance, -7);
});
await check('drivers pay no commission: a 10% "commission from driver" on the row is ignored', async () => {
    const { after } = await settle({ snapshotCharges: charges, driverCommission: 10 });
    assert.deepEqual([after.driverEarnings, after.commissionAmount], [30, 0]);
});
await check('a ride booked before the split was recorded settles as it always did', async () => {
    const { after } = await settle({ snapshotCharges: null });
    assert.equal(after.driverEarnings, 37);
});

await mongoose.disconnect();
await replSet.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
