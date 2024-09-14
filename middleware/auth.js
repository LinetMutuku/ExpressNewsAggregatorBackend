const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { promisify } = require('util');

exports.authenticateUser = async (req, res, next) => {
    console.log('Authenticating user...');
    const token = req.header('Authorization')?.replace('Bearer ', '');
    console.log('Received token:', token);

    if (!token) {
        console.log('No token provided');
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        console.log('Verifying token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded);

        const cacheKey = `user:${decoded.user.id}`;
        let user = await promisify(req.redisClient.get).bind(req.redisClient)(cacheKey);

        if (!user) {
            console.log('User not in cache, fetching from database...');
            user = await User.findById(decoded.user.id).select('-password').lean();
            if (!user) {
                console.log('User not found in database');
                return res.status(401).json({ message: 'User not found' });
            }
            console.log('Caching user');
            await promisify(req.redisClient.setex).bind(req.redisClient)(cacheKey, 300, JSON.stringify(user));
        } else {
            console.log('User found in cache');
            user = JSON.parse(user);
        }

        req.user = user;
        req.userId = user._id;
        console.log('Authentication successful for user:', req.userId);
        next();
    } catch (err) {
        console.error('Authentication error:', err);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired' });
        }
        res.status(401).json({ message: 'Token is not valid', error: err.message });
    }
};