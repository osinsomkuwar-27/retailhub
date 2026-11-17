const mongoose = require('mongoose');

/**
 * Isolated Inventory Integration Adapter (Person 2)
 *
 * Integration Contract for Person 1:
 * - Expected Collection: 'inventories' (Mongoose model: 'Inventory')
 * - Expected Document Fields:
 *     product: ObjectId (ref: 'Product')
 *     warehouse: ObjectId or String
 *     quantity: Number (total on-hand physical stock)
 *     reservedQuantity: Number (optional, stock reserved for pending fulfillment)
 *     damagedQuantity: Number (optional, non-sellable stock)
 *
 * Rules:
 * - Does NOT create a permanent competing Inventory schema.
 * - If Person 1's Inventory model or collection is present, applies atomic updates with { session }.
 * - If neither is present, halts and throws an explicit integration contract error.
 */

const getInventoryTarget = () => {
  if (mongoose.models && mongoose.models.Inventory) {
    return { type: 'model', target: mongoose.models.Inventory };
  }
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return { type: 'collection', target: mongoose.connection.db.collection('inventories') };
  }
  return null;
};

/**
 * Atomically deduct inventory for ordered items within a MongoDB transaction session.
 * @param {Array<{ product: ObjectId, quantity: Number, warehouse?: any }>} items
 * @param {ClientSession} session - MongoDB ClientSession
 * @returns {Promise<Array<{ productId: ObjectId, warehouse: any, deductedQty: Number }>>}
 */
const deductStock = async (items, session) => {
  const inv = getInventoryTarget();
  if (!inv) {
    throw new Error(
      'Inventory integration contract error: Person 1 Inventory model or collection is not available in database. Stock deduction aborted.'
    );
  }

  const allocations = [];

  for (const item of items) {
    const pId = mongoose.Types.ObjectId.isValid(item.product)
      ? new mongoose.Types.ObjectId(String(item.product))
      : item.product;
    const qty = Number(item.quantity);

    // Filter by product (and specific warehouse if assigned)
    const filter = {
      product: pId,
      quantity: { $gte: qty },
    };
    if (item.warehouse) {
      filter.warehouse = item.warehouse;
    }

    let updated = null;

    if (inv.type === 'model') {
      updated = await inv.target.findOneAndUpdate(
        filter,
        { $inc: { quantity: -qty } },
        { session, new: true }
      );
    } else {
      const res = await inv.target.findOneAndUpdate(
        filter,
        { $inc: { quantity: -qty } },
        { session, returnDocument: 'after' }
      );
      updated = res?.value || res;
    }

    if (!updated) {
      throw new Error(
        `Insufficient inventory during atomic deduction for product ${item.name || item.product}. Required: ${qty}.`
      );
    }

    allocations.push({
      product: pId,
      warehouse: updated.warehouse || null,
      deductedQty: qty,
    });
  }

  return allocations;
};

/**
 * Atomically restore inventory when an eligible order is cancelled.
 * @param {Array<{ product: ObjectId, quantity: Number, warehouse?: any }>} items
 * @param {ClientSession} session - MongoDB ClientSession
 */
const restoreStock = async (items, session) => {
  const inv = getInventoryTarget();
  if (!inv) {
    throw new Error(
      'Inventory integration contract error: Person 1 Inventory model or collection is not available in database. Stock restoration aborted.'
    );
  }

  for (const item of items) {
    const pId = mongoose.Types.ObjectId.isValid(item.product)
      ? new mongoose.Types.ObjectId(String(item.product))
      : item.product;
    const qty = Number(item.quantity);

    const filter = { product: pId };
    if (item.warehouse) {
      filter.warehouse = item.warehouse;
    }

    if (inv.type === 'model') {
      await inv.target.updateOne(
        filter,
        { $inc: { quantity: qty } },
        { session }
      );
    } else {
      await inv.target.updateOne(
        filter,
        { $inc: { quantity: qty } },
        { session }
      );
    }
  }
};

module.exports = {
  deductStock,
  restoreStock,
  getInventoryTarget,
};
