'use strict';

// CP Plus product lines use multiple OEM platforms. This is only a known
// Dahua-compatible template; ONVIF discovery and custom URLs take precedence.
function knownPaths({ channel, stream }) {
  const subtype = stream === 'sub' ? 1 : 0;
  return [
    `/cam/realmonitor?channel=${channel}&subtype=${subtype}`,
    `/Streaming/Channels/${channel}${subtype === 0 ? '01' : '02'}`
  ];
}

module.exports = { knownPaths };
