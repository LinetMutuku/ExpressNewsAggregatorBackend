const jwt = require('jsonwebtoken');
const User = require('../models/User');
const NodeCache = require('node-cache');

const userCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

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

        let user = userCache.get(decoded.user.id);
        if (!user) {
            console.log('User not in cache, fetching from database...');
            user = await User.findById(decoded.user.id).select('-password').lean();
            if (!user) {
                console.log('User not found in database');
                return res.status(401).json({ message: 'User not found' });
            }
            console.log('Caching user');
            userCache.set(decoded.user.id, user);
        } else {
            console.log('User found in cache');
        }

        req.user = user;
        req.userId = user._id;
        console.log('Authentication successful for user:', req.userId);
        next();
    } catch (err) {
        console.error('Authentication error:', err);
        res.status(401).json({ message: 'Token is not valid', error: err.message });
    }
};