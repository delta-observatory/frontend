import {useState,useSyncExternalStore,useEffect,useRef,createContext,useContext,type FormEvent,type ReactNode} from 'react';
import {session} from './api/client';
const SignInContext=createContext<()=>void>(()=>{});
export const useSignIn=()=>useContext(SignInContext);
export function SignInGate({children}:{children:ReactNode}) {
 const token=useSyncExternalStore(session.subscribe,session.token);
 const [guest,setGuest]=useState<boolean|null>(null),[prompt,setPrompt]=useState(false),[browsing,setBrowsing]=useState(()=>sessionStorage.getItem('delta.browsing')==='true');
 useEffect(()=>{if(token)return;let live=true;fetch('/gui-api/me',{cache:'no-store'}).then(r=>{if(live)setGuest(r.ok);},()=>{if(live)setGuest(false);});return()=>{live=false;};},[token]);
 if(!token&&guest===null)return <div className="signin"><p>Opening the observatory…</p></div>;
 const close=()=>{setPrompt(false);setBrowsing(true);sessionStorage.setItem('delta.browsing','true');};
 if(!token&&(!guest||(window.deltaDesktop&&!browsing)))return <SignIn onClose={guest?close:undefined}/>;
 return <SignInContext.Provider value={()=>setPrompt(true)}>{children}{prompt&&<SignIn onClose={close} overlay/>}</SignInContext.Provider>;
}
function SignIn({onClose,overlay=false}:{onClose?:()=>void;overlay?:boolean}) {
 const [value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[remember,setRemember]=useState(false),[show,setShow]=useState(false);
 const panel=useRef<HTMLFormElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLElement>('button,input')?.focus();return()=>previous?.focus();},[]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const res=await fetch('/api/me',{cache:'no-store',headers:{Authorization:`Bearer ${value.trim()}`}});if(res.ok)session.set(value.trim(),remember);else setError(res.status===401?'The workspace does not accept this token. Check the token and try again.':'The workspace is unavailable. Try again.');}catch{setError('The workspace is unreachable. Check the connection and try again.');}finally{setBusy(false);}}
 async function owner(){setBusy(true);setError('');try{const result=await window.deltaDesktop!.signIn();session.set(result.token,false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={`signin${overlay?' signin-overlay':''}`} role="dialog" aria-modal="true" aria-label="Sign in to Delta Observatory" onKeyDown={e=>{if(e.key==='Escape'&&onClose&&!busy)onClose();if(e.key==='Tab'){const focusable=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary')??[]);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><form ref={panel} onSubmit={submit}>
 <span className="brand">DELTA OBSERVATORY</span><h1>Open your workspace</h1><p>Plan an investigation. Inspect its evidence. Keep control of each decision.</p>
 {window.deltaDesktop?<><button type="button" className="primary-action" disabled={busy} onClick={()=>void owner()}>{busy?'Opening…':'Continue as workspace owner'}</button><p className="note">This desktop uses your local workspace. Provider login is available in Settings.</p></>:<><label htmlFor="token">Workspace access token</label><div className="token-field"><input id="token" type={show?'text':'password'} autoComplete="current-password" value={value} onChange={e=>setValue(e.target.value)} placeholder="dlt_…" spellCheck={false}/><button type="button" aria-label={show?'Hide token':'Show token'} onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></div><label className="signin-check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember this browser</label><p className="note">Use the access token from your workspace owner. This is separate from your ChatGPT account.</p><button className="primary-action" type="submit" disabled={busy||!value.trim()}>{busy?'Checking…':'Sign in'}</button></>}
 {error&&<p role="alert" className="err">{error}</p>}{onClose&&<button type="button" disabled={busy} onClick={onClose}>Continue with read-only access</button>}
 <span className="note">A provider account is optional. Manual investigations remain available.</span>
 </form></div>;
}
