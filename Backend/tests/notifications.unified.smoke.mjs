// Unified notification inbox.
//
// The point of this test is as much what STAYED separate as what merged. Several of
// the models named "notification" are not inbox entries at all -- they are campaigns
// and channel config -- and merging them would have been wrong.
//
// Run: node tests/notifications.unified.smoke.mjs

import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
const check = (name, fn) => {
    if (fn.constructor.name === 'AsyncFunction') throw new Error(`check("${name}") given an async fn`);
    try { fn(); console.log(`  ok   ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n         ${err.message}`); }
};

process.env.MONGOMS_STARTUP_TIMEOUT ||= '180000';
const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
process.env.NODE_ENV = 'test';
await mongoose.connect(process.env.MONGO_URI);

const { FoodNotification } = await import('../src/core/notifications/models/notification.model.js');

const oid = () => new mongoose.Types.ObjectId();

console.log('\n[1] existing food behaviour is unchanged');
{
    // Exactly the shape food wrote before this change -- no vertical.
    const legacy = await FoodNotification.create({
        ownerType: 'USER', ownerId: oid(), title: 'Order placed', message: 'Your order is in.',
    });
    check('a legacy-shaped write still succeeds', () => assert.ok(legacy._id));
    check('vertical defaults to food', () => assert.equal(legacy.vertical, 'food'));
    check('still on food_notifications', () => assert.equal(FoodNotification.collection.name, 'food_notifications'));
}

console.log('\n[2] enum values absorbed from the old forks still validate');
{
    const support = await FoodNotification.create({
        ownerType: 'USER', ownerId: oid(), title: 'Re: ticket', message: 'Resolved.', source: 'SUPPORT_RESPONSE',
    });
    check('SUPPORT_RESPONSE still validates', () => assert.equal(support.source, 'SUPPORT_RESPONSE'));
}

console.log('\n[3] the broadcast fan-out upsert carries the vertical');
{
    // notification.service.js fans broadcasts out with bulkWrite+upsert, which does NOT
    // run a document save. If schema defaults did not apply on insert here, every
    // broadcast-delivered notification would land unlabelled.
    const ownerId = oid();
    const broadcastId = oid();
    await FoodNotification.bulkWrite([{
        updateOne: {
            filter: { broadcastId, ownerType: 'USER', ownerId },
            update: { $set: { title: 'Sale', message: '50% off', dismissedAt: null }, $setOnInsert: { isRead: false } },
            upsert: true,
        },
    }], { ordered: false });

    const doc = await FoodNotification.findOne({ broadcastId }).lean();
    check('the upserted doc exists', () => assert.ok(doc));
    check('upsert is labelled food, not blank', () => assert.equal(doc.vertical, 'food'));
}

console.log('\n[4] one customer, every vertical, one query');
{
    const ownerId = oid();
    await FoodNotification.create({ ownerType: 'USER', ownerId, title: 'Food', message: 'a' });
    await FoodNotification.create({ vertical: 'taxi', ownerType: 'USER', ownerId, title: 'Taxi', message: 'd', source: 'RIDE' });

    const inbox = await FoodNotification.find({ ownerType: 'USER', ownerId }).lean();
    check('both verticals come back from one query', () => {
        assert.deepEqual(inbox.map((n) => n.vertical).sort(), ['food', 'taxi']);
    });
    const justTaxi = await FoodNotification.countDocuments({ ownerType: 'USER', ownerId, vertical: 'taxi' });
    check('filtering by vertical narrows correctly', () => assert.equal(justTaxi, 1));
}

console.log('\n[5] the models that are NOT inboxes stayed separate');
{
    // Several files are named "notification", and not all are the same aggregate:
    //
    //   BroadcastNotification    -- an admin campaign, fanned OUT to many inbox rows
    //   taxi promotions          -- also a campaign (send_to / sent_at / status)
    //
    // Folding a campaign into the inbox would turn one admin action into a row that
    // looks like a user's notification.
    const { BroadcastNotification } = await import('../src/core/notifications/models/notificationBroadcast.model.js');
    const { Notification: TaxiPromoNotification } = await import('../src/modules/taxi/admin/promotions/models/Notification.js');

    const names = {
        inbox: FoodNotification.collection.name,
        broadcast: BroadcastNotification.collection.name,
        taxiCampaign: TaxiPromoNotification.collection.name,
    };
    check('all three live in distinct collections', () => {
        assert.equal(new Set(Object.values(names)).size, 3, JSON.stringify(names));
    });
    check('none of them was merged into the inbox', () => {
        for (const [k, v] of Object.entries(names)) {
            if (k !== 'inbox') assert.notEqual(v, names.inbox, `${k} collapsed into the inbox`);
        }
    });

    // A campaign is addressed to a segment, an inbox entry to one owner. That is the
    // structural reason they are not the same aggregate.
    check('the taxi campaign is addressed to a segment, not an owner', () => {
        const paths = Object.keys(TaxiPromoNotification.schema.paths);
        assert.ok(paths.includes('send_to'), 'expected send_to');
        assert.ok(!paths.includes('ownerId'), 'a campaign should not have a single owner');
    });
}

await mongoose.disconnect();
await mongod.stop();
console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
