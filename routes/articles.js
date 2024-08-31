const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const { getRecommendedArticles, markArticleAsRead } = require('../services/newsService');
const { authenticateUser } = require('../middleware/auth');

// Adding indexes to MongoDB schema
Article.createIndexes({ category: 1, publishedAt: -1 });

// Optimized query for getting articles
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 20));
        const category = req.query.category;
        const search = req.query.search;

        let query = {};
        if (category) {
            query.category = category;
        }
        if (search) {
            query.$text = { $search: search }; // Leverage MongoDB's text search
        }

        const articles = await Article.find(query)
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Article.countDocuments(query);

        res.json({
            articles,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalArticles: total
        });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Error fetching articles', error: error.message });
    }
});

// Get recommended articles
router.get('/recommended', authenticateUser, async (req, res) => {
    try {
        console.log('Authenticated user ID:', req.userId);
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 20));
        const recommendedArticles = await getRecommendedArticles(req.userId, page, limit);
        res.json(recommendedArticles);
    } catch (error) {
        console.error('Error in /recommended route:', error);
        if (error.message === 'User not found') {
            res.status(404).json({ message: 'User not found', error: error.message });
        } else {
            res.status(500).json({ message: 'Error fetching recommended articles', error: error.message });
        }
    }
});

// Getting a single article by ID
router.get('/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }
        res.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({ message: 'Error fetching article', error: error.message });
    }
});

// Mark an article as read
router.post('/:id/read', authenticateUser, async (req, res) => {
    try {
        await markArticleAsRead(req.userId, req.params.id);
        res.json({ message: 'Article marked as read' });
    } catch (error) {
        console.error('Error marking article as read:', error);
        if (error.message === 'User not found' || error.message === 'Article not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error marking article as read', error: error.message });
        }
    }
});

module.exports = router;
