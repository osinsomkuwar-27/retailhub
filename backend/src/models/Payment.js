const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount must be non-negative'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    paymentMethod: {
      type: String,
      enum: ['MOCK_ONLINE', 'COD'],
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    transactionId: {
      type: String,
      sparse: true,
      index: true,
    },
    gatewayResponse: {
      gateway: { type: String, default: 'MOCK_GATEWAY' },
      message: { type: String, default: '' },
      simulatedAt: { type: Date, default: Date.now },
      isSimulated: { type: Boolean, default: true },
    },
    refundDetails: {
      isSimulated: { type: Boolean, default: true },
      refundedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
      refundNote: {
        type: String,
        default: 'Simulated mock refund for academic/testing purposes. No real monetary transaction occurred.',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Database-level safeguard: Ensure only ONE successful (PAID) payment can ever exist per order
paymentSchema.index(
  { order: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PAID' },
  }
);

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

module.exports = Payment;
