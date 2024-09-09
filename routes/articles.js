const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const User = require('../models/User');
const { authenticateUser } = require('../middleware/auth');
const { getRecommendedArticles } = require('../services/RecommendedArticles');

// Get recommended articles
router.get('/recommended', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const cacheKey = `recommended:${userId}:${page}:${limit}`;

        // Try to get recommended articles from Redis
        let recommendedArticles = await req.redisClient.get(cacheKey);

        if (recommendedArticles) {
            return res.json(JSON.parse(recommendedArticles));
        }

        // If not in cache, get recommendations
        recommendedArticles = await getRecommendedArticles(userId, page, limit);

        // Store in Redis for future requests
        await req.redisClient.set(cacheKey, JSON.stringify(recommendedArticles), {
            EX: 1800 // Cache for 30 minutes
        });

        res.json(recommendedArticles);
    } catch (error) {
        console.error('Error in /recommended route:', error);
        res.status(500).json({ message: 'Error fetching recommended articles', error: error.message });
    }
});

// Search articles with caching
router.get('/search', async (req, res) => {
    try {
        const { query } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const cacheKey = `search:${query}:${page}:${limit}`;

        // Try to get search results from Redis
        let cachedResults = await req.redisClient.get(cacheKey);

        if (cachedResults) {
            return res.json(JSON.parse(cachedResults));
        }

        // If not in cache, perform search in database
        const results = await Article.find(
            { $text: { $search: query } },
            { score: { $meta: "textScore" } }
        )
            .sort({ score: { $meta: "textScore" } })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const totalResults = await Article.countDocuments({ $text: { $search: query } });

        const response = {
            results,
            currentPage: page,
            totalPages: Math.ceil(totalResults / limit),
            totalResults
        };

        // Store in Redis for future requests
        await req.redisClient.set(cacheKey, JSON.stringify(response), {
            EX: 900 // Cache for 15 minutes
        });

        res.json(response);
    } catch (error) {
        console.error('Error searching articles:', error);
        res.status(500).json({ message: 'Error searching articles', error: error.message });
    }
});

// Get all articles with caching
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const category = req.query.category;
        const cacheKey = `articles:${page}:${limit}:${category || 'all'}`;

        // Try to get articles from Redis
        let cachedArticles = await req.redisClient.get(cacheKey);

        if (cachedArticles) {
            return res.json(JSON.parse(cachedArticles));
        }

        // If not in cache, fetch from database
        let query = {};
        if (category) {
            query.category = category;
        }

        const articles = await Article.find(query)
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const totalArticles = await Article.countDocuments(query);

        const result = {
            articles,
            currentPage: page,
            totalPages: Math.ceil(totalArticles / limit),
            totalArticles
        };

        // Cache the result
        await req.redisClient.set(cacheKey, JSON.stringify(result), {
            EX: 300 // Cache for 5 minutes
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Error fetching articles', error: error.message });
    }
});

// Mark an article as read
router.post('/:id/read', authenticateUser, async (req, res) => {
    try {
        const articleId = req.params.id;
        const userId = req.userId;

        // Update user's read articles
        await User.findByIdAndUpdate(userId, { $addToSet: { readArticles: articleId } });

        // Invalidate the user's recommended articles cache
        const cachePattern = `recommended:${userId}:*`;
        const keys = await req.redisClient.keys(cachePattern);
        if (keys.length > 0) {
            await req.redisClient.del(keys);
        }

        res.json({ message: 'Article marked as read' });
    } catch (error) {
        console.error('Error marking article as read:', error);
        res.status(500).json({ message: 'Error marking article as read', error: error.message });
    }
});

// Get a single article by ID with caching
router.get('/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
        const cacheKey = `article:${articleId}`;

        // Try to get the article from Redis
        let article = await req.redisClient.get(cacheKey);

        if (article) {
            return res.json(JSON.parse(article));
        }

        // If not in cache, get from database
        article = await Article.findById(articleId).lean();

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        // Store in Redis for future requests
        await req.redisClient.set(cacheKey, JSON.stringify(article), {
            EX: 3600 // Cache for 1 hour
        });

        res.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({ message: 'Error fetching article', error: error.message });
    }
});

module.exports = router;