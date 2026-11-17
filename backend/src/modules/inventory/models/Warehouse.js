const mongoose = require('mongoose');
const { WAREHOUSE_TYPES } = require('../utils/constants');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: [true, 'Address line is required'], trim: true },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, required: [true, 'City is required'], trim: true },
    state: { type: String, required: [true, 'State is required'], trim: true },
    postalCode: { type: String, required: [true, 'Postal code is required'], trim: true },
    country: { type: String, default: 'India', trim: true },
  },
  { _id: false },
);

// GeoJSON point → enables $geoNear "nearest warehouse" queries
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: (c) => c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
        message: 'Coordinates must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

const warehouseSchema = new mongoose.Schema(
  {
    code: {
      type: String, required: [true, 'Warehouse code is required'], uppercase: true, trim: true,
      match: [/^[A-Z0-9-]{3,20}$/, 'Code must be 3–20 letters, digits or dashes'],
    },
    name: { type: String, required: [true, 'Warehouse name is required'], trim: true, maxlength: 100 },
    type: { type: String, enum: WAREHOUSE_TYPES, default: 'regional' },
    address: { type: addressSchema, required: true },   // EMBEDDED
    location: { type: pointSchema, required: true },    // EMBEDDED GeoJSON
    capacity: { type: Number, min: [1, 'Capacity must be positive'], required: [true, 'Capacity is required'] },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // REFERENCED (Person 4 users)
    contact: {
      phone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'warehouses' },
);

warehouseSchema.index({ code: 1 }, { unique: true });
warehouseSchema.index({ location: '2dsphere' }); // Geospatial index
warehouseSchema.index({ isActive: 1, 'address.city': 1 });

module.exports = mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema);
