/**
 * The admin decides who pays the GST on a restaurant's food (gstPayout). Set
 * to 'restaurant', the GST is paid to it; set to 'platform' (the default), it
 * is not and the platform remits it -- whatever "GST registered?" says, since
 * the restaurant can edit that itself. Rs 100 incl. 5% GST at 10% commission:
 * registered 90.48, unregistered 85.72 (commission rounds to 9.52).
 *
 * Run: node tests/restaurant-gst-registered-payout.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'gst_registered_payout' });
const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
const { FoodTransaction } = await import('../src/modules/food/orders/models/foodTransaction.model.js');
const { FoodUser } = await import('../src/core/users/user.model.js').catch(() => ({ FoodUser: null }));
const { createInitialTransaction } = await import('../src/modules/food/orders/services/foodTransaction.service.js');
const { attachRestaurantPayout } = await import('../src/modules/food/shared/restaurantPayout.js');
await FoodTransaction.createCollection().catch(() => {});

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
const restaurant = async (gstPayout, extra = {}) => (await FoodRestaurant.collection.insertOne({
    _id: oid(), restaurantName: gstPayout === 'restaurant' ? 'Registered' : 'Unregistered', ownerPhone: String(Math.random()).slice(2, 12),
    status: 'approved', gstRegistered: true, gstNumber: '02ABCDE1234F1Z5', ...(gstPayout ? { gstPayout } : {}), createdAt: new Date(), ...extra,
})).insertedId;
const userId = FoodUser ? (await FoodUser.collection.insertOne({ _id: oid(), phone: '9000000000' })).insertedId : oid();
const order = (restaurantId) => ({
    _id: oid(), orderId: `T${Math.random()}`.slice(0, 10), restaurantId, userId,
    pricing: { subtotal: 100, commissionableAmount: 95.24, pricesIncludeGst: true, gstRate: 5, restaurantCommission: 9.52, tax: 4.76, total: 100, packagingFee: 0 },
    payment: { method: 'cash', status: 'pending' },
});

const reg = order(await restaurant('restaurant'));
// Registered, with a GSTIN, but the admin chose the platform pays.
const unreg = order(await restaurant('platform'));
// Registered, with a GSTIN, and no admin choice yet: the old rule (GST to it).
const undecided = order(await restaurant(undefined));
let regTx; let unregTx;
await check('the ledger pays the GST only where the admin chose the restaurant pays it', async () => {
    regTx = await createInitialTransaction(reg);
    unregTx = await createInitialTransaction(unreg);
    assert.deepEqual([regTx.amounts.restaurantShare, regTx.amounts.restaurantGstPassThrough], [90.48, 4.76]);
    assert.deepEqual([unregTx.amounts.restaurantShare, unregTx.amounts.restaurantGstPassThrough], [85.72, 0]);
});
await check('a restaurant the admin has not set yet keeps the old rule (registered with a GSTIN: GST paid to it)', async () => {
    const tx = await createInitialTransaction(undecided);
    assert.deepEqual([tx.amounts.restaurantShare, tx.amounts.restaurantGstPassThrough], [90.48, 4.76]);
    const { listRestaurantGst } = await import('../src/modules/food/restaurant/services/gstPayout.service.js');
    const row = (await listRestaurantGst()).find((r) => r.restaurantId === String(undecided.restaurantId));
    assert.deepEqual([row.gstPayout, row.decided], ['restaurant', false]);
});
await check('the restaurant\'s bill shows the same payout as the ledger', async () => {
    const [a, b] = await attachRestaurantPayout([{ ...reg }, { ...unreg }]);
    assert.deepEqual([a.restaurantPayout.payoutWithoutGst, a.restaurantPayout.gstPaidToRestaurant, a.restaurantPayout.payout], [85.72, 4.76, 90.48]);
    assert.deepEqual([b.restaurantPayout.gstPaidToRestaurant, b.restaurantPayout.payout], [0, 85.72]);
});

const gst = await import('../src/modules/food/restaurant/services/gstPayout.service.js');
await check('the admin cannot choose "restaurant pays" for a restaurant with no GSTIN', async () => {
    const noGstin = await restaurant(undefined, { gstNumber: '' });
    await assert.rejects(gst.setRestaurantGstPayout(String(noGstin), 'restaurant'), /no GSTIN/);
    const ok = await gst.setRestaurantGstPayout(String(unreg.restaurantId), 'restaurant', { actor: 'Platform Admin' });
    assert.deepEqual([ok.gstPayout, ok.updatedBy], ['restaurant', 'Platform Admin']);
    await gst.setRestaurantGstPayout(String(unreg.restaurantId), 'platform');
});
await check('a GSTIN can be added from the page, which then allows "restaurant pays"', async () => {
    const r = await restaurant(undefined, { gstNumber: '', gstRegistered: false });
    await assert.rejects(gst.setRestaurantGstin(String(r), 'NOTAGSTIN'), /not a valid GSTIN/);
    const saved = await gst.setRestaurantGstin(String(r), ' 03abcde1234f1z5 ');
    assert.deepEqual([saved.gstNumber, saved.gstRegistered], ['03ABCDE1234F1Z5', true]);
    assert.equal((await gst.setRestaurantGstPayout(String(r), 'restaurant')).gstPayout, 'restaurant');
});
await check('removing the GSTIN puts a "restaurant pays" restaurant back on Quickdrops pays', async () => {
    const r = await restaurant('restaurant');
    const cleared = await gst.setRestaurantGstin(String(r), '');
    assert.deepEqual([cleared.gstNumber, cleared.gstPayout], ['', 'platform']);
});
await check('the filing totals split GST into owed by the platform and paid to restaurants', async () => {
    const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
    await FoodOrder.collection.insertMany([
        { ...reg, orderStatus: 'delivered', createdAt: new Date() },
        { ...unreg, orderStatus: 'delivered', createdAt: new Date() },
    ]);
    const t = await gst.gstTotals({ from: new Date(Date.now() - 3600_000), to: new Date() });
    assert.deepEqual([t.total.orders, t.total.gstOnFood, t.total.paidToRestaurants, t.total.owedByPlatform], [2, 9.52, 4.76, 4.76]);
});

await mongoose.disconnect();
await mongo.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
