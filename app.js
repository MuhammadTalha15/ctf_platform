require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const SESSION_SECRET = process.env.SESSION_SECRET;

console.log(SESSION_SECRET);

if (!SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required. Set a strong random secret.');
  if (NODE_ENV === 'production') {
    console.error('Exiting: running in production without SESSION_SECRET is a security risk.');
    process.exit(1);
  }
  console.warn('WARNING: Using auto-generated ephemeral secret. Sessions will be invalidated on restart. Set SESSION_SECRET for production.');
}

const appSecret = SESSION_SECRET || crypto.randomBytes(64).toString('hex');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
app.use(helmet.noSniff());
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(session({
  secret: appSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/login', authLimiter);
app.use('/register', authLimiter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/challenges/', apiLimiter);

const apiAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiAuthLimiter);

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/admin/', adminLimiter);

const readJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
  } catch { return []; }
};
const writeJSON = (file, data) => {
  fs.writeFileSync(path.join(__dirname, 'data', file), JSON.stringify(data, null, 2));
};

const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, '').trim();
};

const sanitizeUrl = (str) => {
  if (typeof str !== 'string') return '';
  str = str.trim();
  try {
    const url = new URL(str);
    return ['http:', 'https:'].includes(url.protocol) ? str : '';
  } catch {
    return '';
  }
};

const validateUrl = (str) => {
  if (typeof str !== 'string' || !str) return '';
  str = str.trim();
  try {
    const url = new URL(str);
    return ['http:', 'https:'].includes(url.protocol) ? str : '';
  } catch {
    return '';
  }
};

app.use((req, res, next) => {
  req.readJSON = readJSON;
  req.writeJSON = writeJSON;
  req.sanitize = sanitize;
  req.sanitizeUrl = sanitizeUrl;
  req.validateUrl = validateUrl;
  next();
});

app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  if (req.session.user) {
    try {
      const users = readJSON('users.json');
      const challenges = readJSON('challenges.json');
      res.locals.stats = { totalChallenges: challenges.length, totalUsers: users.filter(u => u.role === 'user').length };
    } catch {}
  }
  next();
});

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const users = readJSON('users.json');
  const challenges = readJSON('challenges.json');
  const categories = [...new Set(challenges.map(c => c.category))];
  const difficulties = [...new Set(challenges.map(c => c.difficulty))];
  res.render('index', {
    user: req.session.user || null, currentPage: 'home',
    stats: { totalChallenges: challenges.length, totalUsers: users.filter(u => u.role === 'user').length },
    totalCategories: categories.length, totalDifficulties: difficulties.length
  });
});

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const challengeRoutes = require('./routes/challenges');
const adminRoutes = require('./routes/admin');
const { CLIENT_RENEG_LIMIT } = require('tls');
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', challengeRoutes);
app.use('/admin', adminRoutes);

app.get('/api/auth-check', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ authenticated: !!req.session.user, user: req.session.user ? { id: req.session.user.id, username: req.session.user.username } : null });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(500).render('error', { error: 'Internal server error', user: req.session?.user || null, currentPage: '' });
});

app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(404).render('error', { error: 'Page not found', user: req.session.user || null, currentPage: '' });
});

