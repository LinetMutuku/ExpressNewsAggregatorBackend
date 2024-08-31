const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    preferences: {
        categories: {
            type: [String],
            default: []
        },
        sources: {
            type: [String],
            default: []
        },
        darkMode: {
            type: Boolean,
            default: false
        },
        notifications: {
            type: Boolean,
            default: false
        }
    },
    savedArticles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article'
    }],
    readArticles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    }
}, { timestamps: true });

// Hash password before saving the user
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare provided password with the stored hash
UserSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Error comparing passwords');
    }
};

// Update last login date
UserSchema.methods.updateLastLogin = async function() {
    try {
        this.lastLogin = new Date();
        await this.save();
    } catch (error) {
        throw new Error('Error updating last login');
    }
};

module.exports = mongoose.model('User', UserSchema);
