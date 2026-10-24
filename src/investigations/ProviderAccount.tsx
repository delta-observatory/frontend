import {useEffect,useRef,useState} from 'react';
import './product.css';
import type {ProviderStatus,ProviderLogin,ProviderName} from './desktop';
function storedChoice(provider:ProviderName){try{const value=localStorage.getItem('delta.provider-store.'+provider);return value===(provider==='claude'?'provider':'keyring')?value:'ephemeral';}catch{return 'ephemeral';}}
export function ProviderAccount({initialProvider,autoLogin=false}:{initialProvider?:ProviderName;autoLogin?:boolean}={}) {
 const bridge=window.deltaDesktop,started=useRef(false);
 const [status,setStatus]=useState<ProviderStatus|null>(null),[store,setStore]=useState(()=>storedChoice(initialProvider??'codex')),[code,setCode]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const provider=status?.provider??initialProvider??'codex',anthropic=provider==='claude';
 async function refresh(){if(!bridge)return;const next=await bridge.agent<ProviderStatus>('status');setStatus(next);if(next.credential_store)setStore(next.credential_store);}
 async function act(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function login(type:string,selected:ProviderName=provider){
  let storage=store;
  if(selected!==provider){const next=await bridge!.agent<ProviderStatus>('selectProvider',{provider:selected});setStatus(next);storage=next.credential_store??storedChoice(selected);setStore(storage);}
  const prepared=await bridge!.agent<ProviderStatus>('initialize',{credential_store:storage});
  if(prepared.login){setStatus(prepared);return;}
  if(prepared.account&&type!=='apiKey'){setStatus(prepared);setNotice('The stored provider account is connected.');return;}
  const result=await bridge!.agent<ProviderLogin>('login',{type,...(type==='apiKey'?{apiKey:key.trim()}:{})});setKey('');
  if(result.authUrl||result.verificationUrl){try{await bridge!.agent('openLogin');setNotice('Complete sign-in in your browser. Return here after approval.');}catch{setError('The browser did not open. Use Open provider login to try again.');}}
 }
 useEffect(()=>{
  if(!bridge)return;
  if(autoLogin&&initialProvider&&!started.current){started.current=true;void act(async()=>{await bridge.agent('selectProvider',{provider:initialProvider});await login(initialProvider==='claude'?'claude':'chatgpt',initialProvider);});}
  else void refresh().catch(e=>setError(e.message));
  return bridge.onAgentEvent(event=>{if(['login','account','connection'].includes(event.event)){void refresh().catch(e=>setError(e.message));if(event.event==='login'){setNotice(event.success?'Provider sign-in is complete.':'Provider sign-in did not complete.');if(event.error)setError(event.error);}}});
 },[bridge]);
 const blocked=busy||Boolean(status?.login)||Boolean(status?.session);
 return <section className="product-card provider-account"><h2>AI provider accounts</h2><p>Sign in with your OpenAI or Anthropic account.</p><p>Sign-in does not start an investigation or send investigation evidence.</p>
 {!bridge?<p className="product-notice">Open the desktop application to sign in to a provider.</p>:<>
 <div className="provider-choices"><button className={anthropic?'':'selected'} disabled={blocked} onClick={()=>void act(()=>login('chatgpt','codex'))}><strong>OpenAI</strong><span>Sign in with ChatGPT</span></button><button className={anthropic?'selected':''} disabled={blocked} onClick={()=>void act(()=>login('claude','claude'))}><strong>Anthropic</strong><span>Sign in with your Claude account</span></button></div>
 <div className="account-status"><span className={status?.account?'status-dot connected':'status-dot'}/><strong>{status?.account?`${anthropic?'Anthropic':'OpenAI'} account connected`:`${anthropic?'Anthropic':'OpenAI'} account is not connected`}</strong></div>
 {status?.account?.email&&<p>{status.account.email}</p>}{status?.account?.planType&&<p>Plan: {status.account.planType}</p>}
 <label className="schema-field">Credential storage<select disabled={busy||Boolean(status?.initialized)} value={store} onChange={e=>{setStore(e.target.value);try{localStorage.setItem('delta.provider-store.'+provider,e.target.value);}catch{/* The choice remains available for this page. */}}}><option value="ephemeral">Memory only</option>{anthropic?<option value="provider">Private provider profile</option>:<option value="keyring">Operating-system credential store</option>}</select></label>
 <p>{store==='ephemeral'?'Memory-only sign-in ends when the desktop application closes.':store==='provider'?'Claude Code stores credentials in a private profile on this computer. Delta does not read its OAuth tokens.':'The operating system stores provider credentials. Its credential service must be available.'}</p>
 {status?.initialized&&<p>Sign out of the provider before changing credential storage.</p>}
 {!status?.account&&!status?.login&&<details><summary>Other sign-in options</summary>{anthropic?<div className="product-actions"><button disabled={busy} onClick={()=>void act(()=>login('console'))}>Use Anthropic Console</button><button disabled={busy} onClick={()=>void act(()=>login('sso'))}>Use organization SSO</button></div>:<><button disabled={busy} onClick={()=>void act(()=>login('chatgptDeviceCode'))}>Use a device code</button><form onSubmit={e=>{e.preventDefault();void act(()=>login('apiKey'));}}><label className="schema-field">OpenAI API key<input type="password" value={key} autoComplete="off" spellCheck={false} onChange={e=>setKey(e.target.value)}/></label><button disabled={busy||!key.trim()}>Connect API key</button></form></>}</details>}
 {status?.login&&<div className="login-pending" role="status"><h3>Complete provider sign-in</h3>{status.login.userCode?<><p>Enter this code on the provider page.</p><strong className="device-code">{status.login.userCode}</strong></>:<p>Approve access in your browser. This page updates when sign-in completes.</p>}<div className="product-actions"><button disabled={busy} onClick={()=>void act(async()=>{await bridge.agent('openLogin');})}>Open provider login</button><button disabled={busy} onClick={()=>void act(async()=>{await bridge.agent('cancelLogin');})}>Cancel login</button></div>{anthropic&&<details><summary>Browser shows an authorization code</summary><form onSubmit={e=>{e.preventDefault();void act(async()=>{await bridge.agent('submitLoginCode',{code});setCode('');setNotice('The provider is checking the authorization code.');});}}><label className="schema-field">Authorization code<input type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy||!code.trim()}>Complete sign-in</button></form></details>}</div>}
 {status?.session&&<p className="product-notice">An investigation uses this account. Provider sign-out pauses and disconnects its agent.</p>}
 {status?.initialized&&<button disabled={busy} onClick={()=>void act(async()=>{await bridge.agent('logout');setNotice('The provider account is signed out.');})}>Sign out of provider</button>}
 {busy&&<p role="status">The provider operation is running.</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error-inline">{error}</p>}
 </>}<p>Delta runs Codex for OpenAI accounts and unmodified Claude Code for Anthropic accounts.</p><p>Provider eligibility and charges depend on your account. Investigation approval and consent are required before model use.</p></section>;
}
