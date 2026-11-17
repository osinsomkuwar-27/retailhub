// Free product photos from Pexels (https://www.pexels.com/license/ — free to use, no attribution needed).
// Keyed by product name. Used by the seed and by scripts/updateProductMedia.js.
const px = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

const PHOTOS = {
  'Galaxy M35 5G Smartphone 128GB': px(5750001),
  'Redmi Note 14 Smartphone 128GB': px(14666017),
  'Rockerz 450 Bluetooth Headphones': px(1591),
  '20000mAh Power Bank': px(11031423),
  'USB-C Fast Charging Cable 1m': px(3921713),
  'Basmati Rice Premium 5kg': px(7593253),
  'Toor Dal 1kg': px(7245609),
  'Sunflower Oil 1L': px(12284682),
  'Whole Wheat Atta 10kg': px(6287223),
  'Instant Noodles Masala (Pack of 12)': px(8108073),
  'Toned Milk 1L': px(5946720),
  'Processed Cheese Slices 200g': px(4109953),
  'Brown Bread 400g': px(2067631),
  'Salted Butter 500g': px(7966386),
  'Premium Tea 1kg': px(227908),
  'Instant Coffee 200g': px(6781594),
  'Mixed Fruit Juice 1L': px(6331200),
  'Anti-Dandruff Shampoo 340ml': px(29611521),
  'Herbal Toothpaste 200g': px(4465829),
  'Moisturising Soap (Pack of 4)': px(6682972),
  'Non-Stick Fry Pan 24cm': px(105588),
  'Stainless Steel Water Bottle 1L': px(1188649),
  'Dishwash Liquid 750ml': px(28764305),
  'Electric Kettle 1.5L': px(3847432),
};

module.exports = { PHOTOS, px };
