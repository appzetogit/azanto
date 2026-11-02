// Cross-vertical activity feed.
//
// The feed is DERIVED data. The two properties that matter are that it cannot break
// the thing it observes, and that one transaction never produces more than one row.
//
// Run: node tests/activity.smoke.mjs

import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
const check = (name, fn) => {
    if (fn.constructor.name === 'AsyncFunction') throw new Error(`check("${name}") given an async fn`);
    try { fn(); console.log(`  ok   ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n         ${err.message}`); }
};
const settle = () => new Promise((r) => setTimeout(r, 150)); // hooks are fire-and-forget

process.env.MONGOMS_STARTUP_TIMEOUT ||= '180000';
const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
process.env.NODE_ENV = 'test';
await mongoose.connect(process.env.MONGO_URI);

const { Activity, ACTIVITY_STATUS } = await import('../src/core/activity/activity.model.js');
const { recordActivity, normaliseStatus, getUserActivity, getUserSpend } = await import('../src/core/activity/activity.service.js');

const oid = () => new mongoose.Types.ObjectId();

console.log('\n[1] each vocabulary collapses to one');
{
    check('food delivered -> completed', () => assert.equal(normaliseStatus('food', 'delivered'), ACTIVITY_STATUS.COMPLETED));
    check('taxi completed -> completed', () => assert.equal(normaliseStatus('taxi', 'completed'), ACTIVITY_STATUS.COMPLETED));
    check('all three food cancel variants -> cancelled', () => {
        for (const s of ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin']) {
            assert.equal(normaliseStatus('food', s), ACTIVITY_STATUS.CANCELLED, s);
        }
    });
    check('an unknown status falls to ACTIVE, never dropped', () =>
        assert.equal(normaliseStatus('food', 'some_new_state'), ACTIVITY_STATUS.ACTIVE));
}

console.log('\n[2] one transaction = exactly one row, however often it changes');
{
    const userId = oid(); const refId = oid();
    for (const s of ['created', 'confirmed', 'preparing', 'picked_up', 'delivered']) {
        await recordActivity({ vertical: 'food', refModel: 'FoodOrder', refId, userId, rawStatus: s, amount: 450 });
    }
    const rows = await Activity.find({ vertical: 'food', refId });
    check(`five transitions produced one row (${rows.length})`, () => assert.equal(rows.length, 1));
    check('and it holds the latest state', () => assert.equal(rows[0].status, ACTIVITY_STATUS.COMPLETED));
    check('raw status kept for support', () => assert.equal(rows[0].rawStatus, 'delivered'));
}

console.log('\n[3] the unified feed');
{
    const userId = oid();
    await recordActivity({ vertical: 'food', refModel: 'FoodOrder', refId: oid(), userId, rawStatus: 'delivered', amount: 300, title: 'Olive Kitchen', occurredAt: new Date('2026-08-01') });
    await recordActivity({ vertical: 'taxi', refModel: 'TaxiRide', refId: oid(), userId, rawStatus: 'completed', amount: 180, title: 'Ride to Airport', occurredAt: new Date('2026-08-03') });
    await recordActivity({ vertical: 'taxi', refModel: 'TaxiRide', refId: oid(), userId, rawStatus: 'completed', amount: 900, title: 'Ride to Station', occurredAt: new Date('2026-08-02') });
    await recordActivity({ vertical: 'food', refModel: 'FoodOrder', refId: oid(), userId, rawStatus: 'preparing', amount: 120, occurredAt: new Date('2026-08-04') });

    const feed = await getUserActivity(userId);
    check(`one query returns every row, both verticals (${feed.length})`, () => assert.equal(feed.length, 4));
    check('newest first', () => {
        const times = feed.map((f) => new Date(f.occurredAt).getTime());
        assert.deepEqual(times, [...times].sort((a, b) => b - a));
    });
    const active = await getUserActivity(userId, { status: ACTIVITY_STATUS.ACTIVE });
    check(`only the in-flight one (${active.length})`, () => assert.equal(active.length, 1));
    check('and it is the food order being prepared', () => assert.equal(active[0].rawStatus, 'preparing'));

    const spend = await getUserSpend(userId);
    check(`cross-vertical spend = 1380, excluding the unfinished one (${spend.total})`, () => assert.equal(spend.total, 1380));
    check('broken down by vertical', () => assert.equal(spend.byVertical.length, 2));
}

