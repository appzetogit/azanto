/**
 * Home-screen food categories and photos for the Indore / Jaipur demo data.
 *
 * Run after seed-demo-zones.mjs. It:
 *   1. creates global food categories (no restaurant, no zone, so both cities see
 *      them) whose names match words in the seeded menus -- the customer category
 *      page finds dishes by keyword, so "Momos" lists every momo plate;
 *   2. gives each of those categories, every seeded dish and every seeded
 *      restaurant (cover + profile) a photo.
 *
 * Photos come from Wikimedia Commons and are stored on local disk through the
 * normal upload path (same approach as backfill-food-images.mjs), so nothing is
 * hotlinked. Commons images are free to use but most are CC-BY / CC-BY-SA: the
 * source page is recorded in `imageCredit`. Replace with owned photography before
 * a public launch.
 *
 *   node scripts/seed-demo-images.mjs --dry   # show what would be fetched
 *   node scripts/seed-demo-images.mjs         # create categories, fetch photos
 *   node scripts/seed-demo-images.mjs --force # re-fetch photos already stored
 *
 * Categories carry the same seedTag as seed-demo-zones.mjs, so its --remove
 * deletes them too. Refuses any database but appzeto_azanto.
 */
import '../src/config/env.js';
import mongoose from 'mongoose';
import axios from 'axios';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { detectMimeType, saveImageBuffer } from '../src/services/storage.service.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');

const SEED_TAG = 'azanto-demo-v1';
const TAG = { seedTag: SEED_TAG };

/** Global home-screen categories: [name, Commons search term, foodTypeScope]. */
const HOME_CATEGORIES = [
    ['Thali', 'indian thali meal', 'Veg'],
    ['Biryani', 'chicken biryani', 'Both'],
    ['Pizza', 'margherita pizza', 'Veg'],
    ['Dosa', 'masala dosa', 'Veg'],
    ['Momos', 'momos dumplings', 'Both'],
    ['Chaat', 'pani puri', 'Veg'],
    ['Kachori', 'pyaaz kachori', 'Veg'],
    ['Paneer', 'paneer tikka', 'Veg'],
    ['Chicken', 'tandoori chicken', 'Non-Veg'],
    ['Noodles', 'hakka noodles', 'Both'],
    ['Poha', 'indori poha', 'Veg'],
    ['Sweets', 'indian sweets mithai', 'Veg'],
    ['Pasta', 'penne pasta', 'Veg'],
    ['Coffee', 'cold coffee glass', 'Veg'],
];

/**
 * Dish name -> Commons search term. First match wins, so specific runs before
 * generic ("Chicken Fried Rice" before "chicken"). Anything unmatched searches
 * its own name, minus portion notes like "(2 pcs)".
 */
