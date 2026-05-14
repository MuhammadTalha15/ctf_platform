const setNoCache = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

module.exports = {
  requireAuth: (req, res, next) => {
    setNoCache(res);
    if (!req.session.user) {
      return res.redirect('/login');
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    setNoCache(res);
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.redirect('/');
    }
    next();
  },
  forwardAuth: (req, res, next) => {
    setNoCache(res);
    if (req.session.user) {
      return res.redirect('/dashboard');
    }
    next();
  }
};
