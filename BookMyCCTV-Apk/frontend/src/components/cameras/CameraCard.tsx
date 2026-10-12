import { Link } from 'react-router-dom';
import type { Camera } from '../../types/models';
import { brandName, display, stateLabel } from '../../utils/status';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { HlsPlayer } from './HlsPlayer';
import { cameraApi } from '../../services/cameraApi';
type Props={camera:Camera;onEdit:(camera:Camera)=>void;onRemove:(camera:Camera)=>void;onChanged:()=>void;notify:(message:string)=>void};
export function CameraCard({camera,onEdit,onRemove,onChanged,notify}:Props){
 async function reconnect(){try{await cameraApi.reconnect(camera.id);notify('Reconnect started');onChanged();}catch(e){notify(e instanceof Error?e.message:'Reconnect failed');}}
 async function snapshot(){try{const blob=await cameraApi.snapshot(camera.id);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${camera.name.replace(/[^a-z0-9]+/gi,'-')}-${Date.now()}.jpg`;a.click();URL.revokeObjectURL(url);}catch(e){notify(e instanceof Error?e.message:'Snapshot unavailable');}}
 return <article className="camera-card"><HlsPlayer camera={camera} onReconnect={()=>void reconnect()} onSnapshot={()=>void snapshot()}/><div className="camera-card-body"><div className="camera-card-heading"><div><h3>{camera.name}</h3><p>{brandName(camera.brand)} · {camera.host} · CH {camera.channel}</p></div><Badge tone={camera.online?'success':camera.state==='reconnecting'?'warning':'danger'}>{stateLabel(camera.state)}</Badge></div><div className="camera-card-meta"><span>{display(camera.resolution)}</span><span>{display(camera.codec)}</span><span>{camera.fps?`${camera.fps} FPS`:'FPS —'}</span></div><div className="camera-card-actions"><Link className="text-link" to={`/devices/${encodeURIComponent(camera.id)}`}>Details →</Link><Button onClick={()=>onEdit(camera)}>Edit</Button><Button variant="danger" onClick={()=>onRemove(camera)}>Remove</Button></div></div></article>;
}