const DISH_TERMS = [
    [/dal\s*bafla/i, 'dal bafla'],
    [/dal\s*baati/i, 'dal baati churma'],
    [/thali/i, 'indian thali meal'],
    [/paneer\s*butter|butter\s*paneer/i, 'paneer butter masala'],
    [/kadhai\s*paneer/i, 'kadai paneer'],
    [/chilli\s*paneer/i, 'chilli paneer'],
    [/paneer\s*tikka\s*pizza/i, 'paneer pizza'],
    [/paneer\s*tikka\s*sandwich/i, 'grilled sandwich'],
    [/paneer\s*tikka/i, 'paneer tikka'],
    [/sev\s*tamatar/i, 'tomato curry'],
    [/dal\s*makhani/i, 'dal makhani'],
    [/dal\s*tadka/i, 'dal tadka'],
    [/mix\s*veg/i, 'mixed vegetable curry'],
    [/missi\s*roti/i, 'missi roti'],
    [/bajr[ae]\s*ki\s*roti/i, 'bajra roti'],
    [/tandoori\s*roti/i, 'tandoori roti'],
    [/roti/i, 'roti chapati'],
    [/garlic\s*naan/i, 'garlic naan'],
    [/naan/i, 'butter naan'],
    [/paratha/i, 'lachha paratha'],
    [/jeera\s*rice/i, 'jeera rice'],
    [/lemon\s*rice/i, 'lemon rice'],
    [/chicken\s*fried\s*rice/i, 'chicken fried rice'],
    [/fried\s*rice/i, 'vegetable fried rice'],
    [/gulab\s*jamun/i, 'gulab jamun'],
    [/halwa/i, 'moong dal halwa'],
    [/rabdi\s*jalebi|jalebi/i, 'jalebi'],
    [/poha/i, 'poha'],
    [/khaman|dhokla/i, 'khaman dhokla'],
    [/samosa/i, 'samosa'],
    [/raj\s*kachori/i, 'raj kachori'],
    [/kachori/i, 'kachori'],
    [/bread\s*pakod/i, 'bread pakora'],
    [/masala\s*chai/i, 'masala chai'],
    [/filter\s*coffee/i, 'south indian filter coffee'],
    [/cappuccino/i, 'cappuccino'],
    [/cold\s*coffee/i, 'cold coffee'],
    [/kesar\s*lassi|sweet\s*lassi|lassi/i, 'lassi'],
    [/chaas|buttermilk/i, 'buttermilk chaas'],
    [/shikanji|mojito/i, 'lemonade glass mint'],
    [/oreo\s*shake/i, 'chocolate milkshake'],
    [/badam\s*milk/i, 'badam milk'],
    [/pani\s*puri/i, 'pani puri'],
    [/dahi\s*puri/i, 'dahi puri'],
    [/aloo\s*tikki/i, 'aloo tikki chaat'],
    [/papdi/i, 'papri chaat'],
    [/bhutte\s*ka\s*kees/i, 'sweet corn'],
    [/garadu/i, 'yam'],
    [/pav\s*bhaji/i, 'pav bhaji'],
    [/dahi\s*vada/i, 'dahi vada'],
    [/malpua/i, 'malpua'],
    [/kulfi/i, 'kulfi'],
    [/egg\s*biryani/i, 'egg biryani'],
    [/mutton\s*biryani/i, 'mutton biryani'],
    [/veg\w*\s*(dum\s*)?biryani/i, 'vegetable biryani'],
    [/biryani/i, 'chicken biryani'],
    [/chicken\s*65/i, 'chicken 65'],
    [/seekh\s*kebab/i, 'seekh kebab'],
    [/korma/i, 'chicken korma'],
    [/rogan\s*josh/i, 'rogan josh'],
    [/raita/i, 'raita'],
    [/double\s*ka\s*meetha/i, 'double ka meetha'],
    [/tandoori\s*chicken/i, 'tandoori chicken'],
    [/malai\s*tikka/i, 'chicken malai tikka'],
    [/chicken\s*tikka/i, 'chicken tikka'],
    [/tandoori\s*aloo/i, 'tandoori aloo'],
    [/butter\s*chicken/i, 'butter chicken'],
    [/kadhai\s*chicken/i, 'kadai chicken'],
    [/mysore\s*masala\s*dosa/i, 'mysore masala dosa'],
    [/rava\s*dosa/i, 'rava dosa'],
    [/paper\s*(plain\s*)?dosa/i, 'paper dosa'],
    [/dosa/i, 'masala dosa'],
    [/idli\s*vada/i, 'idli vada sambar'],
    [/idli/i, 'idli sambar'],
    [/medu\s*vada/i, 'medu vada'],
    [/uttapam/i, 'onion uttapam'],
    [/hot\s*and\s*sour/i, 'hot and sour soup'],
    [/manchow/i, 'manchow soup'],
    [/spring\s*roll/i, 'spring roll'],
    [/chilli\s*chicken/i, 'chilli chicken'],
    [/momo/i, 'momos dumplings'],
    [/chicken\s*hakka|hakka\s*noodles|noodles/i, 'hakka noodles'],
    [/manchurian/i, 'veg manchurian'],
    [/grilled\s*sandwich|sandwich/i, 'grilled sandwich'],
    [/garlic\s*bread(sticks)?/i, 'garlic bread'],
    [/fries/i, 'french fries'],
    [/truffle\s*pastry|chocolate.*pastry/i, 'chocolate pastry cake'],
    [/red\s*velvet/i, 'red velvet cake'],
    [/muffin/i, 'blueberry muffin'],
    [/veg\s*puff/i, 'vegetable puff pastry'],
    [/brownie/i, 'chocolate brownie'],
    [/lava\s*cake/i, 'chocolate lava cake'],
    [/gatte/i, 'gatte ki sabzi'],
    [/ker\s*sangri/i, 'ker sangri'],
    [/kadhi/i, 'kadhi'],
    [/papad\s*ki\s*sabzi/i, 'papad ki sabzi'],
    [/ghevar|ghewar/i, 'ghevar'],
    [/mirchi\s*vada/i, 'mirchi vada'],
    [/kaju\s*katli/i, 'kaju katli'],
    [/motichoor|ladoo/i, 'motichoor ladoo'],
    [/rasmalai/i, 'rasmalai'],
    [/chole\s*bhature/i, 'chole bhature'],
    [/margherita/i, 'margherita pizza'],
    [/farmhouse|pizza/i, 'vegetable pizza'],
    [/arrabbiata/i, 'penne arrabbiata'],
    [/alfredo/i, 'penne alfredo'],
    [/burger/i, 'veggie burger'],
];

