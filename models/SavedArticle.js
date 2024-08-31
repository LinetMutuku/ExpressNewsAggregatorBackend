const mongoose = require('mongoose');

const savedArticleSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    articleId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    imageUrl: {
        type: String,
        default: 'https://via.placeholder.com/300x200?text=No+Image'
    },
    publishedAt: {
        type: Date,
        default: Date.now
    },
    source: {
        type: String,
        default: 'Unknown'
    },
    category: {
        type: String,
        default: 'Uncategorized'
    },
    url: {
        type: String,
        default: ''
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound index to ensure a user can't save the same article twice
savedArticleSchema.index({ user: 1, articleId: 1 }, { unique: true });

// Index for faster queries by category
savedArticleSchema.index({ user: 1, category: 1 });

// Virtual for time since saved
savedArticleSchema.virtual('timeSinceSaved').get(function() {
    return new Date() - this.createdAt;
});

// Static method to find saved articles by user
savedArticleSchema.statics.findByUser = function(userId) {
    return this.find({ user: userId }).sort('-createdAt');
};

// Instance method to check if the article is older than a certain time
savedArticleSchema.methods.isOlderThan = function(days) {
    const timeThreshold = new Date();
    timeThreshold.setDate(timeThreshold.getDate() - days);
    return this.createdAt < timeThreshold;
};

module.exports = mongoose.model('SavedArticle', savedArticleSchema);