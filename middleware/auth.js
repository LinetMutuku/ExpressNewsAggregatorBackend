const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL);

exports.authenticateUser = async (req, res, next) => {
    console.log('Authenticating user...');
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        console.log('No token provided');
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const cachedUser = await redisClient.get(`auth:${token}`);
        if (cachedUser) {
            req.user = JSON.parse(cachedUser);
            req.userId = req.user._id;
            console.log('User found in cache:', req.userId);
            return next();
        }

        console.log('Verifying token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded);

        const user = await User.findById(decoded.user.id).select('-password').lean();
        if (!user) {
            console.log('User not found in database');
            return res.status(401).json({ message: 'User not found' });
        }

        await redisClient.set(`auth:${token}`, JSON.stringify(user), 'EX', 3600); // Cache for 1 hour

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