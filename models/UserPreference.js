const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    darkMode: {
        type: Boolean,
        default: false
    },
    notifications: {
        push: {
            enabled: { type: Boolean, default: false },
            subscription: { type: Object }  // For web push subscription
        },
        sms: {
            enabled: { type: Boolean, default: false },
            phone: { type: String }
        },
        email: {
            digest: { type: Boolean, default: false },
            frequency: {
                type: String,
                enum: ['daily', 'weekly', 'monthly'],
                default: 'weekly'
            }
        }
    },
    categories: [{
        type: String
    }],
    sources: [{
        type: String
    }],
    emailDigest: {
        type: Boolean,
        default: false
    },
    autoSave: {
        type: Boolean,
        default: true
    },
    privacyMode: {
        enabled: { type: Boolean, default: false },
        dataCollection: { type: Boolean, default: true }
    },
    twoFactorAuth: {
        enabled: { type: Boolean, default: false },
        method: {
            type: String,
            enum: ['email', 'sms'],
            default: 'email'
        },
        phone: String,
        tempCode: String  // Temporary storage for verification code
    }
}, {
    timestamps: true
});

// Clean up temporary 2FA codes after 10 minutes
userPreferenceSchema.index({ "twoFactorAuth.tempCode": 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('UserPreference', userPreferenceSchema);