/**
 * Demo data for two cities: a food zone and a taxi zone in each, with
 * restaurants, menus and ride prices, so the customer app has something to
 * show and quote in Indore and Jaipur.
 *
 *   node scripts/seed-demo-zones.mjs            # create or update
 *   node scripts/seed-demo-zones.mjs --dry      # print what it would do
 *   node scripts/seed-demo-zones.mjs --remove   # delete what it created
 *
 * Every document it writes carries `seedTag: 'azanto-demo-v1'` and a stable
 * `seedKey`, set straight on the collection after the model save (the schemas
 * are strict, so the model would drop them; the app never reads them). Re-runs
 * find their documents by that key and update them in place, and --remove
 * deletes by the tag and nothing else.
 *
 * Written through the real models, so defaults and hooks run (restaurant name
 * and phone normalisation, delivery-time minutes, vehicle active/status sync).
 * Field shapes follow what the admin panel writes: food zones as
 * food/admin/services/admin.service.js createZone, taxi zones, service
 * locations, vehicle types and set prices as taxi/admin/services/adminService.js.
 *
 * Existing vehicle types (Bike, Auto, Mini, Sedan) are reused by name and are
 * never modified or deleted. If a zone with one of these names already exists
 * and was not made by this script, the run stops: two overlapping zones would
 * split pricing and zone filters between them.
 *
 * No images (they would need a network fetch), no drivers, no FSSAI/GST/bank
 * details. Owner phones are the fake 60000xxxxx range, emails @azanto.demo.
 *
 * Refuses any database but appzeto_azanto, unless SEED_ALLOW_ANY_DB=1 (tests).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const SEED_TAG = 'azanto-demo-v1';
const DRY = process.argv.includes('--dry');
const REMOVE = process.argv.includes('--remove');

/*
 * The two cities. Change a name or polygon here and re-run: documents are
 * found by `key`, not by name, so they are updated rather than duplicated.
 * Polygon points are { lat, lng }; every restaurant must fall inside.
 */
const CITIES = [
    {
        key: 'indore',
        zoneName: 'Indore',
        serviceLocationName: 'Indore',
        city: 'Indore',
        state: 'Madhya Pradesh',
        center: { lat: 22.7196, lng: 75.8577 },
        // ~17 km across
        polygon: [
            { lat: 22.7901, lng: 75.8894 }, { lat: 22.7488, lng: 75.9342 },
            { lat: 22.6904, lng: 75.9342 }, { lat: 22.6491, lng: 75.8894 },
            { lat: 22.6491, lng: 75.8260 }, { lat: 22.6904, lng: 75.7812 },
            { lat: 22.7488, lng: 75.7812 }, { lat: 22.7901, lng: 75.8260 },
        ],
        phonePrefix: '600001',
        priceFactor: 1,
    },
    {
        key: 'jaipur',
        zoneName: 'Rajasthan (Jaipur)',
        serviceLocationName: 'Jaipur',
        city: 'Jaipur',
        state: 'Rajasthan',
        center: { lat: 26.9124, lng: 75.7873 },
        // ~21 km across
        polygon: [
            { lat: 26.9995, lng: 75.8278 }, { lat: 26.9485, lng: 75.8850 },
            { lat: 26.8763, lng: 75.8850 }, { lat: 26.8253, lng: 75.8278 },
            { lat: 26.8253, lng: 75.7468 }, { lat: 26.8763, lng: 75.6896 },
            { lat: 26.9485, lng: 75.6896 }, { lat: 26.9995, lng: 75.7468 },
        ],
        phonePrefix: '600002',
        priceFactor: 1.1,
    },
];

/* ------------------------------------------------------------------ menus */

