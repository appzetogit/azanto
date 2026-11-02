/**
 * A customer deleting their account: soft delete, signed out, number free.
 *
 * Run: node tests/customer-soft-delete.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri(), { dbName: 'customer_soft_delete' });
let failed = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failed += 1; console.log(`  FAIL  ${label}\n        ${e.stack || e.message}`); }
};

const db = mongoose.connection.db;
const { FoodUser } = await import('../src/core/users/user.model.js');
const { FoodRefreshToken } = await import('../src/core/refreshTokens/refreshToken.model.js');
const food = await import('../src/modules/food/user/services/userProfile.service.js');

const u = await FoodUser.create({ name: 'Asha', phone: '9800000001', isVerified: true });
// Left behind by the removed quick-commerce vertical; nothing touches it now.
const qc = (await db.collection('qc_users').insertOne({ phone: '9800000001', platformUserId: u._id, isActive: true })).insertedId;
await db.collection('food_orders').insertOne({ order_id: 'FOD-1', userId: u._id });
await FoodRefreshToken.collection.insertOne({ userId: u._id, token: 'a', expiresAt: new Date(Date.now() + 1e9) });

await check('delete keeps the record but closes it', async () => {
  const r = await food.deleteCurrentUserAccount(String(u._id), { reason: 'not using it' });
  assert.equal(r.success, true);
  const doc = await db.collection('users').findOne({ _id: u._id });
  assert.ok(doc.deletedAt);
  assert.equal(doc.isActive, false);
  assert.equal(doc.deletedPhone, '9800000001');
  assert.equal(doc.deletionReason, 'not using it');
  assert.ok(await db.collection('food_orders').findOne({ order_id: 'FOD-1' }), 'order kept');
});

await check('signed out, and the old quick-commerce row left alone', async () => {
  assert.equal(await FoodRefreshToken.countDocuments({ userId: u._id }), 0);
  const q = await db.collection('qc_users').findOne({ _id: qc });
  assert.equal(q.isActive, true);
  assert.equal(q.deletedAt, undefined);
});

await check('the number is free for a new sign-up', async () => {
  assert.equal(await FoodUser.findOne({ phone: '9800000001' }), null);
  const fresh = await FoodUser.create({ name: 'New', phone: '9800000001' });
  assert.notEqual(String(fresh._id), String(u._id));
});

await check('deleting twice is fine', async () => {
  const again = await food.deleteCurrentUserAccount(String(u._id));
  assert.equal(again.success, true);
});

await mongoose.disconnect();
await server.stop();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
