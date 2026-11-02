/**
 * Delete on Master > All Orders: finished, unpaid orders go; live or paid ones stay.
 *
 * Run: node tests/master-order-delete.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri(), { dbName: 'master_order_delete' });
let failed = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failed += 1; console.log(`  FAIL  ${label}\n        ${e.stack || e.message}`); }
};

const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
const { Ride } = await import('../src/modules/taxi/user/models/Ride.js');
const { deleteMasterOrder, listMasterOrders } = await import('../src/core/orders/masterOrders.service.js');
const ins = async (M, doc) => (await M.collection.insertOne({ createdAt: new Date(), ...doc })).insertedId;

const cancelledFood = await ins(FoodOrder, { order_id: 'FOD-C', orderStatus: 'cancelled_by_restaurant', payment: { method: 'cash', status: 'cod_pending' } });
const liveFood = await ins(FoodOrder, { order_id: 'FOD-L', orderStatus: 'preparing', payment: { method: 'cash' } });
const unpaidFood = await ins(FoodOrder, { order_id: 'FOD-P', orderStatus: 'pending_payment', payment: { method: 'razorpay', status: 'pending' } });
const paidFood = await ins(FoodOrder, { order_id: 'FOD-D', orderStatus: 'delivered', payment: { method: 'razorpay', status: 'paid' } });
const doneRide = await ins(Ride, { serviceType: 'parcel', status: 'cancelled', liveStatus: 'cancelled', fare: 50 });
const liveRide = await ins(Ride, { serviceType: 'ride', status: 'accepted', liveStatus: 'accepted', fare: 90 });

await check('a cancelled Food order and an unpaid one are deleted', async () => {
  assert.equal((await deleteMasterOrder({ source: 'food', id: String(cancelledFood) })).deleted, true);
  assert.equal(await FoodOrder.collection.findOne({ _id: cancelledFood }), null);
  assert.equal((await deleteMasterOrder({ source: 'food', id: String(unpaidFood) })).deleted, true);
  assert.equal(await FoodOrder.collection.findOne({ _id: unpaidFood }), null);
});

await check('an order in progress is refused', async () => {
  await assert.rejects(deleteMasterOrder({ source: 'food', id: String(liveFood) }), /in progress/);
  assert.ok(await FoodOrder.collection.findOne({ _id: liveFood }));
});

await check('a delivered, paid order is refused (payment and payouts stay)', async () => {
  await assert.rejects(deleteMasterOrder({ source: 'food', id: String(paidFood) }), /cannot be deleted/);
  assert.ok(await FoodOrder.collection.findOne({ _id: paidFood }));
});

await check('the removed quick and medical sources are refused', async () => {
  for (const source of ['quick', 'medical']) {
    await assert.rejects(deleteMasterOrder({ source, id: String(paidFood) }), /Unknown order type/);
  }
});

await check('a finished trip is removed from the lists; a live one is refused', async () => {
  await deleteMasterOrder({ source: 'parcel', id: String(doneRide) });
  const { orders } = await listMasterOrders({ tab: 'all' });
  assert.ok(!orders.some((o) => o._id === String(doneRide)));
  await assert.rejects(deleteMasterOrder({ source: 'taxi', id: String(liveRide) }), /in progress/);
});

await check('unknown order is a 404', async () => {
  assert.equal(await deleteMasterOrder({ source: 'food', id: String(new mongoose.Types.ObjectId()) }), null);
});

await mongoose.disconnect();
await server.stop();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
