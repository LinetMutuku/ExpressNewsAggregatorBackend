const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    url: { type: String, required: true, unique: true },
    imageUrl: String,
    source: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    category: { type: String, required: true },
    content: String,
    author: String,
    isSaved: { type: Boolean, default: false }
}, { timestamps: true });

// Create indexes for optimizing queries on category and publishedAt
articleSchema.index({ category: 1 });
articleSchema.index({ publishedAt: -1 });

// Create a weighted text index for more relevant search results
articleSchema.index(
    {
        title: 'text',
        description: 'text',
        content: 'text'
    },
    {
        weights: {
            title: 10,
            description: 5,
            content: 1
        },
        name: "TextSearchIndex"
    }
);

module.exports = mongoose.model('Article', articleSchema);