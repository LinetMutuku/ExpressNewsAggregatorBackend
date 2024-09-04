const axios = require('axios');
const Article = require('../models/Article');
const User = require('../models/User');
const NodeCache = require('node-cache');

const articleCache = new NodeCache({ stdTTL: 3600 }); // Cache articles for 1 hour
const recommendationCache = new NodeCache({ stdTTL: 300 }); // Cache recommendations for 5 minutes

async function fetchAndStoreArticles() {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            throw new Error('NEWS_API_KEY is not set in environment variables');
        }

        // Check if we've fetched articles recently
        const lastFetchTime = articleCache.get('lastFetchTime');
        if (lastFetchTime && Date.now() - lastFetchTime < 3600000) { // 1 hour
            console.log('Skipping API call, using cached articles');
            return;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

        const url = `https://newsapi.org/v2/everything?q=technology&from=${fromDate}&sortBy=publishedAt&apiKey=${apiKey}`;
        console.log('Fetching articles from:', url);

        const response = await axios.get(url);
        const articles = response.data.articles;

        if (!articles || articles.length === 0) {
            console.log('No articles fetched from the API');
            return;
        }

        const currentDate = new Date();
        const bulkOps = articles
            .filter(article => new Date(article.publishedAt) <= currentDate)
            .map(article => ({
                updateOne: {
                    filter: { url: article.url },
                    update: {
                        $set: {
                            title: article.title,
                            description: article.description,
                            url: article.url,
                            imageUrl: article.urlToImage,
                            source: article.source.name,
                            publishedAt: new Date(article.publishedAt),
                            category: determineCategorization(article.title, article.description)
                        }
                    },
                    upsert: true
                }
            }));

        if (bulkOps.length > 0) {
            const result = await Article.bulkWrite(bulkOps);
            console.log(`Upserted ${result.upsertedCount} articles, modified ${result.modifiedCount} articles`);
        }

        // Update cache
        articleCache.set('lastFetchTime', Date.now());
        recommendationCache.flushAll(); // Clear recommendation cache as we have new articles

    } catch (error) {
        console.error('Error fetching and storing articles:', error);
        if (error.response) {
            console.error('API response error:', error.response.data);
        }
    }
}

function determineCategorization(title, description) {
    const content = (title + ' ' + description).toLowerCase();
    if (content.includes('technology') || content.includes('tech')) return 'technology';
    if (content.includes('business') || content.includes('finance')) return 'business';
    if (content.includes('sports') || content.includes('game')) return 'sports';
    if (content.includes('health') || content.includes('medical')) return 'health';
    if (content.includes('science') || content.includes('research')) return 'science';
    if (content.includes('entertainment') || content.includes('celebrity')) return 'entertainment';
    return 'general';
}

async function getRecommendedArticles(userId, page = 1, limit = 20) {
    const cacheKey = `recommendations_${userId}_${page}_${limit}`;
    const cachedRecommendations = recommendationCache.get(cacheKey);
    if (cachedRecommendations) {
        return cachedRecommendations;
    }

    try {
        const user = await User.findById(userId).select('preferences readArticles');
        if (!user) {
            throw new Error('User not found');
        }

        const userPreferences = user.preferences?.categories || [];
        const readArticles = user.readArticles || [];

        let query = {
            _id: { $nin: readArticles }
        };

        if (userPreferences.length > 0) {
            query.category = { $in: userPreferences };
        }

        const recommendedArticles = await Article.find(query)
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const totalArticles = await Article.countDocuments(query);

        const result = {
            articles: recommendedArticles,
            currentPage: page,
            totalPages: Math.ceil(totalArticles / limit),
            totalArticles: totalArticles
        };

        recommendationCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

async function markArticleAsRead(userId, articleId) {
    try {
        const result = await User.updateOne(
            { _id: userId },
            { $addToSet: { readArticles: articleId } }
        );

        if (result.nModified === 0) {
            throw new Error('User not found or article already marked as read');
        }

        // Clear the recommendation cache for this user
        recommendationCache.del(new RegExp(`^recommendations_${userId}_`));

        return { message: 'Article marked as read' };
    } catch (error) {
        console.error('Error marking article as read:', error);
        throw error;
    }
}

module.exports = {
    fetchAndStoreArticles,
    getRecommendedArticles,
    markArticleAsRead
};