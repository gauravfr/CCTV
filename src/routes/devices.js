'use strict';
const express = require('express');
const demoProvider = require('../services/providers/demoProvider');
const router = express.Router();
router.get('/', (_req, res) => res.json(demoProvider.list()));
router.get('/:id', (req, res, next) => { const item = demoProvider.get(req.params.id); if (!item) return next(Object.assign(new Error('Device not found'), { status: 404 })); res.json(item); });
for (const section of ['health', 'channels', 'storage', 'events', 'network']) router.get('/:id/' + section, (req, res, next) => { const item = demoProvider.getSection(req.params.id, section); if (!item) return next(Object.assign(new Error('Device not found'), { status: 404 })); res.json(item); });
router.post('/:id/reconnect', (req, res, next) => { if (!demoProvider.get(req.params.id)) return next(Object.assign(new Error('Device not found'), { status: 404 })); res.status(202).json({ ok: true, simulated: true, message: 'Demo device is already online' }); });
module.exports = router;
