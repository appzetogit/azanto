/**
 * One vertical's zones must never be another's.
 *
 * Run: node tests/zone-separation.smoke.mjs
 *
 * Food and taxi each draw their own zones, in their own panels, against their
 * own maps. They are separate things that happen to share a shape, and the
 * platform keeps them apart with a distinct mongoose model name and a distinct
 * collection.
 *
 * If either slipped, the failure would be quiet and expensive: a zone drawn in
 * Taxi would appear in Food, a restaurant's zoneId would resolve against the
 * wrong map, and an order would be refused as "we don't deliver there" for an
 * address the vertical plainly covers. Nothing would throw.
 *
 * Quick commerce (and medical, which ran on it) is gone, and so is the browser
 * rule that rewrote the Medical panel's calls to it; the last check says so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
const check = (label, fn) => {
    try {
        fn();
        console.log(`  PASS  ${label}`);
    } catch (err) {
        failed += 1;
        console.log(`  FAIL  ${label}\n        ${err.message}`);
    }
};

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const food = await import('../src/modules/food/admin/models/zone.model.js');
const taxi = await import('../src/modules/taxi/driver/models/Zone.js');

const zones = [
    { vertical: 'food', model: food.FoodZone },
    { vertical: 'taxi', model: taxi.Zone },
];

console.log('\ntwo verticals, two zone stores');

for (const { vertical, model } of zones) {
    console.log(`  ${vertical.padEnd(26)} model ${model.modelName.padEnd(10)} collection ${model.collection.name}`);
}

check('no two verticals share a mongoose model', () => {
    const names = zones.map((z) => z.model.modelName);
    assert.equal(new Set(names).size, names.length, names.join(', '));
});

check('no two verticals share a collection', () => {
    const collections = zones.map((z) => z.model.collection.name);
    assert.equal(new Set(collections).size, collections.length, collections.join(', '));
});

console.log('\nthe panel that edits them');

const axiosSource = readFileSync(
    join(backendRoot, '..', 'Frontend', 'src', 'services', 'api', 'axios.js'),
    'utf8',
);

check('no panel is rewritten to the removed quick-commerce API', () => {
    assert.doesNotMatch(axiosSource, /\/admin\/medical|\/qc\b|SHARED_FOOD_PREFIXES/);
});

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