// [name, price, 'V' | 'N', description]
const MENUS = {
    thali: [
        ['Thalis', [
            ['Malwa Special Thali', 249, 'V', 'Dal, two sabzi, kadhi, rice, four rotis, salad and a sweet'],
            ['Mini Thali', 169, 'V', 'Dal, one sabzi, rice and three rotis'],
            ['Dal Bafla Thali', 229, 'V', 'Ghee-dipped baflas with panchmel dal, chutney and ladoo'],
        ]],
        ['Main Course', [
            ['Paneer Butter Masala', 219, 'V', 'Cottage cheese in a rich tomato and butter gravy'],
            ['Sev Tamatar', 159, 'V', 'Tangy tomato curry topped with crunchy Ratlami sev'],
            ['Dal Tadka', 149, 'V', 'Yellow lentils tempered with cumin, garlic and ghee'],
            ['Mix Veg', 169, 'V', 'Seasonal vegetables cooked in an onion tomato masala'],
        ]],
        ['Breads & Rice', [
            ['Tawa Roti', 15, 'V', 'Whole wheat roti from the tawa'],
            ['Butter Naan', 45, 'V', 'Soft tandoor naan brushed with butter'],
            ['Jeera Rice', 119, 'V', 'Basmati rice tossed with cumin and ghee'],
        ]],
        ['Desserts', [
            ['Gulab Jamun (2 pcs)', 59, 'V', 'Warm khoya dumplings in rose sugar syrup'],
            ['Moong Dal Halwa', 99, 'V', 'Slow-roasted moong dal halwa with dry fruits'],
        ]],
    ],
    breakfast: [
        ['Poha & Jalebi', [
            ['Indori Poha', 49, 'V', 'Steamed flattened rice with sev, onion, pomegranate and jeeravan'],
            ['Poha Jalebi Combo', 79, 'V', 'A plate of poha with two hot jalebis'],
            ['Hot Jalebi (100 g)', 50, 'V', 'Crisp, syrupy jalebis fried to order'],
            ['Usal Poha', 69, 'V', 'Poha topped with spicy sprouted moth usal'],
        ]],
        ['Snacks', [
            ['Khaman Dhokla', 59, 'V', 'Soft gram flour dhokla with green chutney'],
            ['Samosa (2 pcs)', 39, 'V', 'Potato and pea samosas with tamarind chutney'],
            ['Kachori with Aloo Sabzi', 59, 'V', 'Flaky moong dal kachori with a spicy potato curry'],
            ['Bread Pakoda', 45, 'V', 'Stuffed bread fritter with green chutney'],
        ]],
        ['Beverages', [
            ['Masala Chai', 25, 'V', 'Strong tea brewed with ginger and cardamom'],
            ['Cold Coffee', 79, 'V', 'Chilled blended coffee with milk'],
            ['Sweet Lassi', 59, 'V', 'Thick churned curd, lightly sweetened'],
        ]],
    ],
    chaat: [
        ['Chaat', [
            ['Pani Puri (8 pcs)', 40, 'V', 'Crisp puris with spiced potato and tangy pani'],
            ['Dahi Puri', 60, 'V', 'Puris filled with curd, chutneys and sev'],
            ['Aloo Tikki Chaat', 70, 'V', 'Crisp potato patties with chole, curd and chutneys'],
            ['Papdi Chaat', 60, 'V', 'Papdi with potato, curd and sweet-sour chutney'],
        ]],
        ['Street Favourites', [
            ['Bhutte Ka Kees', 80, 'V', 'Grated sweet corn cooked in milk with mild spices'],
            ['Garadu Chaat', 90, 'V', 'Fried yam cubes with chaat masala and lemon'],
            ['Pav Bhaji', 110, 'V', 'Buttery mashed vegetable curry with toasted pav'],
            ['Dahi Vada', 70, 'V', 'Lentil dumplings soaked in sweet curd'],
        ]],
        ['Sweets & Drinks', [
            ['Shikanji', 40, 'V', 'Spiced lemonade with black salt and cumin'],
            ['Malpua with Rabdi', 90, 'V', 'Fried sweet pancakes with thickened milk'],
            ['Rabdi Kulfi', 60, 'V', 'Dense frozen milk dessert with pistachio'],
        ]],
    ],
    biryani: [
        ['Biryani', [
            ['Chicken Dum Biryani', 249, 'N', 'Basmati rice and chicken slow-cooked on dum with saffron'],
            ['Mutton Biryani', 329, 'N', 'Tender mutton layered with fragrant long-grain rice'],
            ['Egg Biryani', 189, 'N', 'Spiced rice with boiled eggs and fried onions'],
            ['Veg Dum Biryani', 179, 'V', 'Mixed vegetables and basmati rice on dum'],
        ]],
        ['Starters', [
            ['Chicken 65', 219, 'N', 'Crisp fried chicken tossed with curry leaves and chilli'],
            ['Chicken Seekh Kebab', 239, 'N', 'Minced chicken kebabs grilled on skewers'],
            ['Paneer Tikka', 209, 'V', 'Char-grilled cottage cheese marinated in spiced curd'],
        ]],
        ['Curries', [
            ['Chicken Korma', 259, 'N', 'Chicken in a mild cashew and onion gravy'],
            ['Mutton Rogan Josh', 319, 'N', 'Mutton in a Kashmiri chilli gravy'],
            ['Butter Naan', 45, 'V', 'Soft tandoor naan brushed with butter'],
        ]],
        ['Sides & Desserts', [
            ['Burani Raita', 59, 'V', 'Curd with roasted garlic'],
            ['Double Ka Meetha', 99, 'V', 'Bread pudding with saffron milk and nuts'],
        ]],
    ],
    tandoor: [
        ['Tandoor', [
            ['Tandoori Chicken (Half)', 279, 'N', 'Chicken marinated in yogurt and spices, roasted in the tandoor'],
            ['Chicken Tikka', 259, 'N', 'Boneless chicken chunks char-grilled with spices'],
            ['Chicken Malai Tikka', 279, 'N', 'Creamy, mildly spiced chicken kebabs'],
            ['Tandoori Paneer Tikka', 229, 'V', 'Cottage cheese, peppers and onion from the tandoor'],
            ['Tandoori Aloo', 179, 'V', 'Stuffed potatoes roasted in the tandoor'],
        ]],
        ['Main Course', [
            ['Butter Chicken', 299, 'N', 'Tandoori chicken in a velvety tomato butter gravy'],
            ['Kadhai Chicken', 279, 'N', 'Chicken with peppers in a kadhai masala'],
            ['Dal Makhani', 199, 'V', 'Black lentils simmered overnight with butter and cream'],
            ['Kadhai Paneer', 229, 'V', 'Paneer and peppers in a spiced kadhai masala'],
        ]],
        ['Breads', [
            ['Garlic Naan', 59, 'V', 'Tandoor naan topped with garlic and coriander'],
            ['Lachha Paratha', 55, 'V', 'Layered whole wheat paratha'],
            ['Tandoori Roti', 20, 'V', 'Whole wheat roti from the tandoor'],
        ]],
    ],
    southIndian: [
        ['Dosa', [
            ['Masala Dosa', 119, 'V', 'Crisp rice crepe with spiced potato filling'],
            ['Mysore Masala Dosa', 139, 'V', 'Dosa spread with red chutney and potato masala'],
            ['Paper Plain Dosa', 109, 'V', 'Extra thin, crisp plain dosa'],
            ['Onion Rava Dosa', 139, 'V', 'Lacy semolina dosa with onion and green chilli'],
        ]],
        ['Idli & Vada', [
            ['Idli Sambar (2 pcs)', 69, 'V', 'Steamed rice cakes with sambar and chutneys'],
            ['Medu Vada (2 pcs)', 79, 'V', 'Crisp lentil doughnuts with sambar'],
            ['Idli Vada Combo', 89, 'V', 'Two idlis and one vada with sambar'],
        ]],
        ['Uttapam & More', [
            ['Onion Uttapam', 119, 'V', 'Thick rice pancake topped with onion'],
            ['Tomato Onion Uttapam', 129, 'V', 'Uttapam topped with tomato, onion and coriander'],
            ['Lemon Rice', 99, 'V', 'Rice tempered with mustard, peanuts and lemon'],
        ]],
        ['Beverages', [
            ['Filter Coffee', 45, 'V', 'Strong decoction coffee with frothy milk'],
            ['Buttermilk', 35, 'V', 'Spiced chilled buttermilk'],
        ]],
    ],
    chinese: [
        ['Soups', [
            ['Hot and Sour Soup (Veg)', 109, 'V', 'Spicy, tangy soup with vegetables'],
            ['Chicken Manchow Soup', 129, 'N', 'Chicken soup with crispy noodles'],
        ]],
        ['Starters', [
            ['Veg Spring Roll', 149, 'V', 'Crisp rolls stuffed with stir-fried vegetables'],
            ['Chilli Paneer Dry', 199, 'V', 'Paneer tossed with peppers in chilli sauce'],
            ['Chilli Chicken Dry', 229, 'N', 'Crisp chicken tossed with soy, garlic and chilli'],
            ['Chicken Momos (8 pcs)', 149, 'N', 'Steamed chicken dumplings with red chutney'],
            ['Veg Momos (8 pcs)', 119, 'V', 'Steamed vegetable dumplings with red chutney'],
        ]],
        ['Noodles & Rice', [
            ['Veg Hakka Noodles', 159, 'V', 'Wok-tossed noodles with vegetables'],
            ['Chicken Hakka Noodles', 189, 'N', 'Wok-tossed noodles with chicken and vegetables'],
            ['Veg Fried Rice', 149, 'V', 'Wok-fried rice with vegetables and spring onion'],
            ['Chicken Fried Rice', 179, 'N', 'Wok-fried rice with chicken and egg'],
            ['Veg Manchurian Gravy', 169, 'V', 'Vegetable balls in a soy garlic gravy'],
        ]],
    ],
    cafe: [
        ['Coffee & Shakes', [
            ['Cappuccino', 119, 'V', 'Espresso with steamed, foamed milk'],
            ['Cold Coffee with Ice Cream', 149, 'V', 'Blended coffee topped with vanilla ice cream'],
            ['Oreo Shake', 159, 'V', 'Thick shake blended with cookies'],
        ]],
        ['Sandwiches & Bites', [
            ['Veg Grilled Sandwich', 119, 'V', 'Grilled sandwich with vegetables and cheese'],
            ['Paneer Tikka Sandwich', 149, 'V', 'Grilled sandwich with paneer tikka filling'],
            ['Cheese Garlic Bread', 129, 'V', 'Toasted bread with garlic butter and cheese'],
            ['Peri Peri Fries', 119, 'V', 'Crisp fries tossed in peri peri seasoning'],
        ]],
        ['Bakery', [
            ['Chocolate Truffle Pastry', 99, 'V', 'Eggless chocolate sponge with truffle ganache'],
            ['Blueberry Muffin', 89, 'V', 'Eggless muffin with blueberries'],
            ['Veg Puff', 45, 'V', 'Flaky pastry with spiced vegetable filling'],
        ]],
        ['Desserts', [
            ['Sizzling Brownie', 179, 'V', 'Warm walnut brownie with ice cream and chocolate sauce'],
            ['Red Velvet Pastry', 109, 'V', 'Eggless red velvet sponge with cream cheese frosting'],
        ]],
    ],
    rajasthani: [
        ['Rajasthani Thalis', [
            ['Marwari Thali', 299, 'V', 'Dal baati churma, gatte ki sabzi, kadhi, rice, rotis and papad'],
            ['Dal Baati Churma', 219, 'V', 'Three baatis with panchmel dal and sweet churma'],
            ['Mini Rajasthani Thali', 189, 'V', 'Dal, gatte, rice and three rotis'],
        ]],
        ['Main Course', [
            ['Gatte Ki Sabzi', 179, 'V', 'Gram flour dumplings in a spiced curd gravy'],
            ['Ker Sangri', 199, 'V', 'Desert beans and berries cooked with dry spices'],
            ['Rajasthani Kadhi', 149, 'V', 'Curd and gram flour curry with pakoras'],
            ['Papad Ki Sabzi', 159, 'V', 'Papad pieces in a tangy curd gravy'],
        ]],
        ['Breads', [
            ['Bajre Ki Roti', 30, 'V', 'Pearl millet roti with white butter'],
            ['Missi Roti', 35, 'V', 'Gram flour and wheat roti with spices'],
            ['Tawa Roti', 15, 'V', 'Whole wheat roti from the tawa'],
        ]],
        ['Sweets', [
            ['Ghevar', 119, 'V', 'Disc-shaped honeycomb sweet with rabdi'],
            ['Moong Dal Halwa', 99, 'V', 'Slow-roasted moong dal halwa with dry fruits'],
        ]],
    ],
    kachori: [
        ['Kachori & Samosa', [
            ['Pyaaz Kachori', 35, 'V', 'Flaky kachori stuffed with spiced onion'],
            ['Mawa Kachori', 60, 'V', 'Sweet kachori filled with mawa and dry fruits, dipped in syrup'],
            ['Dal Kachori', 30, 'V', 'Kachori stuffed with spiced moong dal'],
            ['Samosa (2 pcs)', 39, 'V', 'Potato and pea samosas with tamarind chutney'],
        ]],
        ['Chaat', [
            ['Kachori Chaat', 70, 'V', 'Crushed kachori with curd, chutneys and sev'],
            ['Pani Puri (8 pcs)', 40, 'V', 'Crisp puris with spiced potato and tangy pani'],
            ['Raj Kachori', 90, 'V', 'Giant kachori filled with sprouts, curd and chutneys'],
            ['Mirchi Vada', 40, 'V', 'Stuffed green chilli fritter'],
        ]],
        ['Sweets & Drinks', [
            ['Rabdi Jalebi', 80, 'V', 'Hot jalebis with chilled rabdi'],
            ['Masala Chaas', 35, 'V', 'Spiced buttermilk with roasted cumin'],
            ['Kesar Lassi', 69, 'V', 'Thick lassi with saffron and cardamom'],
        ]],
    ],
    sweets: [
        ['Sweets', [
            ['Kaju Katli (250 g)', 249, 'V', 'Cashew fudge with silver leaf'],
            ['Ghewar (1 pc)', 129, 'V', 'Honeycomb sweet topped with rabdi'],
            ['Motichoor Ladoo (250 g)', 149, 'V', 'Fine boondi ladoo with ghee'],
            ['Rasmalai (2 pcs)', 99, 'V', 'Soft chenna discs in saffron milk'],
        ]],
        ['Namkeen & Snacks', [
            ['Pyaaz Kachori', 35, 'V', 'Flaky kachori stuffed with spiced onion'],
            ['Samosa (2 pcs)', 39, 'V', 'Potato and pea samosas with tamarind chutney'],
            ['Dhokla', 59, 'V', 'Soft gram flour dhokla with green chutney'],
            ['Chole Bhature', 129, 'V', 'Spicy chickpeas with two fluffy bhature'],
        ]],
        ['Beverages', [
            ['Kesar Badam Milk', 79, 'V', 'Chilled milk with saffron and almonds'],
            ['Sweet Lassi', 59, 'V', 'Thick churned curd, lightly sweetened'],
            ['Masala Chai', 25, 'V', 'Strong tea brewed with ginger and cardamom'],
        ]],
    ],
    pizza: [
        ['Pizzas', [
            ['Margherita Pizza (8")', 199, 'V', 'Tomato sauce, mozzarella and basil'],
            ['Farmhouse Pizza (8")', 259, 'V', 'Onion, capsicum, tomato and mushroom'],
            ['Paneer Tikka Pizza (8")', 279, 'V', 'Paneer tikka, onion and mint mayo'],
            ['Corn & Cheese Pizza (8")', 229, 'V', 'Sweet corn with extra mozzarella'],
        ]],
        ['Pasta', [
            ['Penne Arrabbiata', 219, 'V', 'Penne in a spicy tomato sauce'],
            ['Penne Alfredo', 239, 'V', 'Penne in a creamy white sauce with herbs'],
        ]],
        ['Sides', [
            ['Garlic Breadsticks', 119, 'V', 'Oven-baked breadsticks with garlic butter'],
            ['Cheesy Fries', 139, 'V', 'Fries topped with cheese sauce'],
            ['Veg Burger', 109, 'V', 'Crisp vegetable patty with lettuce and mayo'],
        ]],
        ['Desserts & Drinks', [
            ['Choco Lava Cake', 99, 'V', 'Warm chocolate cake with a molten centre'],
            ['Virgin Mojito', 109, 'V', 'Mint, lime and soda'],
        ]],
    ],
};