/** Restaurant cover by seedKey slug; anything unmatched falls back by cuisine word. */
const COVER_TERMS = [
    [/thali|rasoi/i, 'indian thali meal'],
    [/poha/i, 'poha jalebi'],
    [/chaat/i, 'chaat street food india'],
    [/biryani/i, 'hyderabadi biryani'],
    [/tandoor/i, 'tandoori chicken'],
    [/dosa/i, 'masala dosa'],
    [/wok|noodle|momo/i, 'indo chinese food'],
    [/bake|brew/i, 'cafe pastries coffee'],
    [/kachori/i, 'pyaaz kachori'],
    [/sweets|snacks/i, 'indian sweets mithai'],
    [/pizza/i, 'pizza'],
];

const termFrom = (rules, name) => {
    for (const [re, term] of rules) if (re.test(name)) return term;
    return String(name).replace(/\(.*?\)/g, '').trim();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wikimedia throttles hard; same pacing and backoff as backfill-food-images.mjs.
const PACE_MS = 1200;

/*
 * Wikimedia's media servers 429 almost every download from a generic User-Agent
 * and from non-standard thumbnail widths, so this asks for a standard 960px step
 * and identifies itself the way their robot policy asks.
 */
const THUMB_WIDTH = 960;
const USER_AGENT = 'AzantoDemoSeeder/1.0 (https://azanto.buytogetherindia.com; admin@azanto.com)';
const withRetry = async (label, fn) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            const status = error?.response?.status;
            if (status !== 429 && status !== 503) throw error;
            const backoff = 2000 * 2 ** attempt;
            console.log(`      (${label}: ${status}, retrying in ${backoff / 1000}s)`);
            await sleep(backoff);
        }
    }
    throw new Error('rate limited after 5 attempts');
};

const candidateCache = new Map();
const fetchCandidates = async (term) => {
    if (candidateCache.has(term)) return candidateCache.get(term);
    const { data } = await withRetry(`search ${term}`, () => axios.get('https://commons.wikimedia.org/w/api.php', {
        params: {
            action: 'query',
            format: 'json',
            generator: 'search',
            gsrsearch: `${term} filetype:bitmap`,
            gsrnamespace: 6,
            gsrlimit: 12,
            prop: 'imageinfo',
            iiprop: 'url|mime',
            iiurlwidth: THUMB_WIDTH,
        },
        timeout: 30000,
        headers: { 'User-Agent': USER_AGENT },
    }));
    const urls = Object.values(data?.query?.pages || {})
        .map((p) => p?.imageinfo?.[0])
        .filter((info) => info && /^image\/(jpeg|png|webp)$/.test(info.mime || ''))
        // thumburl, not the original: Commons originals are often 10-40MB.
        .map((info) => ({ url: info.thumburl || info.url, page: info.descriptionurl }))
        .filter((c) => c.url);
    candidateCache.set(term, urls);
    await sleep(PACE_MS);
    return urls;
};

