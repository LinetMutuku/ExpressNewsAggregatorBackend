const jwt = require('jsonwebtoken');
const User = require('../models/User');
const NodeCache = require('node-cache');

const userCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

exports.authenticateUser = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        let user = userCache.get(decoded.user.id);
        if (!user) {
            user = await User.findById(decoded.user.id).select('-password').lean();
            if (!user) {
                return res.status(401).json({ message: 'User not found' });
            }
            userCache.set(decoded.user.id, user);
        }

        req.user = user;
        req.userId = user._id;
        next();
    } catch (err) {
        console.error('Authentication error:', err);
        res.status(401).json({ message: 'Token is not valid' });
    }
};