/* ------------------------------------------------------------ restaurants */

// [slug, name, menu, pureVeg, cuisines, area, addressLine1, pincode, lat, lng, rating, totalRatings, etaMins, featuredDish]
const RESTAURANTS = {
    indore: [
        ['malwa-thali-house', 'Malwa Thali House', 'thali', true, ['North Indian', 'Thali', 'Malwi'],
            'Palasia', '14 AB Road, near Palasia Square', '452001', 22.7243, 75.8839, 4.4, 860, 30, 'Malwa Special Thali'],
        ['poha-junction-cafe', 'Poha Junction Cafe', 'breakfast', true, ['Breakfast', 'Snacks', 'Beverages'],
            'Rajwada', '7 Khajuri Bazaar, near Rajwada', '452002', 22.7186, 75.8553, 4.3, 1240, 20, 'Indori Poha'],
        ['rajwada-chaat-corner', 'Rajwada Chaat Corner', 'chaat', true, ['Street Food', 'Chaat', 'Desserts'],
            'Sarafa', '22 Sarafa Lane', '452002', 22.7172, 75.8530, 4.2, 640, 25, 'Bhutte Ka Kees'],
        ['narmada-biryani-co', 'Narmada Biryani Co.', 'biryani', false, ['Biryani', 'Mughlai', 'North Indian'],
            'Vijay Nagar', 'Plot 31, Scheme 54, Vijay Nagar', '452010', 22.7533, 75.8937, 4.1, 980, 35, 'Chicken Dum Biryani'],
        ['holkar-tandoor-grill', 'Holkar Tandoor Grill', 'tandoor', false, ['North Indian', 'Tandoor', 'Kebabs'],
            'Saket', '5 Saket Nagar Main Road', '452018', 22.7280, 75.8920, 4.3, 720, 35, 'Butter Chicken'],
        ['vijay-nagar-dosa-point', 'Vijay Nagar Dosa Point', 'southIndian', true, ['South Indian', 'Breakfast'],
            'Vijay Nagar', '118 Mechanic Nagar Extension, Vijay Nagar', '452010', 22.7489, 75.8862, 4.2, 510, 25, 'Masala Dosa'],
        ['annapurna-wok-and-noodles', 'Annapurna Wok & Noodles', 'chinese', false, ['Chinese', 'Momos', 'Fast Food'],
            'Annapurna', '9 Annapurna Road, near Usha Nagar', '452009', 22.6966, 75.8317, 4.0, 430, 30, 'Chilli Chicken Dry'],
        ['bhawarkua-bake-and-brew', 'Bhawarkua Bake & Brew', 'cafe', true, ['Cafe', 'Bakery', 'Desserts'],
            'Bhawarkua', '41 Bhawarkua Main Road', '452001', 22.6926, 75.8673, 4.4, 590, 25, 'Cold Coffee with Ice Cream'],
    ],
    jaipur: [
        ['pink-city-tandoor', 'Pink City Tandoor', 'tandoor', false, ['North Indian', 'Tandoor', 'Kebabs'],
            'C-Scheme', '12 Prithviraj Road, C-Scheme', '302001', 26.9060, 75.8010, 4.3, 1120, 35, 'Tandoori Chicken (Half)'],
        ['marwar-thali-rasoi', 'Marwar Thali Rasoi', 'rajasthani', true, ['Rajasthani', 'Thali', 'North Indian'],
            'MI Road', '58 MI Road, near Panch Batti', '302001', 26.9170, 75.8040, 4.5, 1430, 30, 'Marwari Thali'],
        ['johari-kachori-corner', 'Johari Kachori Corner', 'kachori', true, ['Street Food', 'Snacks', 'Sweets'],
            'Johari Bazaar', '201 Johari Bazaar Road', '302003', 26.9190, 75.8270, 4.4, 1880, 20, 'Pyaaz Kachori'],
        ['amber-biryani-darbar', 'Amber Biryani Darbar', 'biryani', false, ['Biryani', 'Mughlai'],
            'Bani Park', '17 Kanti Chandra Road, Bani Park', '302016', 26.9300, 75.7920, 4.1, 690, 35, 'Mutton Biryani'],
        ['vaishali-dosa-junction', 'Vaishali Dosa Junction', 'southIndian', true, ['South Indian', 'Breakfast'],
            'Vaishali Nagar', 'B-44 Amrapali Marg, Vaishali Nagar', '302021', 26.9110, 75.7430, 4.2, 540, 25, 'Mysore Masala Dosa'],
        ['mansarovar-momo-and-wok', 'Mansarovar Momo & Wok', 'chinese', false, ['Chinese', 'Momos', 'Fast Food'],
            'Mansarovar', '88 Madhyam Marg, Mansarovar', '302020', 26.8560, 75.7600, 4.0, 470, 30, 'Chicken Momos (8 pcs)'],
        ['raja-park-sweets-and-snacks', 'Raja Park Sweets & Snacks', 'sweets', true, ['Sweets', 'Snacks', 'Desserts'],
            'Raja Park', '6 Gurudwara Road, Raja Park', '302004', 26.8960, 75.8300, 4.3, 820, 25, 'Ghewar (1 pc)'],
        ['malviya-nagar-pizza-studio', 'Malviya Nagar Pizza Studio', 'pizza', true, ['Pizza', 'Italian', 'Fast Food'],
            'Malviya Nagar', 'D-31 Gaurav Path, Malviya Nagar', '302017', 26.8530, 75.8050, 4.1, 610, 30, 'Farmhouse Pizza (8")'],
    ],
};