// Round-robin within a term so five biryanis do not all get one photo.
const usedPerTerm = new Map();
const fetchPhoto = async (term, folder, label) => {
    const candidates = await fetchCandidates(term);
    if (!candidates.length) throw new Error(`no Commons result for "${term}"`);
    const index = usedPerTerm.get(term) || 0;
    usedPerTerm.set(term, index + 1);
    const chosen = candidates[index % candidates.length];
    const { data } = await withRetry(`fetch ${label}`, () => axios.get(chosen.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': USER_AGENT },
    }));
    const buffer = Buffer.from(data);
    const stored = await saveImageBuffer(buffer, folder, { mimeType: detectMimeType(buffer) || 'image/jpeg' });
    await sleep(PACE_MS);
    return { url: stored.url, credit: chosen.page || '', size: stored.size };
};

const hasLocalImage = (value) => /\/uploads\//.test(String(value || ''));
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const tally = { categories: { created: 0, kept: 0 }, photos: { ok: 0, skipped: 0, failed: 0 } };

async function ensureHomeCategories() {
    const out = [];
    for (const [index, [name, term, scope]] of HOME_CATEGORIES.entries()) {
        const seedKey = `home-category:${slugify(name)}`;
        let doc = await FoodCategory.collection.findOne({ ...TAG, seedKey });
        if (!doc) {
            // Same global category an admin might already have made by hand: reuse
            // it rather than showing two "Biryani" tiles.
            doc = await FoodCategory.collection.findOne({
                name: new RegExp(`^${name}$`, 'i'),
                restaurantId: { $exists: false },
            });
            if (doc) {
                console.log(`  category ${name.padEnd(10)} reusing existing ${doc._id}`);
                tally.categories.kept += 1;
                out.push({ doc, term, owned: false });
                continue;
            }
            if (dry) {
                console.log(`  category ${name.padEnd(10)} + would create (${scope})`);
                tally.categories.created += 1;
                continue;
            }
            const created = await FoodCategory.create({
                name,
                type: 'food',
                foodTypeScope: scope,
                approvalStatus: 'approved',
                isApproved: true,
                approvedAt: new Date(),
                isActive: true,
                sortOrder: index + 1,
            });
            await FoodCategory.collection.updateOne({ _id: created._id }, { $set: { ...TAG, seedKey } });
            doc = await FoodCategory.collection.findOne({ _id: created._id });
            console.log(`  category ${name.padEnd(10)} + created ${doc._id}`);
            tally.categories.created += 1;
        } else {
            tally.categories.kept += 1;
        }
        out.push({ doc, term, owned: true });
    }
    return out;
}

/**
 * Which home category a dish belongs in, first match wins. The public category
 * list only shows GLOBAL categories that approved dishes point at, so a home
 * category with no dishes linked to it never appears. Dishes that match none
 * keep their restaurant's own menu section.
 */
const HOME_LINKS = [
    ['Thali', /thali/i],
    ['Biryani', /biryani/i],
    ['Pizza', /pizza/i],
    ['Dosa', /dosa/i],
    ['Momos', /momo/i],
    ['Kachori', /kachori/i],
    ['Poha', /poha/i],
    ['Pasta', /penne|pasta/i],
    ['Noodles', /noodle/i],
    ['Chaat', /chaat|pani\s*puri|dahi\s*puri|papdi/i],
    ['Paneer', /paneer/i],
    ['Chicken', /chicken/i],
    ['Sweets', /gulab\s*jamun|halwa|ghevar|ghewar|katli|ladoo|rasmalai|jalebi|malpua|kulfi|meetha|rabdi/i],
    ['Coffee', /coffee|cappuccino/i],
];

