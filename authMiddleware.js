const jwt = require('jsonwebtoken'); // Assuming you're using JWT for authentication

const authMiddleware = (req, res, next) => {
    // Get the token from the request headers
    // console.log(process.env.JWT_SECRET);
    // console.log("authMiddleware");
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach the decoded user information to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

module.exports = authMiddleware;