/* ---------------------------------------------------------------- taxi */

// Existing types with these names are reused; missing ones are created.
const VEHICLES = [
    { key: 'bike', name: 'Bike', icon_types: 'bike', capacity: 1, short_description: 'Quick bike rides for one' },
    { key: 'auto', name: 'Auto', icon_types: 'auto', capacity: 3, short_description: 'Auto rickshaw for up to 3' },
    { key: 'mini', name: 'Mini', icon_types: 'car', capacity: 4, short_description: 'Compact hatchback for 4' },
    { key: 'sedan', name: 'Sedan', icon_types: 'car', capacity: 4, short_description: 'Comfortable sedan for 4' },
];

// INR, before the city's priceFactor. base_price covers base_distance km.
const FARES = {
    bike: { base_price: 25, base_distance: 2, price_per_distance: 7, time_price: 1, waiting_charge: 1, platform_fee: 5, cancel: 10, order: 1 },
    auto: { base_price: 35, base_distance: 2, price_per_distance: 12, time_price: 1.5, waiting_charge: 1.5, platform_fee: 5, cancel: 20, order: 2 },
    mini: { base_price: 60, base_distance: 3, price_per_distance: 14, time_price: 2, waiting_charge: 2, platform_fee: 10, cancel: 30, order: 3 },
    sedan: { base_price: 80, base_distance: 3, price_per_distance: 17, time_price: 2, waiting_charge: 2.5, platform_fee: 10, cancel: 40, order: 4 },
};

