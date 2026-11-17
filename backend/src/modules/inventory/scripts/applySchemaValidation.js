// =============================================================================
// DATABASE-LEVEL SCHEMA VALIDATION ($jsonSchema) for Module 1 collections.
// Mongoose validates in the app; this makes MongoDB ITSELF reject bad documents
// (e.g. someone writing from Compass/mongosh with negative stock).
//
// Run: npm run db:setup     (safe to re-run; uses collMod when the collection exists)
// =============================================================================
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../../config/db');

const num = { bsonType: 'number' };
const nonNeg = { bsonType: 'number', minimum: 0 };
const oid = { bsonType: 'objectId' };
const oidOrNull = { bsonType: ['objectId', 'null'] };
const dateOrNull = { bsonType: ['date', 'null'] };

const validators = {
  categories: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'slug', 'code'],
      properties: {
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        slug: { bsonType: 'string' },
        code: { bsonType: 'string', pattern: '^[A-Z0-9]{2,6}$' },
        parent: oidOrNull,
        isActive: { bsonType: 'bool' },
      },
    },
  },

  products: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sku', 'name', 'category', 'pricing', 'status'],
      properties: {
        sku: { bsonType: 'string', pattern: '^[A-Z0-9]{2,6}(-[A-Z0-9]{2,8}){1,3}$', description: 'Format ELE-SAM-00012' },
        name: { bsonType: 'string', minLength: 1, maxLength: 150 },
        category: oid,
        pricing: {
          bsonType: 'object',
          required: ['costPrice', 'sellingPrice'],
          properties: { costPrice: nonNeg, sellingPrice: nonNeg, taxRate: { bsonType: 'number', minimum: 0, maximum: 100 } },
        },
        attributes: {
          bsonType: 'array',
          items: { bsonType: 'object', required: ['key', 'value'], properties: { key: { bsonType: 'string' }, value: { bsonType: 'string' } } },
        },
        reorderLevel: nonNeg,
        isPerishable: { bsonType: 'bool' },
        status: { enum: ['active', 'inactive', 'discontinued'] },
      },
    },
  },

  warehouses: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['code', 'name', 'address', 'location', 'capacity'],
      properties: {
        code: { bsonType: 'string', pattern: '^[A-Z0-9-]{3,20}$' },
        address: { bsonType: 'object', required: ['line1', 'city', 'state', 'postalCode'] },
        location: {
          bsonType: 'object',
          required: ['type', 'coordinates'],
          properties: {
            type: { enum: ['Point'] },
            coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: num },
          },
        },
        capacity: { bsonType: 'number', minimum: 1 },
        type: { enum: ['main', 'regional', 'store', 'cold_storage'] },
      },
    },
  },

  // $jsonSchema + $expr: reserved stock can never exceed physical stock
  inventory: {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          required: ['product', 'warehouse', 'quantity'],
          properties: { product: oid, warehouse: oid, quantity: nonNeg, reservedQuantity: nonNeg },
        },
      },
      { $expr: { $lte: [{ $ifNull: ['$reservedQuantity', 0] }, '$quantity'] } },
    ],
  },

  stock_batches: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['batchNumber', 'product', 'warehouse', 'quantity', 'initialQuantity', 'status'],
      properties: {
        batchNumber: { bsonType: 'string', minLength: 2 },
        product: oid,
        warehouse: oid,
        quantity: nonNeg,
        initialQuantity: nonNeg,
        expiryDate: dateOrNull,
        status: { enum: ['active', 'depleted', 'expired', 'written_off'] },
      },
    },
  },

  stock_transfers: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['transferNumber', 'fromWarehouse', 'toWarehouse', 'items', 'status'],
      properties: {
        fromWarehouse: oid,
        toWarehouse: oid,
        status: { enum: ['pending', 'completed', 'cancelled'] },
        items: {
          bsonType: 'array', minItems: 1,
          items: { bsonType: 'object', required: ['product', 'quantity'], properties: { product: oid, quantity: { bsonType: 'number', minimum: 1 } } },
        },
      },
    },
  },

  inventory_logs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['product', 'warehouse', 'type', 'quantityChange', 'quantityBefore', 'quantityAfter'],
      properties: {
        type: { enum: ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN'] },
        quantityChange: num,
        quantityBefore: nonNeg,
        quantityAfter: nonNeg,
      },
    },
  },
};

async function applySchemaValidation(db = mongoose.connection.db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  let skipped = 0;
  for (const [name, validator] of Object.entries(validators)) {
    const opts = { validator, validationLevel: 'strict', validationAction: 'error' };
    try {
      if (existing.has(name)) {
        await db.command({ collMod: name, ...opts });
      } else {
        try {
          await db.createCollection(name, opts);
        } catch (e) {
          // 48 = NamespaceExists: Mongoose auto-created it in the meantime → just add the validator
          if (e.code !== 48) throw e;
          await db.command({ collMod: name, ...opts });
        }
      }
      if (process.env.NODE_ENV !== 'test') console.log(`[schema] ${existing.has(name) ? 'updated' : 'created'} validator on ${name}`);
    } catch (err) {
      // Atlas users with only "readWrite" may not run collMod / create with a validator.
      // Don't block seeding; Mongoose validation still protects every write from the app.
      if (err.code === 8000 || err.code === 13 || /not allowed|not authorized/i.test(err.message)) {
        console.warn(`[schema] SKIPPED ${name}: the database user lacks permission to set validators (${err.message}).`);
        console.warn('[schema]   Ask the Atlas project owner to give this user the "dbAdmin" or "Atlas admin" role, then re-run npm run db:setup:inventory.');
        skipped += 1;
      } else {
        throw err;
      }
    }
  }
  return { skipped };
}

if (require.main === module) {
  (async () => {
    await connectDB();
    await applySchemaValidation();
    await disconnectDB();
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { applySchemaValidation, validators };
