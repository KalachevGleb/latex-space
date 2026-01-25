const mongoose = require('../infrastructure/Mongoose')

const { Schema } = mongoose

const GroupPolicySchema = new Schema(
  {
    // User can't delete their own account
    userCannotDeleteOwnAccount: Boolean,

    // User can't add a secondary email address
    userCannotHaveSecondaryEmail: Boolean,

    // User can't use any of our AI features, such as the compile-assistant
    userCannotUseAIFeatures: Boolean,

    // User can't use the chat feature
    userCannotUseChat: Boolean,

    // User can't use the Dropbox feature
    userCannotUseDropbox: Boolean,
  },
  { minimize: false }
)

exports.GroupPolicy = mongoose.model('GroupPolicy', GroupPolicySchema)
exports.GroupPolicySchema = GroupPolicySchema