async function linkDishesToHomeCategories(db, categories) {
    const byName = new Map(categories.map(({ doc }) => [doc?.name, doc]).filter(([, doc]) => doc));
    const items = await db.collection('food_items').find(TAG).project({ name: 1, categoryId: 1, seedRestaurantCategoryId: 1 }).toArray();
    const counts = {};
    for (const item of items) {
        const match = HOME_LINKS.find(([, re]) => re.test(item.name));
        const home = match && byName.get(match[0]);
        if (!home) continue;
        counts[home.name] = (counts[home.name] || 0) + 1;
        if (dry || String(item.categoryId) === String(home._id)) continue;
        await db.collection('food_items').updateOne({ _id: item._id }, {
            $set: {
                categoryId: home._id,
                categoryName: home.name,
                // Where it sat before, so the move can be undone by hand.
                seedRestaurantCategoryId: item.seedRestaurantCategoryId || item.categoryId,
                updatedAt: new Date(),
            },
        });
    }
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(10)} ${n} dishes`);
}

async function photograph(label, term, folder, apply) {
    if (dry) {
        console.log(`  ${label.slice(0, 34).padEnd(34)} -> ${term}`);
        return;
    }
    try {
        const photo = await fetchPhoto(term, folder, label);
        await apply(photo);
        console.log(`  ${label.slice(0, 34).padEnd(34)} -> ${term.padEnd(22)} ${(photo.size / 1024).toFixed(0).padStart(4)}KB`);
        tally.photos.ok += 1;
    } catch (error) {
        console.log(`  ${label.slice(0, 34).padEnd(34)} !! ${error?.message || error}`);
        tally.photos.failed += 1;
    }
}

const main = async () => {
    const dbName = String(process.env.MONGODB_URI || '').split('?')[0].split('/').pop();
    if (!dbName.endsWith('appzeto_azanto')) {
        console.error(`Refusing to run against database "${dbName || '(none in URI)'}": expected a name ending in appzeto_azanto.`);
        process.exit(1);
    }
    await connectDB();
    const db = mongoose.connection.db;

    console.log(`\nHome categories${dry ? ' (dry run)' : ''}`);
    const categories = await ensureHomeCategories();

    console.log('\nLinking dishes to home categories');
    await linkDishesToHomeCategories(db, categories);

    console.log('\nCategory photos');
    for (const { doc, term, owned } of categories) {
        // A category an admin made is theirs: only fill an empty image.
        if (!force && (hasLocalImage(doc.image) || (!owned && doc.image))) { tally.photos.skipped += 1; continue; }
        await photograph(`category ${doc.name}`, term, 'food/categories', ({ url, credit }) =>
            db.collection('food_categories').updateOne({ _id: doc._id }, { $set: { image: url, imageCredit: credit, updatedAt: new Date() } }));
    }

    console.log('\nRestaurant covers');
    const restaurants = await db.collection('food_restaurants').find(TAG).project({ restaurantName: 1, seedKey: 1, coverImage: 1 }).toArray();
    for (const r of restaurants) {
        if (!force && hasLocalImage(r.coverImage)) { tally.photos.skipped += 1; continue; }
        const term = termFrom(COVER_TERMS, `${r.seedKey} ${r.restaurantName}`);
        await photograph(r.restaurantName, term, 'food/restaurants', ({ url, credit }) =>
            db.collection('food_restaurants').updateOne({ _id: r._id }, {
                $set: { coverImage: url, coverImages: [url], profileImage: url, imageCredit: credit, updatedAt: new Date() },
            }));
    }

    console.log('\nDish photos');
    const items = await db.collection('food_items').find(TAG).project({ name: 1, image: 1 }).toArray();
    for (const item of items) {
        if (!force && hasLocalImage(item.image)) { tally.photos.skipped += 1; continue; }
        const term = termFrom(DISH_TERMS, item.name);
        await photograph(item.name, term, 'food/menu-items', ({ url, credit }) =>
            db.collection('food_items').updateOne({ _id: item._id }, {
                $set: { image: url, images: [url], imageCredit: credit, updatedAt: new Date() },
            }));
    }

    console.log(`\ncategories: ${tally.categories.created} created, ${tally.categories.kept} already there`);
    console.log(`photos:     ${tally.photos.ok} stored, ${tally.photos.skipped} already had one, ${tally.photos.failed} failed${dry ? ' (dry run: nothing written)' : ''}`);
    await disconnectDB();
    process.exit(tally.photos.failed > 0 && tally.photos.ok === 0 && !dry ? 1 : 0);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
