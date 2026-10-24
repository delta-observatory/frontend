import {createRoot} from 'react-dom/client';
import {SignInGate} from '../src/SignIn';
import {session} from '../src/api/client';
import type {DesktopEvent,ProviderName,ProviderStatus} from '../src/investigations/desktop';
import '../src/styles.css';
import '../src/investigations/product.css';
import {applyCssTokens} from '../src/theme';
applyCssTokens(document.documentElement);
const listeners=new Set<(event:DesktopEvent)=>void>(),calls:string[]=[];
const fresh=(provider:ProviderName):ProviderStatus=>({provider,initialized:false,credential_store:null,account:null,session:null,campaign_id:null,login:null});
let selected:ProviderName='codex';
const accounts={codex:fresh('codex'),claude:fresh('claude')};
const emit=(event:DesktopEvent)=>listeners.forEach(fn=>fn(event));
window.fetch=async()=>new Response(JSON.stringify({anonymous:true}),{status:200,headers:{'Content-Type':'application/json'}});
window.deltaDesktop={
 signIn:async()=>({token:'fixture-workspace-token'}),signOut:async()=>{accounts.codex=fresh('codex');accounts.claude=fresh('claude');},
 settings:async<T,>()=>({}) as T,
 onAgentEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
 agent:async<T,>(action:string,params:unknown={})=>{
  const p=params as Record<string,string>;calls.push(action+(action==='login'?':'+p.type:''));let s=accounts[selected];let result:unknown;
  if(action==='selectProvider'){selected=p.provider as ProviderName;s=accounts[selected];result=s;}
  else if(action==='status')result=s;
  else if(action==='initialize'){s.initialized=true;s.credential_store=p.credential_store as ProviderStatus['credential_store'];result=s;}
  else if(action==='login'){s.login=p.type==='chatgptDeviceCode'?{type:p.type,verificationUrl:'https://example.invalid',userCode:'FIXTURE-CODE'}:{type:p.type,authUrl:'https://example.invalid',loginId:'fixture-login'};result=s.login;}
  else if(action==='cancelLogin'){s.login=null;result=s;}
  else if(action==='openLogin')result={opened:true};
  else if(action==='submitLoginCode'){s.login=null;s.account={type:'claude.ai',email:'fixture@example.invalid'};emit({event:'login',success:true});result={submitted:true};}
  else if(action==='logout'){accounts[selected]=fresh(selected);result=accounts[selected];}
  else throw new Error('Unexpected fixture action: '+action);
  return structuredClone(result) as T;
 }
};
Object.assign(window,{providerFixture:{calls,complete:()=>{const s=accounts[selected];s.login=null;s.account={type:'chatgpt',email:'fixture@example.invalid'};emit({event:'login',success:true});},fail:()=>{accounts[selected].login=null;emit({event:'login',success:false,error:'The provider refused access. Try again.'});},signOut:()=>session.signOut(),state:()=>structuredClone(accounts[selected])}});
createRoot(document.getElementById('root')!).render(<SignInGate><p>Workspace fixture</p></SignInGate>);
