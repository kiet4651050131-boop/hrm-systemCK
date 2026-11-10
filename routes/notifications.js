const router = require('express').Router();
const { db } = require('../db');
const { auth } = require('../middleware');

router.use(auth);

router.get('/', (req, res) => {
  const notifications = db.prepare(`SELECT id, title, message, href, created_at, read_at
    FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(req.user.id).count;
  res.json({ notifications, unread });
});

router.put('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = datetime('now','localtime')
    WHERE user_id = ? AND read_at IS NULL`).run(req.user.id);
  res.json({ ok: true });
});

router.put('/:id/read', (req, res) => {
  const result = db.prepare(`UPDATE notifications SET read_at = datetime('now','localtime')
    WHERE id = ? AND user_id = ? AND read_at IS NULL`).run(req.params.id, req.user.id);
  if (!result.changes) {
    const exists = db.prepare('SELECT 1 FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy thông báo' });
  }
  res.json({ ok: true });
});

module.exports = router;
