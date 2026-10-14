/* mine.js — each user's own packages ("My packages" in the Library) and the user's groups of packages (app 1.5.0).
   Installed packages are shared by everyone on the computer (Library → Explore); a user adds the ones they
   want to My packages and can sort them into any number of groups (a package may be in several groups). */
'use strict';

module.exports = function mine({ db, lib }) {
  const now = () => new Date().toISOString();
  function add(userId, packId) {
    if (!lib.manifestOf(packId)) throw new Error('Package not installed: ' + packId);
    db.run('INSERT OR IGNORE INTO user_packs(user_id, pack_id, added_at) VALUES(?,?,?)', [userId, packId, now()]);
    return true;
  }
  function own(userId, groupId) {
    const g = db.get('SELECT id FROM pack_groups WHERE id=? AND user_id=?', [groupId, userId]);
    if (!g) throw new Error('Group not found');
    return g;
  }
  return {
    add,
    remove(userId, packId) {
      db.run('DELETE FROM user_packs WHERE user_id=? AND pack_id=?', [userId, packId]);
      db.run('DELETE FROM pack_group_items WHERE pack_id=? AND group_id IN (SELECT id FROM pack_groups WHERE user_id=?)', [packId, userId]);
      return true;
    },
    ids(userId) { const m = {}; db.all('SELECT pack_id, added_at FROM user_packs WHERE user_id=?', [userId]).forEach(r => { m[r.pack_id] = r.added_at; }); return m; },
    groups(userId) {
      const items = {};
      db.all('SELECT gi.group_id, gi.pack_id FROM pack_group_items gi JOIN pack_groups g ON g.id = gi.group_id WHERE g.user_id=? ORDER BY gi.position, gi.pack_id', [userId])
        .forEach(r => { (items[r.group_id] = items[r.group_id] || []).push(r.pack_id); });
      return db.all('SELECT id, name, description, created_at, updated_at FROM pack_groups WHERE user_id=? ORDER BY name COLLATE NOCASE', [userId])
        .map(g => ({ id: g.id, name: g.name, description: g.description, createdAt: g.created_at, updatedAt: g.updated_at, packs: (items[g.id] || []).filter(id => lib.manifestOf(id)) }));
    },
    /* create (no id) or update a group; packages in it are added to My packages */
    saveGroup(userId, o) {
      const name = String(o && o.name || '').trim();
      if (!name) throw new Error('Give the group a name');
      if (name.length > 80) throw new Error('The name is too long (max 80 characters)');
      const desc = String(o.description || '').trim().slice(0, 500);
      const dup = db.get('SELECT id FROM pack_groups WHERE user_id=? AND name=? COLLATE NOCASE' + (o.id ? ' AND id<>?' : ''), o.id ? [userId, name, o.id] : [userId, name]);
      if (dup) throw new Error('You already have a group called "' + name + '"');
      let id = o.id;
      if (id) { own(userId, id); db.run('UPDATE pack_groups SET name=?, description=?, updated_at=? WHERE id=?', [name, desc, now(), id]); }
      else {
        db.run('INSERT INTO pack_groups(user_id, name, description, created_at, updated_at) VALUES(?,?,?,?,?)', [userId, name, desc, now(), now()]);
        id = db.get('SELECT last_insert_rowid() AS id').id;
      }
      if (Array.isArray(o.packs)) {
        db.run('DELETE FROM pack_group_items WHERE group_id=?', [id]);
        o.packs.filter(p => lib.manifestOf(p)).forEach((p, i) => { add(userId, p); db.run('INSERT OR IGNORE INTO pack_group_items(group_id, pack_id, position) VALUES(?,?,?)', [id, p, i]); });
      }
      return id;
    },
    deleteGroup(userId, id) { own(userId, id); db.run('DELETE FROM pack_group_items WHERE group_id=?', [id]); db.run('DELETE FROM pack_groups WHERE id=?', [id]); return true; },
    /* the groups one package belongs to (card menu "Groups…") */
    setPackGroups(userId, packId, groupIds) {
      add(userId, packId);
      const mineIds = new Set(db.all('SELECT id FROM pack_groups WHERE user_id=?', [userId]).map(r => r.id));
      db.run('DELETE FROM pack_group_items WHERE pack_id=? AND group_id IN (SELECT id FROM pack_groups WHERE user_id=?)', [packId, userId]);
      (groupIds || []).filter(g => mineIds.has(g)).forEach(g => {
        const pos = (db.get('SELECT MAX(position) AS m FROM pack_group_items WHERE group_id=?', [g]) || {}).m;
        db.run('INSERT OR IGNORE INTO pack_group_items(group_id, pack_id, position) VALUES(?,?,?)', [g, packId, (pos == null ? -1 : pos) + 1]);
        db.run('UPDATE pack_groups SET updated_at=? WHERE id=?', [now(), g]);
      });
      return true;
    }
  };
};
