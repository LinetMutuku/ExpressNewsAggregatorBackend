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


articleSchema.index({ category: 1 });
articleSchema.index({ publishedAt: -1 });


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

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;