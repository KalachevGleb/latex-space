const mongoose = require('../infrastructure/Mongoose')
const { Schema } = mongoose

const SystemSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  {
    collection: 'systemSettings',
    timestamps: true,
  }
)

exports.SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema)
exports.SystemSettingsSchema = SystemSettingsSchema

