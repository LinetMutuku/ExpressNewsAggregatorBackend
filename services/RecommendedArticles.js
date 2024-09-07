const Article = require('../models/Article');
const User = require('../models/User');
const mongoose = require('mongoose');

const CACHE_DURATION = 3600; // Cache for 1 hour

async function getRecommendedArticles(req, userId, page = 1, limit = 20) {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid userId format');
        }

        const cacheKey = `recommended_articles:${userId}:${page}:${limit}`;

        // Check cache first
        const cachedData = await req.getAsync(cacheKey);
        if (cachedData) {
            console.log('Cache hit for recommended articles');
            return JSON.parse(cachedData);
        }

        console.log('Cache miss for recommended articles, fetching from DB');

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get user's reading history
        const readArticles = await Article.find({ _id: { $in: user.readArticles || [] } });

        // Extract keywords from read articles
        const keywords = readArticles.reduce((acc, article) => {
            const words = (article.title || '').toLowerCase().split(/\W+/);
            words.forEach(word => {
                if (word.length > 3) {
                    acc[word] = (acc[word] || 0) + 1;
                }
            });
            return acc;
        }, {});

        // Sort keywords by frequency and get top 10
        const sortedKeywords = Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Find articles matching user preferences and keywords
        const recommendedArticles = await Article.aggregate([
            {
                $match: {
                    $or: [
                        { category: { $in: user.preferences || [] } },
                        { title: { $regex: sortedKeywords.join('|'), $options: 'i' } }
                    ]
                }
            },
            {
                $addFields: {
                    score: {
                        $add: [
                            { $cond: [{ $in: ['$category', user.preferences || []] }, 2, 0] },
                            {
                                $size: {
                                    $setIntersection: [
                                        sortedKeywords,
                                        { $split: [{ $toLower: '$title' }, ' '] }
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            { $sort: { score: -1, publishedAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        // Set cache
        await req.setexAsync(cacheKey, CACHE_DURATION, JSON.stringify(recommendedArticles));

        return recommendedArticles;
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

module.exports = { getRecommendedArticles };