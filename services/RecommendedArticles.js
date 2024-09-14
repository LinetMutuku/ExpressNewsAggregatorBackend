const Article = require('../models/Article');
const User = require('../models/User');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL);

async function getRecommendedArticles(userId, page = 1, limit = 20) {
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            throw new Error('User not found');
        }

        const userPreferences = user.preferences?.categories || [];
        const readArticles = user.readArticles || [];

        const cacheKey = `user:${userId}:recommendations:${page}:${limit}`;
        const cachedRecommendations = await redisClient.get(cacheKey);

        if (cachedRecommendations) {
            return JSON.parse(cachedRecommendations);
        }

        const skip = (page - 1) * limit;

        const recommendedArticles = await Article.find({
            _id: { $nin: readArticles },
            category: { $in: userPreferences.length > 0 ? userPreferences : { $exists: true } }
        })
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalRecommendations = await Article.countDocuments({
            _id: { $nin: readArticles },
            category: { $in: userPreferences.length > 0 ? userPreferences : { $exists: true } }
        });

        const result = {
            recommendations: recommendedArticles,
            currentPage: page,
            totalPages: Math.ceil(totalRecommendations / limit),
            totalRecommendations
        };

        await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 1800); // Cache for 30 minutes

        return result;
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

module.exports = { getRecommendedArticles };