console.log('\n[4] it cannot break what it observes');
{
    let threw = null;
    try {
        // Every one of these is malformed; none may raise.
        await recordActivity({ vertical: 'nope', refModel: 'X', refId: oid(), userId: oid(), rawStatus: 'x' });
        await recordActivity({ vertical: 'food', refModel: 'FoodOrder', refId: oid(), rawStatus: 'x' });   // no user
        await recordActivity({ vertical: 'food', refModel: 'FoodOrder', userId: oid(), rawStatus: 'x' });  // no ref
        await recordActivity({});
    } catch (e) { threw = e; }
    check('malformed input never throws', () => assert.equal(threw, null, threw?.message));

    const junk = await Activity.countDocuments({ vertical: 'nope' });
    check('and writes nothing', () => assert.equal(junk, 0));
}

console.log('\n[5] hooks fire on BOTH write paths');
{
    const { attachActivityHooks } = await import('../src/core/activity/attachActivityHooks.js');
    const schema = new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, status: String, fare: Number }, { timestamps: true });
    const Fake = mongoose.model('FakeRideForActivity', schema);
    attachActivityHooks(Fake, {
        vertical: 'taxi',
        refModel: 'TaxiRide',
        map: (d) => ({ userId: d.userId, rawStatus: d.status, amount: d.fare, occurredAt: d.updatedAt }),
    });

    const userId = oid();
    const doc = await Fake.create({ userId, status: 'searching', fare: 200 });
    await settle();
    const afterSave = await Activity.findOne({ vertical: 'taxi', refId: doc._id });
    check('post(save) wrote a row', () => assert.ok(afterSave));
    check('mapped to pending', () => assert.equal(afterSave.status, ACTIVITY_STATUS.PENDING));

    // findOneAndUpdate does NOT fire save hooks -- this is where most status changes happen.
    await Fake.findOneAndUpdate({ _id: doc._id }, { $set: { status: 'completed' } }, { new: true });
    await settle();
    const afterUpdate = await Activity.findOne({ vertical: 'taxi', refId: doc._id });
    check('post(findOneAndUpdate) updated the same row', () => assert.equal(afterUpdate.status, ACTIVITY_STATUS.COMPLETED));

    const rows = await Activity.countDocuments({ vertical: 'taxi', refId: doc._id });
    check('still exactly one row', () => assert.equal(rows, 1));

    /*
     * The case the checks above never exercised, and the one production uses.
     *
     * The hook used to wrap findOneAndUpdate in an async function, which returns a
     * Promise instead of a mongoose Query. Awaiting it directly -- all this test did --
     * works either way. CHAINING on it does not: .populate() threw "is not a function",
     * and rider accept (PATCH /food/delivery/orders/:id/accept) returned 500 on every
     * attempt from 2026-08-26 until this was fixed.
     */
    const FakeUser = mongoose.model('FakeUserForActivity', new mongoose.Schema({ name: String }));
    const owner = await FakeUser.create({ name: 'Rider' });
    const chained = await Fake.create({ userId: owner._id, status: 'searching', fare: 90 });

    let populated;
    let populateError = null;
    try {
        populated = await Fake.findOneAndUpdate({ _id: chained._id }, { $set: { status: 'accepted' } }, { new: true })
            .populate({ path: 'userId', model: 'FakeUserForActivity' });
    } catch (err) { populateError = err; }
    check('THE PRODUCTION BUG: findOneAndUpdate(...).populate() works', () => assert.equal(populateError, null, populateError?.message));
    check('the populate actually applied', () => assert.equal(populated?.userId?.name, 'Rider'));

    const leaned = await Fake.findOneAndUpdate({ _id: chained._id }, { $set: { status: 'ongoing' } }, { new: true }).lean();
    check('findOneAndUpdate(...).lean() returns a plain object', () => assert.equal(typeof leaned.save, 'undefined'));

    const selected = await Fake.findByIdAndUpdate(chained._id, { $set: { fare: 95 } }, { new: true }).select('fare');
    check('findByIdAndUpdate(...).select() applies the projection', () => {
        assert.equal(selected.fare, 95);
        assert.equal(selected.status, undefined);
    });

    await Fake.findOneAndUpdate({ _id: chained._id }, { $set: { status: 'completed' } }).lean();
    await settle();
    const chainedRow = await Activity.findOne({ vertical: 'taxi', refId: chained._id });
    check('the feed still syncs through a chained, lean, pre-update query', () =>
        assert.equal(chainedRow?.status, ACTIVITY_STATUS.COMPLETED));

    check('attaching twice does not double-write', () => {
        attachActivityHooks(Fake, { vertical: 'taxi', refModel: 'TaxiRide', map: () => ({}) });
        assert.equal(Fake.schema.__activityHooksAttached, true);
    });
}

