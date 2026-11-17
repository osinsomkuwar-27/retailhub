const mongoose = require('mongoose');
// Stores Change Stream resume tokens so no events are lost across restarts.
const schema = new mongoose.Schema(
  { _id: { type: String }, token: mongoose.Schema.Types.Mixed },
  { timestamps: true, collection: 'intelligence_stream_checkpoints' }
);
module.exports = mongoose.models.StreamCheckpoint || mongoose.model('StreamCheckpoint', schema);