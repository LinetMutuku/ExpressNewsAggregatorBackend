const Article = require('../models/Article');
const User = require('../models/User');
const mongoose = require('mongoose');

async function getRecommendedArticles(userId, page = 1, limit = 20) {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid userId format');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Ensure preferences and readArticles are arrays
        const userPreferences = Array.isArray(user.preferences.categories) ? user.preferences.categories : [];
        const readArticles = Array.isArray(user.readArticles) ? user.readArticles : [];

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Find articles matching user preferences and excluding read articles
        const recommendedArticles = await Article.aggregate([
            {
                $match: {
                    $and: [
                        { _id: { $nin: readArticles } },
                        {
                            $or: [
                                { category: { $in: userPreferences } },
                                { category: { $exists: true } } // Fallback to include all categories if no preferences
                            ]
                        }
                    ]
                }
            },
            {
                $addFields: {
                    score: {
                        $cond: [
                            { $in: ['$category', userPreferences] },
                            2,  // Higher score for preferred categories
                            1   // Lower score for other categories
                        ]
                    }
                }
            },
            { $sort: { score: -1, publishedAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalRecommendations = await Article.countDocuments({
            _id: { $nin: readArticles },
            $or: [
                { category: { $in: userPreferences } },
                { category: { $exists: true } }
            ]
        });

        return {
            recommendations: recommendedArticles,
            currentPage: page,
            totalPages: Math.ceil(totalRecommendations / limit),
            totalRecommendations
        };
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

module.exports = { getRecommendedArticles };