async function seedData() {
  const users = readJSON('users.json');
  if (users.length === 0) {
    const hashed = await bcrypt.hash('admin123', 10);
    users.push({
      id: uuidv4(), username: 'admin', email: 'admin@ctfplatform.com',
      password: hashed, role: 'admin', points: 0, solvedChallenges: [],
      createdAt: new Date().toISOString(),
      github: '', twitter: '', linkedin: '', website: '', notifications: []
    });
    const hashed2 = await bcrypt.hash('user123', 10);
    users.push({
      id: uuidv4(), username: 'hacker1', email: 'hacker1@test.com',
      password: hashed2, role: 'user', points: 0, solvedChallenges: [],
      createdAt: new Date().toISOString(),
      github: '', twitter: '', linkedin: '', website: '', notifications: []
    });
    writeJSON('users.json', users);
    console.log('Seed users created (admin/admin123, hacker1/user123)');
  }

  const challenges = readJSON('challenges.json');
  if (challenges.length === 0) {
    const seedChallenges = [
      { id: uuidv4(), title: 'SQL Injection 101', description: 'A basic login form is vulnerable to SQL injection. Can you bypass the authentication?\n\nThe login page accepts username and password. Try to think like an attacker.', category: 'Web', difficulty: 'easy', points: 100, flag: 'CTF{sql_1nj3ct10n_b4s1cs}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Caesar\'s Revenge', description: 'Decrypt the following ciphertext: "Fdhvduflvhdvblqwkhiluvw". The key is 3. This is a classic substitution cipher.', category: 'Crypto', difficulty: 'easy', points: 150, flag: 'CTF{caesaris_easy_inthe_first}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Hidden in Plain Sight', description: 'Download the image and look closely. Sometimes the answer is hiding in the metadata or encoded in the pixels.\nExtract the hidden message from the provided file.', category: 'Forensics', difficulty: 'medium', points: 200, flag: 'CTF{st3g0n0graphy_1s_c00l}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Buffer Overflow Basics', description: 'A simple C program has a buffer overflow vulnerability. Read the source code and exploit it to print the flag.\nThe program reads 200 bytes into a 64-byte buffer.', category: 'Pwn', difficulty: 'hard', points: 350, flag: 'CTF{b0f_m4st3r_2024}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'XSS Reflected', description: 'A search page reflects user input without sanitization. Craft a payload that triggers a JavaScript alert.\nProve the vulnerability exists.', category: 'Web', difficulty: 'medium', points: 200, flag: 'CTF{xss_reflect3d_2024}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Reverse the Binary', description: 'A stripped binary needs to be reverse engineered. Find the correct password that makes the program print the flag.\nUse a disassembler to analyze the executable.', category: 'Reverse', difficulty: 'hard', points: 400, flag: 'CTF{r3v3rs3_3ng1n33r1ng}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'RSA Oracle', description: 'An RSA encryption oracle gives you the encrypted flag. The public key is (n=3233, e=17). Find the private key and decrypt the message.\nHint: n is very small for this challenge.', category: 'Crypto', difficulty: 'medium', points: 250, flag: 'CTF{rsa_brut3f0rc3}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Command Injection', description: 'A web application pings an IP address you provide. It doesn\'t sanitize the input properly. Can you execute arbitrary commands?\nTry to read /etc/passwd or list the directory.', category: 'Web', difficulty: 'medium', points: 250, flag: 'CTF{cmd_1nj3ct10n_2024}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Packet Detective', description: 'A pcap file is provided containing network traffic. Find the flag hidden in the packets.\nLook for unusual data in the TCP streams.', category: 'Forensics', difficulty: 'medium', points: 200, flag: 'CTF{p4ck3t_sn1ff3r}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Hash Collision', description: 'Find two different inputs that produce the same MD5 hash starting with "0e". This is a PHP type juggling vulnerability.\nThe provided code uses loose comparison (==).', category: 'Web', difficulty: 'hard', points: 350, flag: 'CTF{php_typ3_juggling}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Binary Exploitation 101', description: 'A simple format string vulnerability exists in the binary. Use %x and %n to read and write memory.\nLeak the stack cookie and bypass NX protection.', category: 'Pwn', difficulty: 'insane', points: 500, flag: 'CTF{f0rm4t_str1ng_m4st3r}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() },
      { id: uuidv4(), title: 'Morse Code Madness', description: 'Decode the following Morse code: "-.-. - ..-. -- ----- .-. ... ...--"', category: 'Misc', difficulty: 'easy', points: 50, flag: 'CTF{m0rs3_c0d3}', flagHint: 'CTF{...}', author: 'admin', enabled: true, solves: 0, createdAt: new Date().toISOString() }
    ];
    writeJSON('challenges.json', seedChallenges);
    console.log('Seed challenges created (12 challenges)');
  }
}

// seedData().then(() => {
//   app.listen(PORT, "0.0.0.0", () => {
//     console.log(`🚀 CTF Platform running`);
//     console.log(`🌐 Local:   http://localhost:${PORT}`);
//     console.log(`🌍 Network: http://<YOUR_KALI_IP>:${PORT}`);
//     console.log(`👤 Admin login: admin / admin123`);
//     console.log(`👤 User login: hacker1 / user123`);
//   });
// });


module.exports = { app, seedData };