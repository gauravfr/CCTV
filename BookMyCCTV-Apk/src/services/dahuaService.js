'use strict';

function pathFor({ channel, stream }) {
  return `/cam/realmonitor?channel=${channel}&subtype=${stream === 'sub' ? 1 : 0}`;
}

module.exports = { pathFor };
