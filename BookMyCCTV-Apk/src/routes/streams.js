'use strict';

const path = require('path');
const express = require('express');
const streams = require('../services/streamService');

const router = express.Router();
router.get('/:id/:file', (req, res, next) => {
  if (!/^cam_[0-9a-f-]{36}$/.test(req.params.id) || !/^(live\.m3u8|seg_\d+\.ts)$/.test(req.params.file)) return res.sendStatus(404);
  const filePath = path.join(streams.directory(req.params.id), req.params.file);
  res.set('Cache-Control', req.params.file.endsWith('.m3u8') ? 'no-store' : 'private, max-age=5');
  res.type(req.params.file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
  res.sendFile(filePath, (error) => { if (error && !res.headersSent) next(); });
});

module.exports = router;
