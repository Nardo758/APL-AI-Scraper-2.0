const express = require('express');
const router = express.Router();

// Note: route handlers expect req.services.auth to be available via middleware

router.post('/register', async (req, res) => {
  try {
    const { email, password, userData } = req.body;
    const result = await req.services.auth.registerUser({ email, password, userData }, req.ip, req.get('User-Agent'));

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await req.services.auth.loginUser(email, password, req.ip, req.get('User-Agent'));

    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await req.services.auth.refreshToken(refreshToken);

    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await req.services.auth.logoutUser(req.user?.userId);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;