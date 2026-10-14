/* auth.js — local accounts. Passwords are hashed with scrypt + per-user salt; never stored in clear. */
'use strict';
const crypto = require('crypto');
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hash = (password, salt) => crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64, PARAMS).toString('hex');
const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;

function publicUser(u) { return u && { id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at, lastLogin: u.last_login }; }

module.exports = function auth(db) {
  return {
    register({ username, displayName, password }) {
      username = String(username || '').trim();
      displayName = String(displayName || '').trim() || username;
      if (!USERNAME.test(username)) throw new Error('Username: 3–32 characters, letters, digits, . _ -');
      if (String(password || '').length < 6) throw new Error('Password must have at least 6 characters');
      if (displayName.length > 80) throw new Error('Name is too long');
      if (db.get('SELECT id FROM users WHERE username=?', [username])) throw new Error('This username is already taken');
      const salt = crypto.randomBytes(16).toString('hex'), now = new Date().toISOString();
      db.run('INSERT INTO users(username,display_name,pass_hash,pass_salt,created_at,last_login) VALUES(?,?,?,?,?,?)',
        [username, displayName, hash(password, salt), salt, now, now]);
      return publicUser(db.get('SELECT * FROM users WHERE username=?', [username]));
    },
    login({ username, password }) {
      const u = db.get('SELECT * FROM users WHERE username=?', [String(username || '').trim()]);
      const fail = () => { throw new Error('Wrong username or password'); };
      if (!u) { hash(String(password || 'x'), '00'); fail(); }   // same timing for unknown users
      const a = Buffer.from(hash(String(password || ''), u.pass_salt), 'hex'), b = Buffer.from(u.pass_hash, 'hex');
      if (!crypto.timingSafeEqual(a, b)) fail();
      db.run('UPDATE users SET last_login=? WHERE id=?', [new Date().toISOString(), u.id]);
      return publicUser(u);
    },
    exists(username) { return !!db.get('SELECT id FROM users WHERE username=?', [String(username || '').trim()]); },
    changePassword(userId, { oldPassword, newPassword }) {
      const u = db.get('SELECT * FROM users WHERE id=?', [userId]);
      if (!u || hash(String(oldPassword || ''), u.pass_salt) !== u.pass_hash) throw new Error('Current password is wrong');
      if (String(newPassword || '').length < 6) throw new Error('New password must have at least 6 characters');
      const salt = crypto.randomBytes(16).toString('hex');
      db.run('UPDATE users SET pass_hash=?, pass_salt=? WHERE id=?', [hash(newPassword, salt), salt, userId]);
    },
    updateName(userId, displayName) {
      displayName = String(displayName || '').trim();
      if (!displayName || displayName.length > 80) throw new Error('Enter a name (max 80 characters)');
      db.run('UPDATE users SET display_name=? WHERE id=?', [displayName, userId]);
      return publicUser(db.get('SELECT * FROM users WHERE id=?', [userId]));
    },
    publicUser
  };
};
