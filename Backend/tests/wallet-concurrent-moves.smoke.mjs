/**
 * Two things happening to one wallet at the same moment.
 *
 * Run: node tests/wallet-concurrent-moves.smoke.mjs
 *
 * Every wallet move was load, mutate, save: read the balance, unshift a row
 * onto the embedded transactions array, write the document back. Two moves on
 * one wallet then raced.
 *
 * The credit side surfaced first, in a return payout test, which failed about
 * one run in three with Mongoose's own words -- "No matching document found for
 * id ... modifiedPaths transactions, balance". Two refunds at once: the second
 * threw, and the customer was paid for one until somebody retried the other by
 * hand.
 *
 * The debit side is the one that costs money the other way. The balance check
 * was a separate read before the save, so two orders paid from one wallet
 * together both passed it and both wrote, and the customer spent more than
 * they had.
 *
 * Both are now one atomic update, which is what these checks pin.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create();
process.env.MONGODB_URI = server.getUri();
await mongoose.connect(server.getUri(), { dbName: 'wallet_concurrency' });

const { FoodUserWallet } = await import('../src/modules/food/user/models/userWallet.model.js');
const foodWallet = await import('../src/modules/food/user/services/userWallet.service.js');

let failures = 0;
const check = async (label, fn) => {
    try {
        await fn();
        console.log(`  ok   ${label}`);
    } catch (err) {
        failures += 1;
        console.log(`  FAIL ${label}\n       ${err.message}`);
    }
};

const newUser = () => new mongoose.Types.ObjectId();
const balanceOf = async (userId) => {
    const doc = await FoodUserWallet.findOne({ userId }).lean();
    return Number(doc?.balance) || 0;
};
const rowsOf = async (userId) => {
    const doc = await FoodUserWallet.findOne({ userId }).lean();
    return (doc?.transactions || []).length;
};

console.log('\ntwo refunds landing together');
{
    const user = newUser();
    const results = await Promise.allSettled([
        foodWallet.refundWalletBalance(user, 118, 'Refund A'),
        foodWallet.refundWalletBalance(user, 150.4, 'Refund B'),
    ]);
    await check('THE BUG: neither is rejected by a version conflict', () => {
        const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
        assert.deepEqual(errors, []);
    });
    await check('the customer is credited both, not one', async () =>
        assert.equal(await balanceOf(user), 268.4));
    await check('and both show in their history', async () => assert.equal(await rowsOf(user), 2));
}

console.log('\nten at once, which is a support agent and a job racing');
{
    const user = newUser();
    await Promise.all(Array.from({ length: 10 }, (_, i) => foodWallet.refundWalletBalance(user, 10, `R${i}`)));
    await check('every one lands', async () => {
        assert.equal(await balanceOf(user), 100);
        assert.equal(await rowsOf(user), 10);
    });
}

console.log('\ntwo orders paid from one wallet at the same moment');
{
    const user = newUser();
    await foodWallet.refundWalletBalance(user, 100, 'Top-up');
    const results = await Promise.allSettled([
        foodWallet.deductWalletBalance(user, 80, 'Order A'),
        foodWallet.deductWalletBalance(user, 80, 'Order B'),
    ]);
    await check('THE BUG IT PREVENTS: the wallet cannot go negative', async () => {
        const balance = await balanceOf(user);
        assert.ok(balance >= 0, `balance went to ${balance}`);
        assert.equal(balance, 20, `expected one payment of 80 to be refused, balance ${balance}`);
    });
    await check('exactly one is refused, and told why', () => {
        const rejected = results.filter((r) => r.status === 'rejected');
        assert.equal(rejected.length, 1);
        assert.match(rejected[0].reason?.message || '', /Insufficient wallet balance/);
    });
}

console.log('\nthe ordinary single move still behaves');
{
    const user = newUser();
    await foodWallet.refundWalletBalance(user, 55.75, 'One refund');
    await check('credits the amount and records one row', async () => {
        assert.equal(await balanceOf(user), 55.75);
        assert.equal(await rowsOf(user), 1);
    });
    await check('a nonsense amount changes nothing', async () => {
        await foodWallet.refundWalletBalance(user, -10, 'Nonsense');
        await foodWallet.refundWalletBalance(user, 0, 'Nothing');
        assert.equal(await balanceOf(user), 55.75);
        assert.equal(await rowsOf(user), 1);
    });
    await check('a debit larger than the balance is refused', async () => {
        await assert.rejects(
            () => foodWallet.deductWalletBalance(user, 500, 'Too much'),
            /Insufficient wallet balance/,
        );
        assert.equal(await balanceOf(user), 55.75);
    });
}

await mongoose.disconnect();
await server.stop();
console.log(failures ? `\n${failures} FAILED\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
