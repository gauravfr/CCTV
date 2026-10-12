'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const resolved = { ffmpeg: null, ffprobe: null };

function cleanConfiguredPath(value) {
  const text = String(value || '').trim();
  return text.replace(/^(["'])(.*)\1$/, '$2');
}

function findWingetCandidates(executable) {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local'));
  if (!localAppData) return [];
  const candidates = [path.join(localAppData, 'Microsoft', 'WinGet', 'Links', `${executable}.exe`)];
  const packagesRoot = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  let packages = [];
  try { packages = fs.readdirSync(packagesRoot, { withFileTypes: true }); } catch { return candidates; }
  for (const entry of packages) {
    if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith('gyan.ffmpeg')) continue;
    const packageDir = path.join(packagesRoot, entry.name);
    let builds = [];
    try { builds = fs.readdirSync(packageDir, { withFileTypes: true }); } catch { continue; }
    for (const build of builds) {
      if (!build.isDirectory()) continue;
      candidates.push(path.join(packageDir, build.name, 'bin', `${executable}.exe`));
    }
  }
  return candidates;
}

function verify(candidate, executable) {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let errors = '';
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child;
    try { child = spawn(candidate, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { finish({ ready: false, reason: error.message }); return; }
    timer = setTimeout(() => { child.kill(); finish({ ready: false, reason: 'version check timed out' }); }, 10000);
    child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(0, 4000); });
    child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(0, 4000); });
    child.on('error', (error) => finish({ ready: false, reason: error.code === 'ENOENT' ? 'executable was not found' : error.message }));
    child.on('close', (code) => {
      const firstLine = (output || errors).split(/\r?\n/).find(Boolean) || '';
      const valid = code === 0 && firstLine.toLowerCase().startsWith(`${executable} version`);
      finish({ ready: valid, reason: valid ? null : `version check exited with code ${code}`, version: valid ? firstLine : null });
    });
  });
}

async function resolveOne(executable, envName) {
  const configured = cleanConfiguredPath(process.env[envName]);
  const candidates = [
    ...(configured ? [{ source: envName, value: configured }] : []),
    { source: 'system PATH', value: executable },
    ...findWingetCandidates(executable).map((value) => ({ source: 'WinGet Gyan.FFmpeg', value }))
  ];
  const seen = new Set();
  const failures = [];
  for (const candidate of candidates) {
    const key = candidate.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (path.isAbsolute(candidate.value) && !fs.existsSync(candidate.value)) {
      failures.push(`${candidate.source}: file not found at ${candidate.value}`);
      continue;
    }
    const check = await verify(candidate.value, executable);
    if (check.ready) return { ready: true, path: candidate.value, source: candidate.source, version: check.version };
    failures.push(`${candidate.source}: ${check.reason}`);
  }
  return { ready: false, path: null, source: null, version: null, reason: failures.join('; ') || 'no executable candidates were found' };
}

async function resolveExecutables() {
  const ffmpeg = await resolveOne('ffmpeg', 'FFMPEG_PATH');
  const ffprobe = await resolveOne('ffprobe', 'FFPROBE_PATH');
  resolved.ffmpeg = ffmpeg.path;
  resolved.ffprobe = ffprobe.path;
  return { ffmpeg, ffprobe };
}

function getExecutable(name) {
  if (!resolved[name]) throw new Error(`${name} has not passed the startup check`);
  return resolved[name];
}

module.exports = { resolveExecutables, getExecutable, findWingetCandidates };
