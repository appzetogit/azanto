/**
 * One customer inbox across Food and Taxi.
 *
 * Run: node tests/customer-inbox.smoke.mjs
 *
 * Drives the real push senders, then reads the inbox the app reads
 * (getInboxNotifications, ownerType USER, the platform user id):
 *   - every customer push is filed, even with no device registered;
 *   - an id that is not a platform account -- such as a customer row left in
 *     the removed quick-commerce or services collections -- is not filed
 *     anywhere unreadable;
 *   - the same update twice is filed once; restaurants and riders are not
 *     customers; skipInbox is honoured;
 *   - the inbox shows both services, newest first.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.MONGOMS_STARTUP_TIMEOUT ||= '180000';

let failed = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${label}\n        ${err.stack || err.message}`);
  }
};

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
process.env.MONGODB_URI = mongod.getUri();
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection;

const core = await import('../src/core/notifications/firebase.service.js');
const taxi = await import('../src/modules/taxi/services/pushNotificationService.js');
const { getInboxNotifications } = await import('../src/core/notifications/notification.service.js');
const { FoodNotification } = await import('../src/core/notifications/models/notification.model.js');

const oid = () => new mongoose.Types.ObjectId();

// Asha has one platform account. Rows for her are also left in the removed
// quick-commerce and services collections, linked and by phone.
const asha = oid();
const ashaQuickLinked = oid();
const ashaQuickByPhone = oid();
const ashaServices = oid();
await db.collection('users').insertOne({ _id: asha, name: 'Asha', phone: '9876543210' });
await db.collection('qc_users').insertMany([
  { _id: ashaQuickLinked, phone: '9876543210', platformUserId: asha },
  { _id: ashaQuickByPhone, phone: '+91 98765 43210' },
]);
await db.collection('sp_users').insertOne({ _id: ashaServices, phone: '9876543210', platformUserId: asha });

const inbox = async () => (await getInboxNotifications({ ownerType: 'USER', ownerId: String(asha), limit: 50 })).items;
const push = (sender, ownerId, title, body, data = {}, extra = {}) =>
  sender.sendNotificationToOwner({ ownerType: 'USER', ownerId: String(ownerId), payload: { title, body, data, ...extra } });

console.log('\nFiled from every sender');
await check('Food: filed under the platform account, though Asha has no device registered', async () => {
  await push(core, asha, 'Order accepted', 'Joy is preparing your order', { type: 'order_status', orderId: 'FOD-1' });
  const n = (await inbox()).find((x) => x.title === 'Order accepted');
  assert.ok(n, 'not in inbox');
  assert.equal(n.vertical, 'food');
  assert.equal(n.source, 'ORDER');
  assert.equal(n.metadata.data.orderId, 'FOD-1');
});
await check('Taxi: a ride update to a rider is filed', async () => {
  await taxi.sendPushNotificationToEntities({ userIds: [String(asha)], title: 'Driver arriving', body: 'Ravi is 2 minutes away', data: { rideId: 'R1' } });
  const n = (await inbox()).find((x) => x.title === 'Driver arriving');
  assert.ok(n, 'not in inbox');
  assert.equal(n.vertical, 'taxi');
  assert.equal(n.source, 'RIDE');
});

console.log('\nWhat is not filed');
await check('an id from the removed quick-commerce or services collections is not filed', async () => {
  for (const id of [ashaQuickLinked, ashaQuickByPhone, ashaServices]) {
    await push(core, id, `Hello ${id}`, 'Nobody reads this');
  }
  assert.equal(await FoodNotification.countDocuments({ title: /^Hello / }), 0);
});
await check('a customer with no platform account is not filed anywhere unreadable', async () => {
  await push(core, oid(), 'Hello', 'Nobody reads this');
  assert.equal(await FoodNotification.countDocuments({ title: 'Hello' }), 0);
});
await check('the same update twice is filed once', async () => {
  await push(core, asha, 'Order accepted', 'Joy is preparing your order', { orderId: 'FOD-1' });
  assert.equal((await inbox()).filter((x) => x.title === 'Order accepted').length, 1);
});
await check('restaurants and riders are not filed as customers', async () => {
  const shop = oid();
  await core.sendNotificationToOwner({ ownerType: 'RESTAURANT', ownerId: String(shop), payload: { title: 'New order', body: 'Accept it' } });
  await core.sendNotificationToOwner({ ownerType: 'DELIVERY_PARTNER', ownerId: String(asha), payload: { title: 'New trip', body: 'Pick up' } });
  assert.equal(await FoodNotification.countDocuments({ title: { $in: ['New order', 'New trip'] } }), 0);
});
await check('skipInbox is honoured', async () => {
  await push(core, asha, 'Silent', 'Background refresh', {}, { skipInbox: true });
  assert.equal(await FoodNotification.countDocuments({ title: 'Silent' }), 0);
});

console.log('\nThe inbox the app reads');
await check('shows both services together, newest first', async () => {
  const items = await inbox();
  assert.deepEqual([...new Set(items.map((x) => x.vertical))].sort(), ['food', 'taxi']);
  assert.equal(items[0].title, 'Driver arriving');
  assert.equal(items.length, 2);
});

await mongoose.disconnect();
await mongod.stop();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll customer inbox checks passed');
process.exit(failed ? 1 : 0);
