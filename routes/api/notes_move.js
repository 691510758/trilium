"use strict";

const express = require('express');
const router = express.Router();
const sql = require('../../services/sql');
const utils = require('../../services/utils');
const audit_category = require('../../services/audit_category');
const auth = require('../../services/auth');
const sync_table = require('../../services/sync_table');

router.put('/:noteTreeId/moveTo/:parentNoteId', auth.checkApiAuth, async (req, res, next) => {
    const noteTreeId = req.params.noteTreeId;
    const parentNoteId = req.params.parentNoteId;

    const maxNotePos = await sql.getSingleValue('select max(note_pos) from notes_tree where note_pid = ? and is_deleted = 0', [parentNoteId]);
    const newNotePos = maxNotePos === null ? 0 : maxNotePos + 1;

    const now = utils.nowTimestamp();

    await sql.doInTransaction(async () => {
        await sql.execute("update notes_tree set note_pid = ?, note_pos = ?, date_modified = ? where note_tree_id = ?",
            [parentNoteId, newNotePos, now, noteTreeId]);

        await sync_table.addNoteTreeSync(noteTreeId);
        await sql.addAudit(audit_category.CHANGE_PARENT, utils.browserId(req), null, null, parentNoteId);
    });

    res.send({});
});

router.put('/:noteTreeId/moveBefore/:beforeNoteTreeId', async (req, res, next) => {
    const noteTreeId = req.params.noteTreeId;
    const beforeNoteTreeId = req.params.beforeNoteTreeId;

    const beforeNote = await sql.getSingleResult("select * from notes_tree where note_tree_id = ?", [beforeNoteTreeId]);

    if (beforeNote) {
        await sql.doInTransaction(async () => {
            // we don't change date_modified so other changes are prioritized in case of conflict
            await sql.execute("update notes_tree set note_pos = note_pos + 1 where note_pid = ? and note_pos >= ? and is_deleted = 0",
                [beforeNote.note_pid, beforeNote.note_pos]);

            const now = utils.nowTimestamp();

            await sql.execute("update notes_tree set note_pid = ?, note_pos = ?, date_modified = ? where note_tree_id = ?",
                [beforeNote.note_pid, beforeNote.note_pos, now, noteTreeId]);

            await sync_table.addNoteTreeSync(noteTreeId);
            await sync_table.addNoteReorderingSync(beforeNote.note_pid);
            await sql.addAudit(audit_category.CHANGE_POSITION, utils.browserId(req), beforeNote.note_pid);
        });

        res.send({});
    }
    else {
        res.status(500).send("Before note " + beforeNoteTreeId + " doesn't exist.");
    }
});

router.put('/:noteTreeId/moveAfter/:afterNoteTreeId', async (req, res, next) => {
    const noteTreeId = req.params.noteTreeId;
    const afterNoteTreeId = req.params.afterNoteTreeId;

    const afterNote = await sql.getSingleResult("select * from notes_tree where note_tree_id = ?", [afterNoteTreeId]);

    if (afterNote) {
        await sql.doInTransaction(async () => {
            // we don't change date_modified so other changes are prioritized in case of conflict
            await sql.execute("update notes_tree set note_pos = note_pos + 1 where note_pid = ? and note_pos > ? and is_deleted = 0",
                [afterNote.note_pid, afterNote.note_pos]);

            const now = utils.nowTimestamp();

            await sql.execute("update notes_tree set note_pid = ?, note_pos = ?, date_modified = ? where note_tree_id = ?",
                [afterNote.note_pid, afterNote.note_pos + 1, now, noteTreeId]);

            await sync_table.addNoteTreeSync(noteTreeId);
            await sync_table.addNoteReorderingSync(afterNote.note_pid);
            await sql.addAudit(audit_category.CHANGE_POSITION, utils.browserId(req), afterNote.note_pid);
        });

        res.send({});
    }
    else {
        res.status(500).send("After note " + afterNoteTreeId + " doesn't exist.");
    }
});

router.put('/:noteTreeId/expanded/:expanded', async (req, res, next) => {
    const noteTreeId = req.params.noteTreeId;
    const expanded = req.params.expanded;

    await sql.doInTransaction(async () => {
        await sql.execute("update notes_tree set is_expanded = ? where note_tree_id = ?", [expanded, noteTreeId]);
    });

    res.send({});
});

module.exports = router;