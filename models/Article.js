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

module.exports = mongoose.model('Article', articleSchema);