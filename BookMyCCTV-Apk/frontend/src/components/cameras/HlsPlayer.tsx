import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { Camera } from '../../types/models';
import { API_BASE_URL } from '../../services/apiClient';
import { cameraStateMessage, stateLabel } from '../../utils/status';
type Props = { camera: Camera; onReconnect: () => void; onSnapshot: () => void };
export function HlsPlayer({ camera, onReconnect, onSnapshot }: Props) {
 const videoRef = useRef<HTMLVideoElement>(null); const hlsRef = useRef<Hls | null>(null); const [muted,setMuted]=useState(true);
 const onReconnectRef = useRef(onReconnect);
 useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);
 useEffect(() => {
  const video=videoRef.current; if(!video || !camera.online)return;
  const url=`${API_BASE_URL}/stream/${encodeURIComponent(camera.id)}/live.m3u8?t=${Date.now()}`;
  let cancelled=false;let reconnectRequested=false;let hls:Hls|null=null;
  const attach=async()=>{
   if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;void video.play().catch(()=>{});return;}
   const module=await import('hls.js');if(cancelled)return;const HlsPlayerClass=module.default;if(!HlsPlayerClass.isSupported())return;
   hls=new HlsPlayerClass({lowLatencyMode:true,liveSyncDurationCount:2,liveMaxLatencyDurationCount:5,backBufferLength:0,maxBufferLength:8,manifestLoadingTimeOut:8000,fragLoadingTimeOut:10000});hlsRef.current=hls;hls.loadSource(url);hls.attachMedia(video);hls.on(HlsPlayerClass.Events.MANIFEST_PARSED,()=>void video.play().catch(()=>{}));hls.on(HlsPlayerClass.Events.ERROR,(_event,data)=>{if(data.fatal&&data.type!==HlsPlayerClass.ErrorTypes.MEDIA_ERROR&&!reconnectRequested){reconnectRequested=true;onReconnectRef.current();}});
  };
  void attach();
  return()=>{cancelled=true;hls?.destroy();hlsRef.current=null;video.removeAttribute('src');video.load();};
 },[camera.id,camera.online]);
 return <div className={`camera-player ${camera.online?'is-online':'is-offline'}`}><video ref={videoRef} playsInline muted={muted} aria-label={`${camera.name} live video`} />{!camera.online&&<div className="player-state"><span className="state-ring"/><strong>{stateLabel(camera.state)}</strong><span>{cameraStateMessage(camera)}</span></div>}<div className="player-overlay"><div><strong>{camera.name}</strong><small>{camera.brand} · CH {camera.channel}</small></div><span className={`live-pill ${camera.online?'':'live-pill-off'}`}>{camera.online?'LIVE':'OFFLINE'}</span></div><div className="player-controls"><button aria-label="Play or pause" title={camera.online?'Play or pause':'Live video unavailable'} disabled={!camera.online} onClick={()=>{const v=videoRef.current;if(!v)return;if(v.paused)void v.play().catch(()=>{});else v.pause();}}>▶</button><button aria-label={muted?'Unmute':'Mute'} title={camera.online?(muted?'Unmute':'Mute'):'Audio unavailable'} disabled={!camera.online} onClick={()=>setMuted(v=>!v)}>{muted?'◖':'♫'}</button><span className="control-spacer"/><button aria-label="Snapshot" title={camera.online?'Download snapshot':'Snapshot unavailable'} disabled={!camera.online} onClick={onSnapshot}>▣</button><button aria-label="Reconnect" title="Reconnect" onClick={onReconnect}>↻</button><button aria-label="Fullscreen" title={camera.online?'Fullscreen':'Video unavailable'} disabled={!camera.online} onClick={()=>void videoRef.current?.parentElement?.requestFullscreen?.().catch(()=>{})}>⛶</button></div></div>;
}
