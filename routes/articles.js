const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const User = require('../models/User');
const { authenticateUser } = require('../middleware/auth');
const { getRecommendedArticles } = require('../services/RecommendedArticles');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL);

// Get recommended articles
router.get('/recommended', authenticateUser, async (req, res) => {
    console.log('Fetching recommended articles for user:', req.userId);
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const cacheKey = `recommended:${req.userId}:${page}:${limit}`;

        const cachedArticles = await redisClient.get(cacheKey);
        if (cachedArticles) {
            console.log('Recommended articles found in cache');
            return res.json(JSON.parse(cachedArticles));
        }

        console.log('Cache miss, fetching recommendations from service');
        const recommendedArticles = await getRecommendedArticles(req.userId, page, limit);

        await redisClient.set(cacheKey, JSON.stringify(recommendedArticles), 'EX', 1800); // Cache for 30 minutes

        console.log('Sending recommendations to client');
        res.json(recommendedArticles);
    } catch (error) {
        console.error('Error in /recommended route:', error);
        res.status(500).json({ message: 'Error fetching recommended articles', error: error.message });
    }
});

// Search articles
router.get('/search', authenticateUser, async (req, res) => {
    console.log('Searching articles');
    try {
        const { query } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const cacheKey = `search:${query}:${page}:${limit}`;

        const cachedResults = await redisClient.get(cacheKey);
        if (cachedResults) {
            console.log('Search results found in cache');
            return res.json(JSON.parse(cachedResults));
        }

        console.log('Cache miss, performing database search');
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
            articles: results,
            currentPage: page,
            totalPages: Math.ceil(totalResults / limit),
            totalResults
        };

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 900); // Cache for 15 minutes

        console.log('Sending search results to client');
        res.json(response);
    } catch (error) {
        console.error('Error searching articles:', error);
        res.status(500).json({ message: 'Error searching articles', error: error.message });
    }
});

// Get all articles
router.get('/', authenticateUser, async (req, res) => {
    console.log('Fetching all articles');
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const category = req.query.category;
        const cacheKey = `articles:${page}:${limit}:${category || 'all'}`;

        const cachedArticles = await redisClient.get(cacheKey);
        if (cachedArticles) {
            console.log('Articles found in cache');
            return res.json(JSON.parse(cachedArticles));
        }

        console.log('Cache miss, fetching articles from database');
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

        await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300); // Cache for 5 minutes

        console.log('Sending articles to client');
        res.json(result);
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Error fetching articles', error: error.message });
    }
});

// Mark an article as read
router.post('/:id/read', authenticateUser, async (req, res) => {
    console.log('Marking article as read');
    try {
        const articleId = req.params.id;
        const userId = req.userId;

        await User.findByIdAndUpdate(userId, { $addToSet: { readArticles: articleId } });

        // Invalidate the user's recommended articles cache
        const cachePattern = `recommended:${userId}:*`;
        const keys = await redisClient.keys(cachePattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }

        console.log('Article marked as read successfully');
        res.json({ message: 'Article marked as read' });
    } catch (error) {
        console.error('Error marking article as read:', error);
        res.status(500).json({ message: 'Error marking article as read', error: error.message });
    }
});

// Get a single article by ID
router.get('/:id', authenticateUser, async (req, res) => {
    console.log('Fetching single article');
    try {
        const articleId = req.params.id;
        const cacheKey = `article:${articleId}`;

        const cachedArticle = await redisClient.get(cacheKey);
        if (cachedArticle) {
            console.log('Article found in cache');
            return res.json(JSON.parse(cachedArticle));
        }

        console.log('Cache miss, fetching article from database');
        const article = await Article.findById(articleId).lean();

        if (!article) {
            console.log('Article not found');
            return res.status(404).json({ message: 'Article not found' });
        }

        await redisClient.set(cacheKey, JSON.stringify(article), 'EX', 3600); // Cache for 1 hour

        console.log('Sending article to client');
        res.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({ message: 'Error fetching article', error: error.message });
    }
});

// Save an article
router.post('/save', authenticateUser, async (req, res) => {
    console.log('Saving article');
    try {
        const userId = req.userId;
        const { articleId } = req.body;

        await User.findByIdAndUpdate(userId, { $addToSet: { savedArticles: articleId } });

        console.log('Article saved successfully');
        res.json({ message: 'Article saved successfully' });
    } catch (error) {
        console.error('Error saving article:', error);
        res.status(500).json({ message: 'Error saving article', error: error.message });
    }
});

// Unsave an article
router.post('/unsave', authenticateUser, async (req, res) => {
    console.log('Unsaving article');
    try {
        const userId = req.userId;
        const { articleId } = req.body;

        await User.findByIdAndUpdate(userId, { $pull: { savedArticles: articleId } });

        console.log('Article unsaved successfully');
        res.json({ message: 'Article unsaved successfully' });
    } catch (error) {
        console.error('Error unsaving article:', error);
        res.status(500).json({ message: 'Error unsaving article', error: error.message });
    }
});

// Get saved articles
router.get('/saved', authenticateUser, async (req, res) => {
    console.log('Fetching saved articles');
    try {
        const userId = req.userId;
        const user = await User.findById(userId).populate('savedArticles').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('Sending saved articles to client');
        res.json(user.savedArticles);
    } catch (error) {
        console.error('Error fetching saved articles:', error);
        res.status(500).json({ message: 'Error fetching saved articles', error: error.message });
    }
});

module.exports = router;