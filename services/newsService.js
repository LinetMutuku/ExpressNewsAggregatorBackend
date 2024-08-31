const axios = require('axios');
const Article = require('../models/Article');
const User = require('../models/User');

async function fetchAndStoreArticles() {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            throw new Error('NEWS_API_KEY is not set in environment variables');
        }

        // Get the date for 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

        const url = `https://newsapi.org/v2/everything?q=technology&from=${fromDate}&sortBy=publishedAt&apiKey=${apiKey}`;

        console.log('Fetching articles from:', url);

        const response = await axios.get(url);
        console.log('API Response Status:', response.status);

        const articles = response.data.articles;

        if (!articles || articles.length === 0) {
            console.log('No articles fetched from the API');
            return;
        }

        console.log(`Fetched ${articles.length} articles from the API`);

        let storedCount = 0;
        const currentDate = new Date();

        for (let article of articles) {
            try {
                const publishedAt = new Date(article.publishedAt);
                if (publishedAt > currentDate) {
                    console.log(`Skipping article with future date: ${article.title}`);
                    continue;
                }

                await Article.findOneAndUpdate(
                    { url: article.url },
                    {
                        title: article.title,
                        description: article.description,
                        url: article.url,
                        imageUrl: article.urlToImage,
                        source: article.source.name,
                        publishedAt: publishedAt,
                        category: determineCategorization(article.title, article.description)
                    },
                    { upsert: true, new: true }
                );
                storedCount++;
            } catch (err) {
                console.error(`Error storing article: ${article.url}`, err);
            }
        }

        console.log(`Successfully stored ${storedCount} articles`);
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
    try {
        const user = await User.findById(userId);
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
            .limit(limit);

        return recommendedArticles;
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

async function markArticleAsRead(userId, articleId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.readArticles.includes(articleId)) {
            user.readArticles.push(articleId);
            await user.save();
        }

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