/**
 * Master > Cancellation Policy, for Food.
 *
 * Run: node tests/cancel-policy-master.smoke.mjs
 *
 * What this guards:
 *   - with nothing set in Master, Food keeps its own screen's rule;
 *   - a Master rule reaches Food, and a per-service value beats the global one;
 *   - the rule a customer's cancel is judged by: allowed inside the window
 *     after acceptance, refused after it, and never once the rider has it;
 *   - the order screen gets the cancel countdown;
 *   - Food's own screen shows its saved rule and says when Master overrides it.
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

const policy = await import('../src/modules/food/orders/services/cancellationPolicy.js');
const resolver = await import('../src/core/config/resolver.service.js');

const set = (key, value, vertical = null) =>
  resolver.set(key, vertical ? { level: 'vertical', scopeId: vertical, value } : { level: 'global', scopeId: '*', value });
const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

/** An order in a given state, accepted some minutes ago. */
const order = (status, acceptedMinutesAgo = 1) => ({
  orderStatus: status,
  statusHistory: status === 'created' ? [] : [{ at: minutesAgo(acceptedMinutesAgo), byRole: 'RESTAURANT', from: 'created', to: 'confirmed' }],
  updatedAt: minutesAgo(acceptedMinutesAgo),
});
const judge = async (o) => policy.judgeUserCancel(o, await policy.getCancelRules('food'));

console.log('\nNothing set in Master');
await check('Food keeps its own screen\'s rule', async () => {
  await policy.setCancelRules({ allowAfterAccept: true, windowMinutes: 3, stopWhenPreparing: true });
  const r = await policy.getCancelRules('food');
  assert.equal(r.allowAfterAccept, true);
  assert.equal(r.windowMinutes, 3);
  assert.equal(r.source.allowAfterAccept, 'service');
});
await check('a waiting order can be cancelled', async () => {
  assert.equal((await judge(order('created'))).allowed, true);
});

console.log('\nSet once in Master');
await check('a global rule reaches Food', async () => {
  await set('orders.cancelAfterAccept', true);
  await set('orders.cancelWindowMinutes', 5);
  const r = await policy.getCancelRules('food');
  assert.equal(r.allowAfterAccept, true);
  assert.equal(r.windowMinutes, 5);
  assert.equal(r.source.windowMinutes, 'master');
});
await check('an order accepted 2 minutes ago can be cancelled', async () => {
  assert.equal((await judge(order('confirmed', 2))).allowed, true);
});
await check('one accepted 6 minutes ago cannot', async () => {
  assert.match((await judge(order('confirmed', 6))).reason, /more than 5 minutes ago/);
});
await check('one already being prepared cannot (stop when preparing)', async () => {
  assert.match((await judge(order('preparing', 1))).reason, /started preparing/);
});
await check('one the rider has picked up never can', async () => {
  assert.match((await judge(order('picked_up', 1))).reason, /picked up/);
});
await check('the order screen shows the countdown', async () => {
  const c = policy.cancellationForClient(order('confirmed', 1), await policy.getCancelRules('food'));
  assert.equal(c.allowed, true);
  assert.ok(c.secondsLeft > 200 && c.secondsLeft <= 240, `secondsLeft ${c.secondsLeft}`);
});

console.log('\nPer service');
await check('a Food value beats the global one', async () => {
  await set('orders.cancelAfterAccept', false, 'food');
  assert.equal((await policy.getCancelRules('food')).allowAfterAccept, false);
  assert.match((await judge(order('confirmed', 1))).reason, /has accepted it/);
  await set('orders.cancelAfterAccept', null, 'food');
  assert.equal((await policy.getCancelRules('food')).allowAfterAccept, true);
});

console.log('\nFood\'s own screen');
await check('shows its saved rule and which fields Master overrides', async () => {
  const a = await policy.foodCancelRulesForAdmin();
  assert.equal(a.windowMinutes, 3);
  assert.deepEqual(a.overriddenByMaster.sort(), ['allowAfterAccept', 'windowMinutes']);
  assert.equal(a.inForce.windowMinutes, 5);
});

console.log('\nClearing');
await check('clearing Master hands Food its own rule back', async () => {
  await set('orders.cancelAfterAccept', null);
  await set('orders.cancelWindowMinutes', null);
  assert.equal((await policy.getCancelRules('food')).windowMinutes, 3);
  assert.deepEqual((await policy.foodCancelRulesForAdmin()).overriddenByMaster, []);
});

await mongoose.disconnect();
await mongod.stop();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll cancellation policy checks passed');
process.exit(failed ? 1 : 0);
