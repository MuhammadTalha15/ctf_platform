const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

const usersPath = path.join(dataDir, 'users.json');
const subsPath = path.join(dataDir, 'submissions.json');
const challsPath = path.join(dataDir, 'challenges.json');

const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const challenges = JSON.parse(fs.readFileSync(challsPath, 'utf8'));

users.forEach(u => {
  if (u.role !== 'admin') {
    u.points = 0;
    u.solvedChallenges = [];
    u.notifications = [];
    u.notifUnread = 0;
  }
});

challenges.forEach(c => {
  c.solves = 0;
});

fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
fs.writeFileSync(subsPath, JSON.stringify([], null, 2), 'utf8');
fs.writeFileSync(challsPath, JSON.stringify(challenges, null, 2), 'utf8');

console.log('All users reset — points=0, solvedChallenges=[], notifications cleared');
console.log('Submissions emptied');
console.log('Challenge solves set to 0');
