/**
 * Master menu: one customer list, one rider list, true counts.
 *
 * Run: node tests/master-people-merge.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri(), { dbName: 'master_people' });
let failed = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failed += 1; console.log(`  FAIL  ${label}\n        ${e.stack || e.message}`); }
};

const db = mongoose.connection.db;
const oid = () => new mongoose.Types.ObjectId();
const { setCustomerBlocked, listGlobalUsers } = await import('../src/core/users/globalUsers.service.js');
const { FoodRefreshToken } = await import('../src/core/refreshTokens/refreshToken.model.js');
const admin = await import('../src/modules/food/admin/services/admin.service.js');

const asha = oid(); const gone = oid(); const ashaQc = oid();
await db.collection('users').insertMany([
  { _id: asha, name: 'Asha', phone: '9000000001', isActive: true, createdAt: new Date() },
  { _id: gone, name: 'Gone', phone: '9000000002', isActive: true, deletedAt: new Date(), createdAt: new Date() },
]);
// Left behind by the removed quick-commerce vertical.
await db.collection('qc_users').insertOne({ _id: ashaQc, phone: '+919000000001', isActive: true });
await FoodRefreshToken.collection.insertOne({ userId: asha, token: 'f', expiresAt: new Date(Date.now() + 1e9) });

await check('All Customers leaves deleted accounts out', async () => {
  const r = await listGlobalUsers({});
  assert.deepEqual(r.users.map((u) => u.name), ['Asha']);
});

await check('block reaches Food and Taxi, and signs the customer out', async () => {
  const r = await setCustomerBlocked(String(asha), true);
  assert.equal(r.isActive, false);
  const u = await db.collection('users').findOne({ _id: asha });
  assert.equal(u.isActive, false);
  assert.equal(u.active, false);
  assert.equal(await FoodRefreshToken.countDocuments({ userId: asha }), 0);
  assert.equal((await db.collection('qc_users').findOne({ _id: ashaQc })).isActive, true, 'old quick-commerce row left alone');
  assert.equal(u.name, 'Asha'); // nothing else touched
});

await check('unblock restores every app', async () => {
  await setCustomerBlocked(String(asha), false);
  const u = await db.collection('users').findOne({ _id: asha });
  assert.equal(u.active, true);
  assert.equal(u.isActive, true);
});

await check('a deleted or unknown customer is not found', async () => {
  assert.equal(await setCustomerBlocked(String(gone), true), null);
  assert.equal(await setCustomerBlocked(String(oid()), true), null);
});

const { FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js');
const rider = await FoodDeliveryPartner.collection.insertOne({ name: 'Rishi', phone: '9100000001', status: 'approved', createdAt: new Date() });
await FoodDeliveryPartner.collection.insertOne({ name: 'New', phone: '9100000002', status: 'pending', createdAt: new Date() });

await check('deleting a rider takes them off the rider list', async () => {
  await admin.deactivateDeliveryPartner(String(rider.insertedId));
  const r = await FoodDeliveryPartner.findById(rider.insertedId).lean();
  assert.equal(r.status, 'deactivated');
  assert.equal(r.availabilityStatus, 'offline');
});

await db.collection('taxidrivers').insertMany([
  { name: 'Cab', approve: true }, { name: 'Wait', approve: false }, { name: 'Owner', approve: false, onboarding_role: 'owner' },
]);
await db.collection('users').updateOne({ _id: asha }, { $set: { 'deletionRequest.status': 'pending' } });

await check('menu counts: riders once, taxi apart, customers once', async () => {
  const b = await admin.getSidebarBadges();
  assert.equal(b.masterRiders, 0); // the only approved rider was just deleted
  assert.equal(b.masterRiderRequests, 1);
  assert.equal(b.masterTaxiDrivers, 1);
  assert.equal(b.masterTaxiPending, 1);
  assert.equal(b.masterCustomers, 1);
  assert.equal(b.masterDeletionRequests, 1);
});

await mongoose.disconnect();
await server.stop();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
