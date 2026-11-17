// Builds every index declared in the Module 1 Mongoose schemas and prints them.
// Run: npm run db:setup
const { connectDB, disconnectDB } = require('../../../config/db');
const models = require('../models');

async function syncAll() {
  for (const [name, Model] of Object.entries(models)) {
    await Model.syncIndexes();
    const idx = await Model.collection.indexes();
    console.log(`\n[indexes] ${name} (${Model.collection.collectionName})`);
    idx.forEach((i) => {
      const flags = [i.unique && 'unique', i.textIndexVersion && 'text', i['2dsphereIndexVersion'] && '2dsphere'].filter(Boolean).join(', ');
      console.log(`   - ${i.name.padEnd(48)} ${JSON.stringify(i.key)}${flags ? `  [${flags}]` : ''}`);
    });
  }
}

if (require.main === module) {
  (async () => {
    await connectDB();
    await syncAll();
    await disconnectDB();
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { syncAll };