/* ------------------------------------------------------------- helpers */

const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const roundRupee = (n) => Math.round(n);
// A dish price scaled by the city factor, kept menu-like: 207.9 -> 209, 16.5 -> 15.
const menuPrice = (base, factor) => {
    if (factor === 1) return base;
    const scaled = base * factor;
    return scaled < 50 ? Math.max(5, Math.round(scaled / 5) * 5) : Math.round(scaled / 10) * 10 - 1;
};
const roundHalf = (n) => Math.round(n * 2) / 2;

// Same ray casting the food zone detection uses (food/shared/zoneMatching.js).
const insidePolygon = (lat, lng, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng; const yi = polygon[i].lat;
        const xj = polygon[j].lng; const yj = polygon[j].lat;
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

const dbNameOf = (uri) => {
    const rest = String(uri || '').replace(/^mongodb(\+srv)?:\/\//, '');
    const slash = rest.indexOf('/');
    if (slash < 0) return '';
    return decodeURIComponent(rest.slice(slash + 1).split('?')[0] || '');
};

const summary = new Map(); // label -> { created: [], updated: [], unchanged: [], reused: [], removed: n, kept: [] }
const bucket = (label) => {
    if (!summary.has(label)) summary.set(label, { created: [], updated: [], unchanged: [], reused: [], removed: 0, kept: [] });
    return summary.get(label);
};

const findSeeded = (Model, seedKey) =>
    Model.collection.findOne({ seedTag: SEED_TAG, seedKey }, { projection: { _id: 1 } });

/**
 * Create or update one document through its model, then stamp the marker on
 * the raw collection. `onCreate` holds fields written only the first time
 * (approval dates), so a re-run with nothing changed changes nothing.
 */
async function upsert(Model, label, seedKey, data, onCreate = {}) {
    const existing = await findSeeded(Model, seedKey);
    if (DRY) {
        const id = existing?._id || new mongoose.Types.ObjectId();
        bucket(label)[existing ? 'updated' : 'created'].push(`${id}${existing ? '' : ' (new)'}  ${seedKey}`);
        return id;
    }
    let doc = existing ? await Model.findById(existing._id) : null;
    const isNew = !doc;
    if (isNew) doc = new Model({ ...data, ...onCreate });
    else doc.set(data);
    const changed = isNew || doc.isModified();
    if (changed) await doc.save();
    await Model.collection.updateOne({ _id: doc._id }, { $set: { seedTag: SEED_TAG, seedKey } });
    bucket(label)[isNew ? 'created' : changed ? 'updated' : 'unchanged'].push(`${doc._id}  ${seedKey}`);
    return doc._id;
}

/* -------------------------------------------------------------- connect */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
}
const dbName = dbNameOf(uri);
if (!dbName.endsWith('appzeto_azanto') && process.env.SEED_ALLOW_ANY_DB !== '1') {
    console.error(`Refusing to run against database "${dbName || '(none in URI)'}": expected a name ending in appzeto_azanto.`);
    process.exit(1);
}

for (const city of CITIES) {
    for (const r of RESTAURANTS[city.key]) {
        if (!insidePolygon(r[8], r[9], city.polygon)) {
            console.error(`${r[1]} (${r[8]}, ${r[9]}) is outside the ${city.zoneName} polygon. Fix RESTAURANTS or CITIES.`);
            process.exit(1);
        }
    }
}

await mongoose.connect(uri);
console.log(`${DRY ? '[dry] ' : ''}${REMOVE ? 'removing' : 'seeding'} ${SEED_TAG} in "${dbName}"`);

const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
const { FoodCategory } = await import('../src/modules/food/admin/models/category.model.js');
const { FoodItem } = await import('../src/modules/food/admin/models/food.model.js');
const { Zone: TaxiZone } = await import('../src/modules/taxi/driver/models/Zone.js');
const { ServiceLocation } = await import('../src/modules/taxi/admin/models/ServiceLocation.js');
const { Vehicle } = await import('../src/modules/taxi/admin/models/Vehicle.js');
const { SetPrice } = await import('../src/modules/taxi/admin/models/SetPrice.js');

const TAG = { seedTag: SEED_TAG };
const notSeeded = { seedTag: { $ne: SEED_TAG } };

/* --------------------------------------------------------------- remove */

async function remove() {
    const ids = async (Model) => (await Model.collection.find(TAG, { projection: { _id: 1 } }).toArray()).map((d) => d._id);

    // Removes the seeded docs of a model, except those something else now uses.
    const drop = async (Model, label, inUse = async () => null) => {
        const kept = [];
        const doomed = [];
        for (const id of await ids(Model)) {
            const reason = await inUse(id);
            if (reason) kept.push(`${id}  (${reason})`);
            else doomed.push(id);
        }
        const b = bucket(label);
        b.kept.push(...kept);
        if (DRY) { b.removed = doomed.length; return; }
        if (doomed.length) b.removed = (await Model.collection.deleteMany({ _id: { $in: doomed }, ...TAG })).deletedCount;
    };

    await drop(FoodItem, 'food items');
    await drop(FoodCategory, 'food categories', async (id) =>
        (await FoodItem.collection.countDocuments({ categoryId: id, ...notSeeded })) ? 'used by other items' : null);
    await drop(FoodRestaurant, 'restaurants');
    await drop(FoodZone, 'food zones', async (id) =>
        (await FoodRestaurant.collection.countDocuments({ zoneId: id, ...notSeeded })) ? 'has other restaurants' : null);
    await drop(SetPrice, 'taxi set prices');
    await drop(TaxiZone, 'taxi zones', async (id) =>
        (await SetPrice.collection.countDocuments({ zone_id: id, ...notSeeded })) ? 'has other set prices' : null);
    await drop(ServiceLocation, 'taxi service locations', async (id) => {
        if (await TaxiZone.collection.countDocuments({ service_location_id: id, ...notSeeded })) return 'has other zones';
        if (await SetPrice.collection.countDocuments({ service_location_id: id, ...notSeeded })) return 'has other set prices';
        return null;
    });
    await drop(Vehicle, 'taxi vehicle types', async (id) => {
        if (await SetPrice.collection.countDocuments({ vehicle_type: id, ...notSeeded })) return 'has other set prices';
        if (await mongoose.connection.collection('taxidrivers').countDocuments({ vehicleTypeId: id })) return 'drivers use it';
        return null;
    });
}

/* ----------------------------------------------------------------- seed */

async function assertNoForeignZones() {
    const conflicts = [];
    for (const city of CITIES) {
        const rx = new RegExp(`^\\s*${city.zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const food = await FoodZone.collection.findOne({ name: rx, ...notSeeded }, { projection: { _id: 1 } });
        if (food) conflicts.push(`food zone "${city.zoneName}" ${food._id}`);
        const taxi = await TaxiZone.collection.findOne({ name: rx, ...notSeeded }, { projection: { _id: 1 } });
        if (taxi) conflicts.push(`taxi zone "${city.zoneName}" ${taxi._id}`);
    }
    if (conflicts.length) {
        throw new Error(`zones with these names already exist and were not made by this script:\n  ${conflicts.join('\n  ')}\n`
            + 'Rename the zone in CITIES, or remove/rename the existing one, then re-run.');
    }
}

async function resolveVehicles() {
    const out = {};
    for (const v of VEHICLES) {
        const seedKey = `vehicle:${v.key}`;
        const own = await findSeeded(Vehicle, seedKey);
        if (!own) {
            const rx = new RegExp(`^\\s*${v.name}\\s*$`, 'i');
            const existing = await Vehicle.findOne({ name: rx, transport_type: { $in: ['taxi', 'both'] }, ...notSeeded })
                .sort({ active: -1, createdAt: 1 }).select('_id name').lean();
            if (existing) {
                bucket('taxi vehicle types').reused.push(`${existing._id}  ${existing.name}`);
                out[v.key] = existing._id;
                continue;
            }
        }
        // Shaped as adminService.createVehicleType writes it.
        out[v.key] = await upsert(Vehicle, 'taxi vehicle types', seedKey, {
            name: v.name,
            short_description: v.short_description,
            description: '',
            transport_type: 'taxi',
            dispatch_type: 'normal',
            icon_types: v.icon_types,
            capacity: v.capacity,
            ride_surge_amount: 0,
            is_taxi: 'taxi',
            is_accept_share_ride: 0,
            delivery_category: '',
            status: 1,
            active: true,
        });
    }
    return out;
}

async function seedCity(city, vehicleIds) {
    const ring = city.polygon;

    // Food zone, as food admin createZone builds it.
    const foodZoneId = await upsert(FoodZone, 'food zones', `food-zone:${city.key}`, {
        name: city.zoneName,
        zoneName: city.zoneName,
        country: 'India',
        serviceLocation: city.zoneName,
        unit: 'kilometer',
        boundary_mode: 'polygon',
        coordinates: ring.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        isActive: true,
    });

    // Service location: reuse one of the same name if an admin already made it.
    let serviceLocationId = null;
    if (!(await findSeeded(ServiceLocation, `service-location:${city.key}`))) {
        const rx = new RegExp(`^\\s*${city.serviceLocationName}\\s*$`, 'i');
        const existing = await ServiceLocation.findOne({ name: rx, ...notSeeded }).select('_id name').lean();
        if (existing) {
            serviceLocationId = existing._id;
            bucket('taxi service locations').reused.push(`${existing._id}  ${existing.name}`);
        }
    }
    if (!serviceLocationId) {
        // As normalizeServiceLocationPayload.
        serviceLocationId = await upsert(ServiceLocation, 'taxi service locations', `service-location:${city.key}`, {
            name: city.serviceLocationName,
            service_location_name: city.serviceLocationName,
            address: `${city.city}, ${city.state}`,
            country: 'India',
            currency_name: 'Indian Rupee',
            currency_symbol: '₹',
            currency_code: 'INR',
            timezone: 'Asia/Kolkata',
            unit: 'km',
            latitude: city.center.lat,
            longitude: city.center.lng,
            location: { type: 'Point', coordinates: [city.center.lng, city.center.lat] },
            status: 'active',
            active: true,
        });
    }

    // Taxi zone, as taxi admin createZone builds it: a closed [lng, lat] ring.
    const closed = [...ring.map((p) => [p.lng, p.lat]), [ring[0].lng, ring[0].lat]];
    const taxiZoneId = await upsert(TaxiZone, 'taxi zones', `taxi-zone:${city.key}`, {
        name: city.zoneName,
        service_location_id: serviceLocationId,
        unit: 'km',
        ride_surge_enabled: false,
        active: true,
        status: 'active',
        boundary_mode: 'polygon',
        circle_center: { lat: null, lng: null },
        circle_radius_meters: null,
        geometry: { type: 'Polygon', coordinates: [closed] },
    });

    // One ride price row per vehicle, scoped to this zone.
    for (const v of VEHICLES) {
        const f = FARES[v.key];
        const k = city.priceFactor;
        await upsert(SetPrice, 'taxi set prices', `set-price:${city.key}:${v.key}`, {
            zone_id: taxiZoneId,
            service_location_id: serviceLocationId,
            vehicle_type: vehicleIds[v.key],
            pricing_scope: 'ride',
            transport_type: 'taxi',
            payment_type: ['cash', 'online', 'wallet'],
            active: 1,
            status: 'active',
            base_price: roundRupee(f.base_price * k),
            base_distance: f.base_distance,
            price_per_distance: roundHalf(f.price_per_distance * k),
            time_price: roundHalf(f.time_price * k),
            waiting_charge: roundHalf(f.waiting_charge * k),
            free_waiting_before: 3,
            free_waiting_after: 3,
            ride_surge_amount: 0,
            // Platform fee: flat rupees (type 0), see common/platformFee.js.
            admin_commision_type: 0,
            admin_commision: f.platform_fee,
            platform_fee_gst: 0,
            admin_commission_type_from_driver: 1,
            admin_commission_from_driver: 10,
            admin_commission_type_for_owner: 1,
            admin_commission_for_owner: 10,
            service_tax: 0,
            enable_airport_ride: false,
            enable_outstation_ride: false,
            user_cancellation_fee_type: 'fixed',
            user_cancellation_fee: f.cancel,
            driver_cancellation_fee_type: 'fixed',
            driver_cancellation_fee: 0,
            enable_cancellation_charge: true,
            free_cancellation_time: 2,
            fixed_cancellation_charge: f.cancel,
            order_number: f.order,
            bill_status: 1,
        });
    }

    // Restaurants, their categories and dishes.
    let idx = 0;
    for (const [slug, name, menuKey, pureVeg, cuisines, area, addressLine1, pincode, lat, lng, rating, totalRatings, eta, featuredDish] of RESTAURANTS[city.key]) {
        idx += 1;
        const phone = `${city.phonePrefix}${String(idx).padStart(4, '0')}`;
        const menu = MENUS[menuKey];
        const featured = menu.flatMap(([, items]) => items).find(([n]) => n === featuredDish);
        const restaurantId = await upsert(FoodRestaurant, 'restaurants', `restaurant:${slug}`, {
            restaurantName: name,
            ownerName: `${name} Owner`,
            ownerEmail: `owner+${slug}@azanto.demo`,
            ownerPhone: phone,
            primaryContactNumber: phone,
            pureVegRestaurant: pureVeg,
            addressLine1,
            area,
            city: city.city,
            state: city.state,
            pincode,
            cuisines,
            openingTime: '09:00',
            closingTime: '23:30',
            openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            isAcceptingOrders: true,
            location: {
                type: 'Point',
                coordinates: [lng, lat],
                latitude: lat,
                longitude: lng,
                formattedAddress: `${addressLine1}, ${area}, ${city.city}, ${city.state} ${pincode}`,
                address: `${addressLine1}, ${area}, ${city.city}`,
                addressLine1,
                area,
                city: city.city,
                state: city.state,
                pincode,
            },
            zoneId: foodZoneId,
            estimatedDeliveryTime: `${eta}-${eta + 5} mins`,
            estimatedDeliveryTimeMinutes: eta,
            featuredDish,
            featuredPrice: featured ? menuPrice(featured[1], city.priceFactor) : undefined,
            rating,
            totalRatings,
            gstRegistered: false,
            priceIncludesGst: false,
            diningSettings: { isEnabled: false, maxGuests: 6, diningType: 'family-dining' },
            serviceRadiusKm: 8,
            serviceRadiusUpdatedBy: 'admin',
            status: 'approved',
        }, { approvedAt: new Date(), serviceRadiusUpdatedAt: new Date() });

        const keepItemKeys = [];
        const keepCategoryKeys = [];
        let sort = 0;
        for (const [categoryName, items] of menu) {
            sort += 1;
            const scope = items.every((i) => i[2] === 'V') ? 'Veg' : items.every((i) => i[2] === 'N') ? 'Non-Veg' : 'Both';
            const categoryKey = `category:${slug}:${slugify(categoryName)}`;
            keepCategoryKeys.push(categoryKey);
            const categoryId = await upsert(FoodCategory, 'food categories', categoryKey, {
                name: categoryName,
                restaurantId,
                createdByRestaurantId: restaurantId,
                zoneId: foodZoneId,
                foodTypeScope: scope,
                approvalStatus: 'approved',
                isApproved: true,
                isActive: true,
                sortOrder: sort,
            }, { approvedAt: new Date() });

            for (const [itemName, basePrice, veg, description] of items) {
                const price = menuPrice(basePrice, city.priceFactor);
                const itemKey = `item:${slug}:${slugify(itemName)}`;
                keepItemKeys.push(itemKey);
                await upsert(FoodItem, 'food items', itemKey, {
                    restaurantId,
                    categoryId,
                    categoryName,
                    name: itemName,
                    description,
                    price,
                    basePrice: price,
                    discountPercent: 0,
                    foodType: veg === 'V' ? 'Veg' : 'Non-Veg',
                    image: '',
                    isActive: true,
                    isAvailable: true,
                    isRecommended: itemName === featuredDish,
                    preparationTime: '15-20 mins',
                    minOrderQuantity: 1,
                    maxOrderQuantity: 0,
                    approvalStatus: 'approved',
                }, { approvedAt: new Date(), requestedAt: new Date() });
            }
        }

        // Dishes and categories dropped from this script since the last run.
        if (!DRY) {
            const staleItems = await FoodItem.collection.deleteMany({ ...TAG, restaurantId, seedKey: { $nin: keepItemKeys } });
            const staleCats = await FoodCategory.collection.deleteMany({ ...TAG, restaurantId, seedKey: { $nin: keepCategoryKeys } });
            bucket('food items').removed += staleItems.deletedCount;
            bucket('food categories').removed += staleCats.deletedCount;
        }
    }
}

/* ------------------------------------------------------------------ run */

try {
    if (REMOVE) {
        await remove();
    } else {
        await assertNoForeignZones();
        const vehicleIds = await resolveVehicles();
        for (const city of CITIES) await seedCity(city, vehicleIds);
    }

    console.log('');
    const LIST_IDS = new Set(['food zones', 'taxi zones', 'taxi service locations', 'taxi vehicle types', 'restaurants', 'taxi set prices']);
    for (const [label, b] of summary) {
        const parts = REMOVE
            ? [`removed ${b.removed}`, ...(b.kept.length ? [`kept ${b.kept.length}`] : [])]
            : [`created ${b.created.length}`, `updated ${b.updated.length}`, `unchanged ${b.unchanged.length}`,
                ...(b.reused.length ? [`reused ${b.reused.length}`] : []), ...(b.removed ? [`removed stale ${b.removed}`] : [])];
        console.log(`${label.padEnd(24)} ${parts.join(', ')}`);
        const show = REMOVE ? b.kept.map((s) => `kept ${s}`)
            : LIST_IDS.has(label)
                ? [...b.created.map((s) => `+ ${s}`), ...b.updated.map((s) => `~ ${s}`), ...b.unchanged.map((s) => `= ${s}`), ...b.reused.map((s) => `reused ${s}`)]
                : [];
        for (const line of show) console.log(`    ${line}`);
    }
    if (DRY) console.log('\n[dry] nothing was written.');
} catch (err) {
    console.error(`\nfailed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
