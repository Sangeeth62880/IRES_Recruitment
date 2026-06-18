const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;

    // Periodically clean up expired sessions (every 6 hours)
    const interval = setInterval(() => {
      try {
        this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
      } catch (err) {
        console.error('Session cleanup error:', err);
      }
    }, 6 * 60 * 60 * 1000);

    // Allow node process to exit even if interval is still active
    if (interval.unref) {
      interval.unref();
    }
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
      if (!row) {
        return cb(null, null);
      }
      if (Date.now() > row.expired) {
        this.destroy(sid, cb);
        return;
      }
      return cb(null, JSON.parse(row.sess));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie && typeof sess.cookie.maxAge === 'number'
        ? sess.cookie.maxAge
        : 4 * 60 * 60 * 1000; // default 4 hours
      const expired = Date.now() + maxAge;

      this.db.prepare(`
        INSERT INTO sessions (sid, expired, sess)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET expired = excluded.expired, sess = excluded.sess
      `).run(sid, expired, JSON.stringify(sess));
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const maxAge = sess.cookie && typeof sess.cookie.maxAge === 'number'
        ? sess.cookie.maxAge
        : 4 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;

      this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expired, sid);
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
