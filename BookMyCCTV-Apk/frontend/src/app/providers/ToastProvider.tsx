import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
const ToastContext=createContext<(message:string)=>void>(()=>{});
export function ToastProvider({children}:{children:ReactNode}){const [message,setMessage]=useState('');useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(''),2600);return()=>window.clearTimeout(timer);},[message]);return <ToastContext.Provider value={setMessage}>{children}{message&&<div className="toast" role="status">{message}</div>}</ToastContext.Provider>}
export function useNotify(){return useContext(ToastContext)}
