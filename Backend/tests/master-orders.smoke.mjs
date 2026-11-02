/**
 * Master > Orders lists every order on the platform, per tab: Food, Taxi and
 * Parcel. Rows left in the removed quick-commerce collection never appear.
 *
 * Run: node tests/master-orders.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri(), { dbName: 'master_orders' });
let failed = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failed += 1; console.log(`  FAIL  ${label}\n        ${e.stack || e.message}`); }
};

const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
const { Ride } = await import('../src/modules/taxi/user/models/Ride.js');
const { listMasterOrders } = await import('../src/core/orders/masterOrders.service.js');
const db = mongoose.connection.db;

const oid = () => new mongoose.Types.ObjectId();
const t = (min) => new Date(Date.now() - min * 60000);
const foodUser = oid(); const qcUser = oid(); const rider = oid(); const store = oid(); const pharmacy = oid();
await db.collection('users').insertOne({ _id: foodUser, name: 'Asha', phone: '9000000001' });
await db.collection('qc_users').insertOne({ _id: qcUser, name: 'Ravi', phone: '9000000002' });
await db.collection('food_restaurants').insertOne({ _id: store, restaurantName: 'Rainbow Restaurant' });
await db.collection('qc_restaurants').insertOne({ _id: pharmacy, restaurantName: 'Quick Medical' });
await db.collection('food_delivery_partners').insertOne({ _id: rider, name: 'Rishi', phone: '9000000003' });

await FoodOrder.collection.insertMany([
  { order_id: 'FOD-1', orderStatus: 'preparing', userId: foodUser, restaurantId: store, pricing: { total: 250 }, payment: { method: 'cash' }, dispatch: { status: 'unassigned' }, createdAt: t(1) },
  { order_id: 'FOD-2', orderStatus: 'delivered', userId: foodUser, restaurantId: store, pricing: { total: 120 }, dispatch: { status: 'accepted', deliveryPartnerId: rider }, createdAt: t(50) },
]);
// Left behind by the removed quick-commerce vertical.
await db.collection('qc_orders').insertMany([
  { order_id: 'QC-1', orderStatus: 'confirmed', userId: qcUser, pricing: { total: 80 }, createdAt: t(3) },
  { order_id: 'MED-1', orderStatus: 'preparing', userId: qcUser, restaurantId: pharmacy, prescriptionOnly: true, pricing: { total: 325 }, createdAt: t(2) },
]);
await Ride.collection.insertMany([
  { userId: foodUser, serviceType: 'ride', liveStatus: 'completed', status: 'completed', fare: 90, pickupAddress: 'A', dropAddress: 'B', createdAt: t(4) },
  { userId: foodUser, serviceType: 'parcel', liveStatus: 'searching', status: 'searching', fare: 54, pickupAddress: 'C', dropAddress: 'D', createdAt: t(5) },
]);

await check('All: every order, newest first, with counts per service', async () => {
  const r = await listMasterOrders({ tab: 'all' });
  assert.deepEqual(r.orders.map((o) => o.source), ['food', 'taxi', 'parcel', 'food']);
  assert.equal(r.total, 4);
  assert.deepEqual(r.counts, { food: 2, taxi: 1, parcel: 1 });
  assert.ok(!r.orders.some((o) => ['QC-1', 'MED-1'].includes(o.orderId)), 'qc_orders rows listed');
});

await check('each tab shows only its service; the quick and medical tabs are gone', async () => {
  assert.deepEqual((await listMasterOrders({ tab: 'food' })).orders.map((o) => o.orderId), ['FOD-1', 'FOD-2']);
  await assert.rejects(listMasterOrders({ tab: 'medical' }), /Unknown tab/);
  await assert.rejects(listMasterOrders({ tab: 'quick' }), /Unknown tab/);
  assert.equal((await listMasterOrders({ tab: 'parcel' })).orders[0].source, 'parcel');
  assert.equal((await listMasterOrders({ tab: 'taxi' })).orders[0].source, 'taxi');
});

await check('rows carry names, store, rider, and the API vertical for assigning', async () => {
  const { orders } = await listMasterOrders({ tab: 'all' });
  const fod2 = orders.find((o) => o.orderId === 'FOD-2');
  assert.equal(fod2.customerName, 'Asha');
  assert.equal(fod2.storeName, 'Rainbow Restaurant');
  assert.equal(fod2.riderName, 'Rishi');
  assert.equal(fod2.vertical, 'food');
});

await check('status filter and order-number search', async () => {
  assert.deepEqual((await listMasterOrders({ tab: 'food', status: 'delivered' })).orders.map((o) => o.orderId), ['FOD-2']);
  const active = await listMasterOrders({ tab: 'all', status: 'active' });
  assert.ok(!active.orders.some((o) => ['FOD-2'].includes(o.orderId)));
  assert.ok(active.orders.some((o) => o.source === 'parcel'));
  assert.deepEqual((await listMasterOrders({ tab: 'all', search: 'fod-2' })).orders.map((o) => o.orderId), ['FOD-2']);
  assert.deepEqual((await listMasterOrders({ tab: 'all', search: 'med-1' })).orders, []);
});

await check('paging across services', async () => {
  const p1 = await listMasterOrders({ tab: 'all', limit: 3, page: 1 });
  const p2 = await listMasterOrders({ tab: 'all', limit: 3, page: 2 });
  assert.equal(p1.orders.length, 3);
  assert.equal(p2.orders.length, 1);
  assert.equal(new Set([...p1.orders, ...p2.orders].map((o) => o._id)).size, 4);
});

await mongoose.disconnect();
await server.stop();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
