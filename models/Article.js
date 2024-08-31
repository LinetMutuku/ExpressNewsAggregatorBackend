const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    url: { type: String, required: true, unique: true },
    imageUrl: String,
    source: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    category: { type: String, required: true }
}, { timestamps: true });

// Create indexes for optimizing queries on category and publishedAt
articleSchema.index({ category: 1 });
articleSchema.index({ publishedAt: -1 });
articleSchema.index({ title: 'text', description: 'text' }); // Full-text search index

module.exports = mongoose.model('Article', articleSchema);
