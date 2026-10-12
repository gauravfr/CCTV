import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { ToastProvider } from './providers/ToastProvider';
import { AppShell } from '../components/layout/AppShell';
const LoginPage=lazy(()=>import('../pages/LoginPage').then(m=>({default:m.LoginPage})));
const DashboardPage=lazy(()=>import('../pages/DashboardPage').then(m=>({default:m.DashboardPage})));
const DevicesPage=lazy(()=>import('../pages/DevicesPage').then(m=>({default:m.DevicesPage})));
const DeviceDetailsPage=lazy(()=>import('../pages/DeviceDetailsPage').then(m=>({default:m.DeviceDetailsPage})));
const LiveViewPage=lazy(()=>import('../pages/LiveViewPage').then(m=>({default:m.LiveViewPage})));
const EventsPage=lazy(()=>import('../pages/EventsPage').then(m=>({default:m.EventsPage})));
const SettingsPage=lazy(()=>import('../pages/SettingsPage').then(m=>({default:m.SettingsPage})));
function RequireAuth(){const {session,loading}=useAuth();const location=useLocation();if(loading)return <div className="loading-screen">Loading Sentinel…</div>;if(!session?.authenticated)return <Navigate to="/login" replace state={{from:location.pathname}}/>;return <Outlet/>;}
export function App(){return <ToastProvider><Suspense fallback={<div className="loading-screen">Loading Sentinel…</div>}><Routes><Route path="/login" element={<LoginPage/>}/><Route element={<RequireAuth/>}><Route element={<AppShell/>}><Route index element={<DashboardPage/>}/><Route path="devices" element={<DevicesPage/>}/><Route path="devices/:id" element={<DeviceDetailsPage/>}/><Route path="live" element={<LiveViewPage/>}/><Route path="events" element={<EventsPage/>}/><Route path="settings" element={<SettingsPage/>}/></Route></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense></ToastProvider>;}