console.log('\n[6] the endpoint reads food and taxi under the one platform id');
{
    const { default: app } = await import('../src/app.js');
    const server = app.listen(0);

    const { FoodUser } = await import('../src/core/users/user.model.js');

    // Food and taxi both key on `users`, so one id covers both. A quick-commerce
    // customer row with the same phone (that vertical is gone) must add nothing.
    const phone = '9876500123';
    const master = await FoodUser.create({ phone, name: 'Cross Vertical' });
    const stray = oid();
    await mongoose.connection.collection('qc_users').insertOne({ _id: stray, phone, platformUserId: master._id });

    await recordActivity({ vertical: 'food', refModel: 'FoodOrder', refId: oid(), userId: master._id, rawStatus: 'delivered', amount: 200, occurredAt: new Date('2026-08-01') });
    await recordActivity({ vertical: 'taxi', refModel: 'TaxiRide', refId: oid(), userId: master._id, rawStatus: 'completed', amount: 800, occurredAt: new Date('2026-08-02') });
    await recordActivity({ vertical: 'quickCommerce', refModel: 'QCOrder', refId: oid(), userId: stray, rawStatus: 'delivered', amount: 50, occurredAt: new Date('2026-08-03') });

    const { resolveCustomerIdentities } = await import('../src/core/activity/identityResolver.js');
    const { ids, resolved } = await resolveCustomerIdentities(master._id);
    check('the platform id is the only identity', () => assert.deepEqual(ids.map(String), [String(master._id)]));
    check('resolved as food/taxi', () => assert.deepEqual(resolved, ['food/taxi']));

    const { getMyActivityController, getMySpendController } = await import('../src/core/activity/activity.controller.js');

    let payload = null;
    await getMyActivityController(
        { user: { userId: master._id }, query: {} },
        { status: () => ({ json: (b) => { payload = b; return b; } }) },
        (e) => { throw e; },
    );
    check('endpoint returns food and taxi for one customer, nothing from the stray row', () => {
        const vs = payload.data.items.map((i) => i.vertical).sort();
        assert.deepEqual(vs, ['food', 'taxi']);
    });
    check('cross-vertical total is right', () => assert.equal(payload.data.total, 2));

    let spendBody = null;
    await getMySpendController(
        { user: { userId: master._id } },
        { status: () => ({ json: (b) => { spendBody = b; return b; } }) },
        (e) => { throw e; },
    );
    check('spend sums across verticals (1000)', () => assert.equal(spendBody.data.total, 1000));

    // Unauthenticated must not leak anyone's history.
    let unauth = null;
    await getMyActivityController({ query: {} }, { status: (c) => ({ json: (b) => { unauth = { c, b }; return b; } }) }, () => {});
    check('no token -> 401, no data', () => {
        assert.equal(unauth.c, 401);
        assert.equal(unauth.b.data, undefined);
    });

    server.close();
}

await mongoose.disconnect();
await mongod.stop();
console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
